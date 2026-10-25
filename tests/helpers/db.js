// ตัวช่วยสำหรับ Integration test: ล้างฐานข้อมูล + สร้างผู้ใช้/สินค้า
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../src/lib/prisma');
const cache = require('../../src/lib/cache');
const { signToken } = require('../../src/middlewares/auth');
 
async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE payments, order_items, orders, cart_items, carts, products, users RESTART IDENTITY CASCADE',
  );
  // ล้าง cache รายการสินค้าที่ค้างจาก test ก่อนหน้า (DB ถูกล้างแล้วแต่ Redis ยังจำอยู่)
  await cache.bumpVersion('products');
}
 
// ใช้ hash ที่คำนวณครั้งเดียว (cost 4) เพื่อให้ test เร็ว
const FAST_HASH = bcrypt.hashSync('password123', 4);
 
async function createUser({ role = 'CUSTOMER', email } = {}) {
  const user = await prisma.user.create({
    data: {
      email: email || `${role.toLowerCase()}-${crypto.randomUUID()}@test.local`,
      passwordHash: FAST_HASH,
      name: `${role} user`,
      role,
    },
  });
  return { user, token: signToken(user), auth: { Authorization: `Bearer ${signToken(user)}` } };
}
 
async function createProduct(overrides = {}) {
  return prisma.product.create({
    data: {
      name: `Product ${crypto.randomUUID().slice(0, 8)}`,
      price: '100.00',
      stock: 10,
      category: 'sensors',
      ...overrides,
    },
  });
}
 
module.exports = { prisma, resetDb, createUser, createProduct };
