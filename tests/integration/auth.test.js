// Integration test: สมัคร / เข้าสู่ระบบ / ดูโปรไฟล์ ผ่าน HTTP จริงด้วย Supertest
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma, resetDb, createUser } = require('../helpers/db');
const env = require('../../src/config/env');

const app = createApp();
const CREDENTIALS = { email: 'Alice@Test.local', password: 'password123', name: 'Alice' };

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /api/v1/auth/register', () => {
  test('201: สร้างผู้ใช้ใหม่ ไม่ส่ง passwordHash กลับ และเก็บอีเมลเป็นตัวพิมพ์เล็ก', async () => {
    // Act
    const res = await request(app).post('/api/v1/auth/register').send(CREDENTIALS);

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'alice@test.local', name: 'Alice', role: 'CUSTOMER' });
    expect(res.body.data).not.toHaveProperty('passwordHash');
    expect(res.body.data).not.toHaveProperty('password');
  });

  test('201: ส่ง role: ADMIN มาก็ยังได้เป็น CUSTOMER (กัน Privilege escalation)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...CREDENTIALS, role: 'ADMIN' });

    expect(res.body.data.role).toBe('CUSTOMER');
    expect((await prisma.user.findUnique({ where: { email: 'alice@test.local' } })).role).toBe('CUSTOMER');
  });

  test('409: อีเมลซ้ำ (ต่างแค่ตัวพิมพ์ใหญ่เล็กก็ถือว่าซ้ำ)', async () => {
    await request(app).post('/api/v1/auth/register').send(CREDENTIALS);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...CREDENTIALS, email: 'ALICE@test.local' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test.each([
    ['อีเมลไม่ถูกรูปแบบ', { email: 'not-an-email' }],
    ['รหัสผ่านสั้นกว่า 8 ตัว', { password: 'short' }],
    ['ไม่ส่งชื่อ', { name: '' }],
  ])('400: %s', async (_label, override) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...CREDENTIALS, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('400: รหัสผ่านไทยยาวเกิน 72 ไบต์ (bcrypt ตัดทิ้ง -> ต้องปฏิเสธ ไม่ใช่รับแล้วตัด)', async () => {
    // ภาษาไทย 1 ตัวอักษร = 3 ไบต์ (UTF-8) -> 25 ตัวอักษร = 75 ไบต์
    const password = 'ก'.repeat(25);
    expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThan(72);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...CREDENTIALS, password });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error.details)).toMatch(/72 bytes/);
  });

  test('400: Body ไม่ใช่ JSON ที่ถูกต้อง -> INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"email": broken');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(CREDENTIALS);
  });

  test('200: คืน Token ที่ใช้เรียก Endpoint ที่ต้องล็อกอินได้', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@test.local', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer' });
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(me.body.data.email).toBe('alice@test.local');
  });

  test('200: อีเมลตัวพิมพ์ใหญ่ก็ล็อกอินได้', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ALICE@TEST.LOCAL', password: 'password123' });
    expect(res.status).toBe(200);
  });

  test('401: รหัสผิดและอีเมลไม่มีในระบบ ได้ข้อความเดียวกัน (ไม่บอกว่าอีเมลไหนมีอยู่)', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@test.local', password: 'wrong-password' });
    const noUser = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.local', password: 'wrong-password' });

    expect(wrongPassword.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(noUser.body).toEqual(wrongPassword.body);
  });

  test('400: ไม่ส่งรหัสผ่าน', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'alice@test.local' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me', () => {
  test('200: คืนโปรไฟล์ของเจ้าของ Token', async () => {
    const alice = await createUser();
    const res = await request(app).get('/api/v1/auth/me').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: alice.user.id, email: alice.user.email, role: 'CUSTOMER' });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  test('401: ไม่ส่ง Header เลย', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test.each([
    ['Token ขยะ', 'Bearer not.a.jwt'],
    ['Scheme ผิด', 'Basic abcdef'],
    ['ไม่มี Token หลัง Bearer', 'Bearer'],
  ])('401: %s', async (_label, header) => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', header);
    expect(res.status).toBe(401);
  });

  test('401: Token ปลอม (เซ็นด้วย secret อื่น) -> Invalid token', async () => {
    const alice = await createUser();
    const forged = jwt.sign({ role: 'ADMIN' }, 'attacker-secret', { subject: alice.user.id, algorithm: 'HS256' });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid token');
  });

  test('401: Token หมดอายุ -> Token expired', async () => {
    const alice = await createUser();
    const expired = jwt.sign({ role: 'CUSTOMER' }, env.jwt.secret, {
      subject: alice.user.id,
      algorithm: 'HS256',
      expiresIn: '-1s',
    });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Token expired');
  });

  test('404: Token ถูกต้องแต่ผู้ใช้ถูกลบไปแล้ว', async () => {
    const alice = await createUser();
    await prisma.user.delete({ where: { id: alice.user.id } });

    const res = await request(app).get('/api/v1/auth/me').set(alice.auth);

    expect(res.status).toBe(404);
  });
});

describe('Endpoint พื้นฐานของระบบ', () => {
  test('GET /health -> 200 และบอกสถานะฐานข้อมูล', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', services: { database: 'up' } });
  });

  test('URL ที่ไม่มี -> 404 ROUTE_NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  test('ไม่บอกผู้โจมตีว่าใช้ Express (ไม่มี X-Powered-By) และมี Security Headers ของ helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).not.toHaveProperty('x-powered-by');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('GET /openapi.json -> สเปก OpenAPI ที่ครอบคลุมทุกเส้นทางของ API', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.servers[0].url).toBe('/api/v1');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/register',
        '/auth/login',
        '/auth/me',
        '/products',
        '/products/{id}',
        '/cart',
        '/cart/{itemId}',
        '/orders',
        '/orders/{id}',
        '/orders/{id}/pay',
        '/orders/{id}/cancel',
        '/orders/{id}/status',
      ]),
    );
    expect(res.body.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  test('GET /api-docs -> หน้า Swagger UI', async () => {
    const res = await request(app).get('/api-docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/swagger-ui/i);
  });
});
