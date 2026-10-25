// Integration test: ตะกร้าสินค้า — upsert, ตรวจสต็อก, IDOR
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma, resetDb, createUser, createProduct } = require('../helpers/db');
const { MAX_QTY_PER_ITEM } = require('../../src/services/cart.service');

const app = createApp();
let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  alice = await createUser();
  bob = await createUser();
});
afterAll(() => prisma.$disconnect());

const addToCart = (user, productId, quantity) =>
  request(app).post('/api/v1/cart').set(user.auth).send({ productId, quantity });

describe('GET /api/v1/cart', () => {
  test('200: ผู้ใช้ใหม่ได้ตะกร้าว่าง ยอดรวม 0.00 (ไม่ใช่ 404)', async () => {
    const res = await request(app).get('/api/v1/cart').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], itemCount: 0, total: '0.00' });
  });

  test('401: ต้องล็อกอิน', async () => {
    expect((await request(app).get('/api/v1/cart')).status).toBe(401);
  });

  test('200: คิดยอดรวมจากหลายรายการถูกต้อง', async () => {
    const pico = await createProduct({ price: '249.00', stock: 10 });
    const dht = await createProduct({ price: '159.50', stock: 10 });
    await addToCart(alice, pico.id, 2);
    await addToCart(alice, dht.id, 1);

    const res = await request(app).get('/api/v1/cart').set(alice.auth);

    expect(res.body.data.total).toBe('657.50');
    expect(res.body.data.itemCount).toBe(3);
    expect(res.body.data.items.map((i) => i.subtotal)).toEqual(['498.00', '159.50']);
  });

  test('200: บอกว่ารายการไหนสั่งไม่ได้ (available) เมื่อสต็อกลดลงภายหลัง', async () => {
    const p = await createProduct({ stock: 10 });
    await addToCart(alice, p.id, 5);
    await prisma.product.update({ where: { id: p.id }, data: { stock: 1 } });

    const res = await request(app).get('/api/v1/cart').set(alice.auth);

    expect(res.body.data.items[0]).toMatchObject({ quantity: 5, stock: 1, available: false });
  });
});

describe('POST /api/v1/cart (เพิ่มสินค้า — Upsert)', () => {
  test('201: เพิ่มสินค้าใหม่ลงตะกร้า', async () => {
    const p = await createProduct({ price: '100.00', stock: 10 });

    const res = await addToCart(alice, p.id, 2);

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({ productId: p.id, quantity: 2, subtotal: '200.00' });
  });

  test('201: เพิ่มสินค้าเดิมซ้ำ -> บวกจำนวนเพิ่ม ไม่สร้างรายการใหม่ (Upsert)', async () => {
    const p = await createProduct({ stock: 10 });
    await addToCart(alice, p.id, 2);

    const res = await addToCart(alice, p.id, 3);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(5);
  });

  test('201: ไม่ส่ง quantity -> ใช้ค่าเริ่มต้น 1', async () => {
    const p = await createProduct({ stock: 10 });
    const res = await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: p.id });
    expect(res.body.data.items[0].quantity).toBe(1);
  });

  test('409: สต็อกไม่พอ -> details บอกจำนวนที่ขอและที่มี', async () => {
    const p = await createProduct({ stock: 3 });

    const res = await addToCart(alice, p.id, 5);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({ productId: p.id, requested: 5, available: 3 });
  });

  test('409: ยอดรวมหลังบวกเพิ่มเกินสต็อก (ตรวจยอดรวม ไม่ใช่แค่ครั้งนี้)', async () => {
    const p = await createProduct({ stock: 5 });
    await addToCart(alice, p.id, 3);

    const res = await addToCart(alice, p.id, 3);

    expect(res.status).toBe(409);
    expect(res.body.error.details.requested).toBe(6);
  });

  test(`400: จำนวนรวมต่อรายการเกิน ${MAX_QTY_PER_ITEM} ชิ้น`, async () => {
    const p = await createProduct({ stock: 1000 });
    await addToCart(alice, p.id, 60);

    const res = await addToCart(alice, p.id, 50);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(new RegExp(String(MAX_QTY_PER_ITEM)));
  });

  test('404: สินค้าไม่มีอยู่ หรือถูกปิดขาย (isActive = false)', async () => {
    const inactive = await createProduct({ isActive: false, stock: 10 });

    expect((await addToCart(alice, '11111111-1111-4111-8111-111111111111', 1)).status).toBe(404);
    expect((await addToCart(alice, inactive.id, 1)).status).toBe(404);
  });

  test.each([
    ['productId ไม่ใช่ UUID', { productId: 'abc', quantity: 1 }],
    ['quantity เป็น 0', { quantity: 0 }],
    ['quantity ติดลบ', { quantity: -1 }],
    ['quantity ไม่ใช่จำนวนเต็ม', { quantity: 1.5 }],
    ['quantity เกิน 99', { quantity: 100 }],
  ])('400: %s', async (_label, override) => {
    const p = await createProduct({ stock: 1000 });
    const res = await request(app)
      .post('/api/v1/cart')
      .set(alice.auth)
      .send({ productId: p.id, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('ตะกร้าของแต่ละคนแยกกัน', async () => {
    const p = await createProduct({ stock: 10 });
    await addToCart(alice, p.id, 2);

    const bobCart = await request(app).get('/api/v1/cart').set(bob.auth);

    expect(bobCart.body.data.items).toHaveLength(0);
  });
});

describe('PATCH /api/v1/cart/:itemId (แก้จำนวน)', () => {
  let product;
  let itemId;

  beforeEach(async () => {
    product = await createProduct({ price: '100.00', stock: 10 });
    const res = await addToCart(alice, product.id, 2);
    itemId = res.body.data.items[0].id;
  });

  test('200: ตั้งจำนวนใหม่ (แทนที่ ไม่ใช่บวกเพิ่ม)', async () => {
    const res = await request(app).patch(`/api/v1/cart/${itemId}`).set(alice.auth).send({ quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ quantity: 5, subtotal: '500.00' });
  });

  test('409: ตั้งจำนวนเกินสต็อก', async () => {
    const res = await request(app).patch(`/api/v1/cart/${itemId}`).set(alice.auth).send({ quantity: 11 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('404: IDOR — แก้รายการในตะกร้าคนอื่นไม่ได้ และได้ 404 เหมือนของที่ไม่มีอยู่', async () => {
    const asBob = await request(app).patch(`/api/v1/cart/${itemId}`).set(bob.auth).send({ quantity: 1 });
    const missing = await request(app)
      .patch('/api/v1/cart/11111111-1111-4111-8111-111111111111')
      .set(bob.auth)
      .send({ quantity: 1 });

    expect(asBob.status).toBe(404);
    expect(asBob.body).toEqual(missing.body);
  });

  test('400: quantity เป็น 0 (ถ้าจะเอาออกให้ใช้ DELETE)', async () => {
    const res = await request(app).patch(`/api/v1/cart/${itemId}`).set(alice.auth).send({ quantity: 0 });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/cart/:itemId (เอาสินค้าออก)', () => {
  test('200: เอาออกแล้วตะกร้าว่าง ยอดรวมกลับเป็น 0.00', async () => {
    const p = await createProduct({ stock: 10 });
    const added = await addToCart(alice, p.id, 2);
    const itemId = added.body.data.items[0].id;

    const res = await request(app).delete(`/api/v1/cart/${itemId}`).set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], itemCount: 0, total: '0.00' });
  });

  test('404: IDOR — ลบรายการของคนอื่นไม่ได้', async () => {
    const p = await createProduct({ stock: 10 });
    const added = await addToCart(alice, p.id, 1);
    const itemId = added.body.data.items[0].id;

    expect((await request(app).delete(`/api/v1/cart/${itemId}`).set(bob.auth)).status).toBe(404);
    expect(await prisma.cartItem.count({ where: { id: itemId } })).toBe(1);
  });

  test('400: itemId ไม่ใช่ UUID', async () => {
    expect((await request(app).delete('/api/v1/cart/not-a-uuid').set(alice.auth)).status).toBe(400);
  });
});
