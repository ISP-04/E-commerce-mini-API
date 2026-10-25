// Integration test: ค้นหา/กรอง/แบ่งหน้าสินค้า, สิทธิ์ Admin, Soft delete, Cache header
const request = require('supertest');
const { createApp } = require('../../src/app');
const cache = require('../../src/lib/cache');
const { prisma, resetDb, createUser, createProduct } = require('../helpers/db');

const app = createApp();
// Test ของ X-Cache รันเฉพาะเมื่อมี Redis (ไม่มีก็ข้าม — ระบบยังทำงานได้แบบ BYPASS)
const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

let admin;
let customer;

beforeAll(() => cache.connect());
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  customer = await createUser();
});
afterAll(async () => {
  await cache.disconnect();
  await prisma.$disconnect();
});

const NEW_PRODUCT = {
  name: 'Raspberry Pi Pico W',
  description: 'RP2040 with Wi-Fi',
  price: '249.00',
  stock: 10,
  category: 'microcontrollers',
};

describe('GET /api/v1/products (ค้นหา กรอง แบ่งหน้า)', () => {
  beforeEach(async () => {
    await createProduct({ name: 'Pico W', price: '249.00', stock: 10, category: 'microcontrollers' });
    await createProduct({ name: 'DHT22 Sensor', price: '159.50', stock: 0, category: 'sensors' });
    await createProduct({ name: 'Breadboard', price: '59.00', stock: 100, category: 'prototyping' });
  });

  test('200: เรียกได้โดยไม่ต้องล็อกอิน พร้อม pagination', async () => {
    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 3, totalPages: 1 });
  });

  test('200: ค้นหาด้วย q ไม่สนตัวพิมพ์ใหญ่เล็ก และค้นใน description ด้วย', async () => {
    expect((await request(app).get('/api/v1/products?q=pico')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/products?q=SENSOR')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/products?q=ไม่มีสินค้านี้')).body.data).toHaveLength(0);
  });

  test('200: กรองตามหมวด ช่วงราคา และสินค้าที่มีสต็อก', async () => {
    expect((await request(app).get('/api/v1/products?category=sensors')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/products?minPrice=100&maxPrice=200')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/products?inStock=true')).body.data).toHaveLength(2);
    expect((await request(app).get('/api/v1/products?inStock=false')).body.data).toHaveLength(1);
  });

  test('200: เรียงลำดับตามราคา', async () => {
    const asc = await request(app).get('/api/v1/products?sort=price_asc');
    const desc = await request(app).get('/api/v1/products?sort=price_desc');

    expect(asc.body.data.map((p) => p.price)).toEqual(['59.00', '159.50', '249.00']);
    expect(desc.body.data.map((p) => p.price)).toEqual(['249.00', '159.50', '59.00']);
  });

  test('200: แบ่งหน้า — หน้า 2 ได้ของที่ไม่ซ้ำกับหน้า 1', async () => {
    const page1 = await request(app).get('/api/v1/products?page=1&limit=2&sort=name');
    const page2 = await request(app).get('/api/v1/products?page=2&limit=2&sort=name');

    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data).toHaveLength(1);
    expect(page1.body.pagination.totalPages).toBe(2);
    const ids = [...page1.body.data, ...page2.body.data].map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
  });

  test.each([
    ['page=0', 'page=0'],
    ['limit เกิน 100', 'limit=101'],
    ['minPrice มากกว่า maxPrice', 'minPrice=500&maxPrice=100'],
    ['sort ที่ไม่รู้จัก', 'sort=random'],
  ])('400: %s', async (_label, query) => {
    const res = await request(app).get(`/api/v1/products?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('Soft delete: ลูกค้าไม่เห็นสินค้าที่ปิดขาย แต่ Admin เห็น', async () => {
    const hidden = await createProduct({ name: 'Discontinued', isActive: false });

    const asGuest = await request(app).get('/api/v1/products?limit=100');
    const asAdmin = await request(app).get('/api/v1/products?limit=100').set(admin.auth);

    expect(asGuest.body.data.map((p) => p.id)).not.toContain(hidden.id);
    expect(asAdmin.body.data.map((p) => p.id)).toContain(hidden.id);
  });

  test('401: ส่ง Token ที่ใช้ไม่ได้มาด้วย -> ไม่ปล่อยผ่านแบบ Guest เงียบ ๆ', async () => {
    const res = await request(app).get('/api/v1/products').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/products/:id', () => {
  test('200: ดูสินค้าชิ้นเดียว', async () => {
    const p = await createProduct({ name: 'Pico W', price: '249.00' });
    const res = await request(app).get(`/api/v1/products/${p.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: p.id, name: 'Pico W', price: '249.00', isActive: true });
  });

  test('404: สินค้าที่ปิดขาย ลูกค้าได้ 404 แต่ Admin ดูได้', async () => {
    const hidden = await createProduct({ isActive: false });

    expect((await request(app).get(`/api/v1/products/${hidden.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/products/${hidden.id}`).set(admin.auth)).status).toBe(200);
  });

  test('400: id ไม่ใช่ UUID / 404: UUID ที่ไม่มีอยู่', async () => {
    expect((await request(app).get('/api/v1/products/123')).status).toBe(400);
    expect((await request(app).get('/api/v1/products/11111111-1111-4111-8111-111111111111')).status).toBe(404);
  });
});

describe('POST /api/v1/products (Admin เท่านั้น)', () => {
  test('201: Admin สร้างสินค้าได้', async () => {
    const res = await request(app).post('/api/v1/products').set(admin.auth).send(NEW_PRODUCT);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: NEW_PRODUCT.name, price: '249.00', stock: 10, isActive: true });
  });

  test('403: ลูกค้าสร้างไม่ได้ / 401: ไม่ล็อกอินสร้างไม่ได้', async () => {
    expect((await request(app).post('/api/v1/products').set(customer.auth).send(NEW_PRODUCT)).status).toBe(403);
    expect((await request(app).post('/api/v1/products').send(NEW_PRODUCT)).status).toBe(401);
  });

  test.each([
    ['ราคาติดลบ', { price: '-1.00' }],
    ['ราคาทศนิยม 3 ตำแหน่ง', { price: '10.123' }],
    ['สต็อกติดลบ', { stock: -1 }],
    ['สต็อกไม่ใช่จำนวนเต็ม', { stock: 1.5 }],
    ['ไม่มีชื่อ', { name: '' }],
    ['ไม่มีหมวด', { category: '' }],
  ])('400: %s', async (_label, override) => {
    const res = await request(app)
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ ...NEW_PRODUCT, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PUT /api/v1/products/:id และ DELETE (Soft delete)', () => {
  test('200: แก้ไขบางฟิลด์ได้ ฟิลด์อื่นคงเดิม', async () => {
    const p = await createProduct({ name: 'Old name', price: '100.00', stock: 5 });

    const res = await request(app).put(`/api/v1/products/${p.id}`).set(admin.auth).send({ price: '120.00' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Old name', price: '120.00', stock: 5 });
  });

  test('400: ส่ง Body ว่าง (ไม่ระบุว่าจะแก้อะไร)', async () => {
    const p = await createProduct();
    const res = await request(app).put(`/api/v1/products/${p.id}`).set(admin.auth).send({});
    expect(res.status).toBe(400);
  });

  test('403/401: ลูกค้าและคนไม่ล็อกอินแก้ไขไม่ได้', async () => {
    const p = await createProduct();
    expect((await request(app).put(`/api/v1/products/${p.id}`).set(customer.auth).send({ stock: 1 })).status).toBe(403);
    expect((await request(app).put(`/api/v1/products/${p.id}`).send({ stock: 1 })).status).toBe(401);
  });

  test('204: DELETE เป็น Soft delete — แถวยังอยู่แต่ isActive = false', async () => {
    const p = await createProduct();

    const res = await request(app).delete(`/api/v1/products/${p.id}`).set(admin.auth);

    expect(res.status).toBe(204);
    expect(await prisma.product.findUnique({ where: { id: p.id } })).toMatchObject({ isActive: false });
    expect((await request(app).get(`/api/v1/products/${p.id}`)).status).toBe(404);
  });

  test('404: แก้/ลบสินค้าที่ไม่มีอยู่', async () => {
    const missing = '11111111-1111-4111-8111-111111111111';
    expect((await request(app).put(`/api/v1/products/${missing}`).set(admin.auth).send({ stock: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/products/${missing}`).set(admin.auth)).status).toBe(404);
  });

  test('403: ลูกค้าลบไม่ได้', async () => {
    const p = await createProduct();
    expect((await request(app).delete(`/api/v1/products/${p.id}`).set(customer.auth)).status).toBe(403);
  });
});

describeWithRedis('X-Cache (Cache-Aside — ต้องมี REDIS_URL)', () => {
  test('ครั้งแรก MISS ครั้งที่สอง HIT และแก้ไขสินค้าแล้วกลับเป็น MISS', async () => {
    const p = await createProduct({ name: 'Cached' });
    const url = `/api/v1/products/${p.id}`;

    expect((await request(app).get(url)).headers['x-cache']).toBe('MISS');
    expect((await request(app).get(url)).headers['x-cache']).toBe('HIT');

    await request(app).put(url).set(admin.auth).send({ name: 'Changed' });

    const after = await request(app).get(url);
    expect(after.headers['x-cache']).toBe('MISS');
    expect(after.body.data.name).toBe('Changed');
  });

  test('รายการสินค้าก็ cache เหมือนกัน แต่ Admin ได้ BYPASS (เห็นข้อมูลล่าสุดเสมอ)', async () => {
    await createProduct();

    expect((await request(app).get('/api/v1/products')).headers['x-cache']).toBe('MISS');
    expect((await request(app).get('/api/v1/products')).headers['x-cache']).toBe('HIT');
    expect((await request(app).get('/api/v1/products').set(admin.auth)).headers['x-cache']).toBe('BYPASS');
  });
});
