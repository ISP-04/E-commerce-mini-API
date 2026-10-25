// จุดเด่นทางวิชาการ: พิสูจน์ว่าไม่มี Race Condition ตอนตัดสต็อก
// ลูกค้า 10 คนกด "สั่งซื้อ" สินค้าที่เหลือ 3 ชิ้น "พร้อมกัน" -> ต้องสำเร็จแค่ 3 คน และสต็อกไม่ติดลบ
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma, resetDb, createUser, createProduct } = require('../helpers/db');
 
const app = createApp();
const ADDRESS = 'Kasetsart University Chalermphrakiat, Sakon Nakhon';
 
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());
 
async function buyersWithCart(n, items) {
  const buyers = [];
  for (let i = 0; i < n; i += 1) {
    const u = await createUser();
    for (const { product, quantity } of items) {
      await request(app).post('/api/v1/cart').set(u.auth).send({ productId: product.id, quantity });
    }
    buyers.push(u);
  }
  return buyers;
}
 
test('10 คนแย่งซื้อสินค้า 3 ชิ้นพร้อมกัน -> สำเร็จ 3, ได้ 409 อีก 7, สต็อกเหลือ 0', async () => {
  const product = await createProduct({ stock: 3 });
  const buyers = await buyersWithCart(10, [{ product, quantity: 1 }]);
 
  const results = await Promise.all(
    buyers.map((u) => request(app).post('/api/v1/orders').set(u.auth).send({ shippingAddress: ADDRESS })),
  );
 
  const statuses = results.map((r) => r.status).sort();
  expect(statuses.filter((s) => s === 201)).toHaveLength(3);
  expect(statuses.filter((s) => s === 409)).toHaveLength(7);
  expect((await prisma.product.findUnique({ where: { id: product.id } })).stock).toBe(0);
  const sold = await prisma.orderItem.aggregate({ where: { productId: product.id }, _sum: { quantity: true } });
  expect(sold._sum.quantity).toBe(3);
});
 
test('ไม่เกิด Deadlock เมื่อหลายคนซื้อสินค้าหลายชิ้นที่ทับซ้อนกัน (ล็อกตามลำดับ id)', async () => {
  const a = await createProduct({ stock: 100 });
  const b = await createProduct({ stock: 100 });
  const c = await createProduct({ stock: 100 });
  // ใส่ตะกร้าคนละลำดับ เพื่อจำลองสถานการณ์ที่อาจเกิด Deadlock ถ้าล็อกไม่เรียงลำดับ
  const g1 = await buyersWithCart(4, [
    { product: a, quantity: 1 },
    { product: b, quantity: 1 },
    { product: c, quantity: 1 },
  ]);
  const g2 = await buyersWithCart(4, [
    { product: c, quantity: 1 },
    { product: b, quantity: 1 },
    { product: a, quantity: 1 },
  ]);
 
  const results = await Promise.all(
    [...g1, ...g2].map((u) => request(app).post('/api/v1/orders').set(u.auth).send({ shippingAddress: ADDRESS })),
  );
 
  expect(results.every((r) => r.status === 201)).toBe(true);
  const stocks = await prisma.product.findMany({ where: { id: { in: [a.id, b.id, c.id] } } });
  expect(stocks.map((p) => p.stock)).toEqual([92, 92, 92]);
});
 
test('กดสั่งซื้อซ้ำพร้อมกันจากตะกร้าเดียว -> ได้ Order เดียว (ล็อกตะกร้า)', async () => {
  const product = await createProduct({ stock: 10 });
  const [buyer] = await buyersWithCart(1, [{ product, quantity: 2 }]);
 
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(app).post('/api/v1/orders').set(buyer.auth).send({ shippingAddress: ADDRESS }),
    ),
  );
 
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 400)).toHaveLength(4); // ตะกร้าว่างแล้ว
  expect((await prisma.product.findUnique({ where: { id: product.id } })).stock).toBe(8);
});
 
test('ฐานข้อมูลปฏิเสธสต็อกติดลบ (CHECK constraint เป็นด่านสุดท้าย)', async () => {
  const product = await createProduct({ stock: 1 });
  await expect(prisma.product.update({ where: { id: product.id }, data: { stock: { decrement: 2 } } })).rejects.toThrow(
    /products_stock_non_negative|check constraint/i,
  );
});
