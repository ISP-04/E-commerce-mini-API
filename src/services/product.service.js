// สินค้า: ค้นหา/กรอง/แบ่งหน้า + จัดการโดย Admin (อ่านจาก PostgreSQL ผ่าน Prisma)
// Route และ Controller เดิมไม่ต้องแก้ เปลี่ยนแค่ชั้น Service นี้
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const serialize = require('./serializers');
 
// เรียงด้วย id เป็นลำดับรอง: ถ้าค่าแรกเท่ากัน ลำดับยังคงที่ (ไม่งั้นแบ่งหน้าแล้วสินค้าอาจซ้ำ/หาย)
const ORDER_BY = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
};
 
function buildWhere(query, { includeInactive }) {
  const where = {};
  if (!includeInactive) where.isActive = true;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.category) where.category = { equals: query.category, mode: 'insensitive' };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {};
    if (query.minPrice !== undefined) where.price.gte = query.minPrice;
    if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
  }
  if (query.inStock === true) where.stock = { gt: 0 };
  if (query.inStock === false) where.stock = 0;
  return where;
}
 
async function list(query, { includeInactive = false } = {}) {
  const where = buildWhere(query, { includeInactive });
  // $transaction([...]) ส่ง 2 คำสั่งไปพร้อมกัน ได้ทั้งจำนวนทั้งหมดและข้อมูลหน้าปัจจุบัน
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return {
    data: rows.map(serialize.product),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}
 
async function getById(id, { includeInactive = false } = {}) {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p || (!p.isActive && !includeInactive)) throw AppError.notFound('Product');
  return serialize.product(p);
}
 
async function create(data) {
  return serialize.product(await prisma.product.create({ data }));
}
 
async function update(id, data) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Product');
  return serialize.product(await prisma.product.update({ where: { id }, data }));
}
 
// Soft delete: ซ่อนสินค้าแทนการลบจริง เพราะ OrderItem เก่ายังอ้างอิงสินค้านี้อยู่
async function remove(id) {
  return update(id, { isActive: false });
}
 
module.exports = { list, getById, create, update, remove };
