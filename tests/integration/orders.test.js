const request = require('supertest');
const { createApp } = require('../../src/app');
const { bus, EVENTS } = require('../../src/lib/events');
const { prisma, resetDb, createUser, createProduct } = require('../helpers/db');
 
const app = createApp();
const ADDRESS = '99 Moo 1, Chiang Khruea, Mueang Sakon Nakhon 47000';
let alice;
let bob;
let admin;
 
beforeEach(async () => {
  await resetDb();
  alice = await createUser();
  bob = await createUser();
  admin = await createUser({ role: 'ADMIN' });
});
// ถอด listener ที่ test ติดไว้ ไม่ให้ค้างไปนับใน test ถัดไป
afterEach(() => {
  for (const event of Object.values(EVENTS)) bus.removeAllListeners(event);
});
afterAll(() => prisma.$disconnect());
 
async function placeOrder(user, items) {
  for (const { product, quantity } of items) {
    const r = await request(app).post('/api/v1/cart').set(user.auth).send({ productId: product.id, quantity });
    expect(r.status).toBe(201);
  }
  return request(app).post('/api/v1/orders').set(user.auth).send({ shippingAddress: ADDRESS });
}
const stockOf = async (id) => (await prisma.product.findUnique({ where: { id } })).stock;
 
describe('POST /api/v1/orders (สร้างคำสั่งซื้อ + ตัดสต็อก)', () => {
  test('201: ตัดสต็อก, ล้างตะกร้า, บันทึก snapshot ราคา, ปล่อย event', async () => {
    const pico = await createProduct({ name: 'Pico W', price: '249.00', stock: 10 });
    const dht = await createProduct({ name: 'DHT22', price: '159.50', stock: 3 });
    const created = jest.fn();
    const low = jest.fn();
    bus.on(EVENTS.ORDER_CREATED, created);
    bus.on(EVENTS.LOW_STOCK, low);
 
    const res = await placeOrder(alice, [
      { product: pico, quantity: 2 },
      { product: dht, quantity: 1 },
    ]);
 
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', totalAmount: '657.50', shippingAddress: ADDRESS });
    expect(res.body.data.items).toHaveLength(2);
    expect(await stockOf(pico.id)).toBe(8);
    expect(await stockOf(dht.id)).toBe(2);
    expect((await request(app).get('/api/v1/cart').set(alice.auth)).body.data.items).toHaveLength(0);
 
    // เปลี่ยนราคาสินค้าภายหลัง -> ราคาใน Order เดิมต้องไม่เปลี่ยน (Price snapshot)
    await prisma.product.update({ where: { id: pico.id }, data: { price: '999.00', name: 'Renamed' } });
    const order = await request(app).get(`/api/v1/orders/${res.body.data.id}`).set(alice.auth);
    expect(order.body.data.items.find((i) => i.productId === pico.id)).toMatchObject({
      productName: 'Pico W',
      unitPrice: '249.00',
      subtotal: '498.00',
    });
 
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ orderId: res.body.data.id, userId: alice.user.id }));
    expect(low).toHaveBeenCalledWith(expect.objectContaining({ productId: dht.id, remaining: 2 }));
  });

  test('400: ตะกร้าว่าง', async () => {
    const res = await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cart is empty/);
  });

  test('400: ที่อยู่สั้นเกินไป -> VALIDATION_ERROR (ไม่ตัดสต็อก)', async () => {
    const p = await createProduct({ stock: 5 });
    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: p.id, quantity: 1 });

    const res = await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: 'สั้น' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await stockOf(p.id)).toBe(5);
  });

  test('409: สต็อกไม่พอตอนสั่ง (ถูกคนอื่นซื้อไปก่อน) -> details บอก available', async () => {
    const p = await createProduct({ stock: 5 });
    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: p.id, quantity: 5 });
    // ลดสต็อกหลังใส่ตะกร้าแล้ว — ตัวตัดสินจริงคือตอนสร้าง Order
    await prisma.product.update({ where: { id: p.id }, data: { stock: 2 } });

    const res = await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details[0]).toMatchObject({ productId: p.id, requested: 5, available: 2 });
    expect(await stockOf(p.id)).toBe(2); // Transaction rollback -> สต็อกไม่เปลี่ยน
  });

  test('409: สินค้าถูกปิดขายหลังใส่ตะกร้า -> UNAVAILABLE', async () => {
    const p = await createProduct({ stock: 5 });
    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: p.id, quantity: 1 });
    await prisma.product.update({ where: { id: p.id }, data: { isActive: false } });

    const res = await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });

    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatchObject({ productId: p.id, reason: 'UNAVAILABLE' });
  });

  test('401: ไม่ส่ง Token', async () => {
    const res = await request(app).post('/api/v1/orders').send({ shippingAddress: ADDRESS });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/orders (รายการคำสั่งซื้อ)', () => {
  test('ลูกค้าเห็นแค่ของตัวเอง แต่ Admin เห็นของทุกคน', async () => {
    const p = await createProduct({ stock: 50 });
    await placeOrder(alice, [{ product: p, quantity: 1 }]);
    await placeOrder(bob, [{ product: p, quantity: 1 }]);

    const mine = await request(app).get('/api/v1/orders').set(alice.auth);
    const all = await request(app).get('/api/v1/orders').set(admin.auth);

    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].userId).toBe(alice.user.id);
    expect(all.body.data).toHaveLength(2);
  });

  test('กรองตามสถานะ และแบ่งหน้า', async () => {
    const p = await createProduct({ stock: 50 });
    const first = await placeOrder(alice, [{ product: p, quantity: 1 }]);
    await placeOrder(alice, [{ product: p, quantity: 1 }]);
    await request(app).post(`/api/v1/orders/${first.body.data.id}/cancel`).set(alice.auth);

    const pending = await request(app).get('/api/v1/orders?status=PENDING').set(alice.auth);
    const paged = await request(app).get('/api/v1/orders?page=1&limit=1').set(alice.auth);

    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0].status).toBe('PENDING');
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  test('status ที่ไม่มีในระบบ -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/v1/orders?status=NOPE').set(alice.auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/orders/:id', () => {
  test('เจ้าของดูได้ คนอื่นได้ 404 (IDOR ต้องไม่รู้ว่ามี Order นี้อยู่) Admin ดูได้', async () => {
    const p = await createProduct({ stock: 10 });
    const { body } = await placeOrder(alice, [{ product: p, quantity: 1 }]);
    const url = `/api/v1/orders/${body.data.id}`;

    expect((await request(app).get(url).set(alice.auth)).status).toBe(200);
    expect((await request(app).get(url).set(bob.auth)).status).toBe(404);
    expect((await request(app).get(url).set(admin.auth)).status).toBe(200);
  });

  test('id ไม่ใช่ UUID -> 400, UUID ที่ไม่มีอยู่ -> 404', async () => {
    expect((await request(app).get('/api/v1/orders/not-a-uuid').set(alice.auth)).status).toBe(400);
    const res = await request(app).get('/api/v1/orders/11111111-1111-4111-8111-111111111111').set(alice.auth);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/orders/:id/pay (ชำระเงินจำลอง)', () => {
  let order;
  let product;

  beforeEach(async () => {
    product = await createProduct({ price: '100.00', stock: 10 });
    order = (await placeOrder(alice, [{ product, quantity: 2 }])).body.data;
  });

  test('200: สถานะเป็น PAID, มี paidAt และ Payment SUCCESS + ปล่อย event ORDER_PAID', async () => {
    const paid = jest.fn();
    bus.on(EVENTS.ORDER_PAID, paid);

    const res = await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'CARD' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'PAID' });
    expect(res.body.data.paidAt).not.toBeNull();
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0]).toMatchObject({ method: 'CARD', status: 'SUCCESS', amount: '200.00' });
    expect(paid).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.id }));
  });

  test('402: ธนาคารปฏิเสธ (simulateFailure) -> บันทึก Payment FAILED แต่ Order ยัง PENDING', async () => {
    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/pay`)
      .set(alice.auth)
      .send({ method: 'CARD', simulateFailure: true });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_FAILED');
    const after = await request(app).get(`/api/v1/orders/${order.id}`).set(alice.auth);
    expect(after.body.data.status).toBe('PENDING');
    expect(after.body.data.payments[0]).toMatchObject({ status: 'FAILED' });
  });

  test('409: จ่ายซ้ำ (จ่ายแล้วจ่ายอีก)', async () => {
    await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'PROMPTPAY' });

    const again = await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'CARD' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_ORDER_STATE');
  });

  test('409: กดจ่ายพร้อมกัน 5 ครั้ง -> สำเร็จครั้งเดียว และมี Payment SUCCESS ใบเดียว', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'CARD' }),
      ),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } })).toBe(1);
  });

  test('404: จ่าย Order ของคนอื่นไม่ได้ (แม้เป็น Admin ก็จ่ายแทนไม่ได้)', async () => {
    expect((await request(app).post(`/api/v1/orders/${order.id}/pay`).set(bob.auth).send({ method: 'CARD' })).status).toBe(
      404,
    );
    expect(
      (await request(app).post(`/api/v1/orders/${order.id}/pay`).set(admin.auth).send({ method: 'CARD' })).status,
    ).toBe(404);
  });

  test('400: วิธีจ่ายเงินที่ไม่รองรับ', async () => {
    const res = await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'BITCOIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/orders/:id/cancel (ยกเลิกแล้วคืนสต็อก)', () => {
  test('200: PENDING -> CANCELLED และคืนสต็อกครบ', async () => {
    const p = await createProduct({ stock: 10 });
    const { body } = await placeOrder(alice, [{ product: p, quantity: 3 }]);
    expect(await stockOf(p.id)).toBe(7);

    const res = await request(app).post(`/api/v1/orders/${body.data.id}/cancel`).set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(await stockOf(p.id)).toBe(10);
  });

  test('409: จ่ายเงินแล้วยกเลิกเองไม่ได้ (ต้องให้ Admin ทำ)', async () => {
    const p = await createProduct({ stock: 10 });
    const { body } = await placeOrder(alice, [{ product: p, quantity: 1 }]);
    await request(app).post(`/api/v1/orders/${body.data.id}/pay`).set(alice.auth).send({ method: 'CARD' });

    const res = await request(app).post(`/api/v1/orders/${body.data.id}/cancel`).set(alice.auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_ORDER_STATE');
  });

  test('409: ยกเลิกซ้ำ -> สต็อกไม่ถูกคืน 2 รอบ', async () => {
    const p = await createProduct({ stock: 10 });
    const { body } = await placeOrder(alice, [{ product: p, quantity: 2 }]);
    await request(app).post(`/api/v1/orders/${body.data.id}/cancel`).set(alice.auth);

    const again = await request(app).post(`/api/v1/orders/${body.data.id}/cancel`).set(alice.auth);

    expect(again.status).toBe(409);
    expect(await stockOf(p.id)).toBe(10);
  });

  test('404: ยกเลิก Order ของคนอื่นไม่ได้', async () => {
    const p = await createProduct({ stock: 10 });
    const { body } = await placeOrder(alice, [{ product: p, quantity: 1 }]);
    expect((await request(app).post(`/api/v1/orders/${body.data.id}/cancel`).set(bob.auth)).status).toBe(404);
  });
});

describe('PATCH /api/v1/orders/:id/status (Admin)', () => {
  let order;
  let product;

  beforeEach(async () => {
    product = await createProduct({ stock: 10 });
    order = (await placeOrder(alice, [{ product, quantity: 2 }])).body.data;
  });

  const setStatus = (user, id, status) => request(app).patch(`/api/v1/orders/${id}/status`).set(user.auth).send({ status });

  test('200: PAID -> SHIPPED และปล่อย event ORDER_STATUS_CHANGED', async () => {
    await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'CARD' });
    const changed = jest.fn();
    bus.on(EVENTS.ORDER_STATUS_CHANGED, changed);

    const res = await setStatus(admin, order.id, 'SHIPPED');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SHIPPED');
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ from: 'PAID', to: 'SHIPPED' }));
  });

  test('200: Admin ยกเลิก Order ที่จ่ายแล้ว -> คืนสต็อก', async () => {
    await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'CARD' });
    expect(await stockOf(product.id)).toBe(8);

    const res = await setStatus(admin, order.id, 'CANCELLED');

    expect(res.status).toBe(200);
    expect(await stockOf(product.id)).toBe(10);
  });

  test('409: PENDING -> SHIPPED ข้ามขั้นไม่ได้', async () => {
    const res = await setStatus(admin, order.id, 'SHIPPED');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('409: SHIPPED เป็นสถานะปลายทาง เปลี่ยนต่อไม่ได้ และสต็อกไม่ถูกคืน', async () => {
    await request(app).post(`/api/v1/orders/${order.id}/pay`).set(alice.auth).send({ method: 'CARD' });
    await setStatus(admin, order.id, 'SHIPPED');

    const res = await setStatus(admin, order.id, 'CANCELLED');

    expect(res.status).toBe(409);
    expect(await stockOf(product.id)).toBe(8);
  });

  test('403: ลูกค้าเรียก Endpoint ของ Admin', async () => {
    const res = await setStatus(alice, order.id, 'CANCELLED');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('400: ตั้งสถานะเป็น PAID ผ่าน Endpoint นี้ไม่ได้ (ต้องผ่านการชำระเงิน)', async () => {
    const res = await setStatus(admin, order.id, 'PAID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('404: Order ที่ไม่มีอยู่', async () => {
    const res = await setStatus(admin, '11111111-1111-4111-8111-111111111111', 'CANCELLED');
    expect(res.status).toBe(404);
  });
});