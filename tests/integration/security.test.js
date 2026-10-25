// Integration test ด้านความปลอดภัย (WS10): Rate limit, ขนาดข้อมูล, Token หมดอายุระหว่างเชื่อมต่อ
// เปิด Rate limit เฉพาะไฟล์นี้ (ปิดไว้ใน test ไฟล์อื่น) จึงต้องโหลด module ใหม่หลังตั้ง env
const http = require('node:http');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const request = require('supertest');

jest.resetModules();
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_MAX = '5';
process.env.RATE_LIMIT_AUTH_MAX = '3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

const { createApp } = require('../../src/app');
const { attachWebSocket } = require('../../src/realtime/websocket');
const { signToken } = require('../../src/middlewares/auth');
const { globalLimiter, authLimiter } = require('../../src/middlewares/rateLimit');
const env = require('../../src/config/env');
const prisma = require('../../src/lib/prisma');
const { resetDb, createUser, createProduct } = require('../helpers/db');

const app = createApp();
// Limiter เป็น Singleton ของ process จึงนับข้ามกันระหว่าง test — ล้างตัวนับของ localhost ก่อนทุกกรณี
const LOCAL_KEYS = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];
const resetRateLimit = async () => {
  for (const key of LOCAL_KEYS) {
    await globalLimiter.resetKey(key);
    await authLimiter.resetKey(key);
  }
};
let server;
let wss;
let wsPort;

beforeAll(async () => {
  server = http.createServer(app);
  wss = attachWebSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  wsPort = server.address().port;
});

afterAll(async () => {
  wss.close();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  delete process.env.RATE_LIMIT_ENABLED;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.RATE_LIMIT_AUTH_MAX;
  delete process.env.RATE_LIMIT_WINDOW_MS;
});

beforeEach(async () => {
  await resetDb();
  await resetRateLimit();
});

describe('Rate limiting', () => {
  test('เปิดใช้งานจริงในไฟล์นี้ (ยืนยันว่า env ถูกอ่านใหม่)', () => {
    expect(env.rateLimit.enabled).toBe(true);
    expect(env.rateLimit.max).toBe(5);
  });

  test('ยิงเกินโควตา -> 429 RATE_LIMITED พร้อม Header มาตรฐาน', async () => {
    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await request(app).get('/api/v1/products')).status);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
    const limited = await request(app).get('/api/v1/products');
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers).toHaveProperty('ratelimit');
  });

  test('ปลอม X-Forwarded-For หลบ Rate limit ไม่ได้ (TRUST_PROXY_HOPS = 0)', async () => {
    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      // เปลี่ยน IP ปลอมทุกครั้ง — ถ้าแอปเชื่อ Header นี้ จะนับเป็นคนละคนและไม่โดนจำกัด
      statuses.push((await request(app).get('/api/v1/products').set('X-Forwarded-For', `203.0.113.${i}`)).status);
    }

    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
  });

  test('/auth/login มีโควตาเข้มกว่า (กัน Brute-force รหัสผ่าน)', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@test.local', password: `guess-${i}` });
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 401)).toHaveLength(3); // RATE_LIMIT_AUTH_MAX = 3
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });

  test('/health ไม่ถูกจำกัด (Load balancer ต้องเรียกได้ตลอด)', async () => {
    const statuses = [];
    for (let i = 0; i < 10; i += 1) statuses.push((await request(app).get('/health')).status);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});

describe('จำกัดขนาดข้อมูลที่รับเข้ามา', () => {
  test('413: Body เกิน 100kb -> PAYLOAD_TOO_LARGE', async () => {
    const alice = await createUser();
    const huge = { shippingAddress: 'x'.repeat(200 * 1024) };

    const res = await request(app).post('/api/v1/orders').set(alice.auth).send(huge);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('WebSocket: ข้อความเกิน 4KB -> ตัด connection แต่ Process ไม่ล่ม', async () => {
    // Server จะ log warning ของ error listener — เงียบไว้ให้ผลลัพธ์ test อ่านง่าย
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const alice = await createUser();
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${alice.token}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    const closed = new Promise((resolve) => ws.on('close', resolve));

    ws.send('x'.repeat(8 * 1024)); // maxPayload = 4KB

    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
    // Process ยังอยู่: ยังให้บริการ HTTP ได้ปกติ
    expect((await request(app).get('/health')).status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Max payload size exceeded/));
    warn.mockRestore();
  });
});

describe('Token หมดอายุระหว่างเชื่อมต่อ WebSocket', () => {
  test('ต่อด้วย Token ที่เหลืออายุสั้น -> ถูกตัดด้วยรหัส 4001 Token expired', async () => {
    const alice = await createUser();
    // Token เหลืออายุ 1 วินาที: ผ่าน Handshake ได้ แต่ Server ตั้งเวลาตัดไว้
    const shortLived = jwt.sign({ role: 'CUSTOMER', email: alice.user.email }, env.jwt.secret, {
      subject: alice.user.id,
      algorithm: 'HS256',
      expiresIn: '1s',
    });
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${shortLived}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const [code, reason] = await new Promise((resolve) => ws.on('close', (c, r) => resolve([c, r.toString()])));

    expect(code).toBe(4001);
    expect(reason).toBe('Token expired');
  }, 10000);

  test('Token ที่หมดอายุแล้ว -> ไม่ผ่าน Handshake เลย (401)', async () => {
    const alice = await createUser();
    const expired = jwt.sign({ role: 'CUSTOMER' }, env.jwt.secret, {
      subject: alice.user.id,
      algorithm: 'HS256',
      expiresIn: '-1s',
    });

    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${expired}`);
        ws.on('open', () => resolve(ws));
        ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
        ws.on('error', reject);
      }),
    ).rejects.toThrow(/401/);
  });
});

describe('ไม่รั่วข้อมูลภายในออกไปทาง Error', () => {
  test('ข้อผิดพลาดภายในไม่ส่ง stack trace หรือ Connection string ของฐานข้อมูลกลับไป', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const p = await createProduct();

    // ส่ง category ยาวเกินเพื่อให้ Validation ตีกลับ — คำตอบต้องไม่มีรายละเอียดภายใน
    const res = await request(app)
      .put(`/api/v1/products/${p.id}`)
      .set(admin.auth)
      .send({ category: 'x'.repeat(100) });

    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/postgresql:\/\//);
    expect(body).not.toMatch(/node_modules/);
    expect(body).not.toMatch(/at Object\./);
  });

  test('Token ของลูกค้าแก้ role เป็น ADMIN ไม่ได้ (Payload ถูกเซ็นไว้)', async () => {
    const alice = await createUser();
    const [header, payload] = alice.token.split('.');
    const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString());
    tampered.role = 'ADMIN';
    const forged = `${header}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${alice.token.split('.')[2]}`;

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${forged}`)
      .send({ name: 'Hacked', price: '1.00', stock: 1, category: 'x' });

    expect(res.status).toBe(401);
  });

  test('signToken ไม่ใส่ข้อมูลที่ไม่จำเป็นลงใน Token (ไม่มี passwordHash)', async () => {
    const alice = await createUser();
    const payload = JSON.parse(Buffer.from(signToken(alice.user).split('.')[1], 'base64url').toString());

    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'iat', 'role', 'sub']);
  });
});
