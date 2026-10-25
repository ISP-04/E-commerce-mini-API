// สินค้า: ค้นหา/กรอง/แบ่งหน้า + Redis cache (WS5) + จัดการโดย Admin
const crypto = require('node:crypto');
const prisma = require('../lib/prisma');
const cache = require('../lib/cache');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const serialize = require('./serializers');
 
const ORDER_BY = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
};
 
const productKey = (id) => `product:${id}`;
 
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
  const loader = async () => {
    const where = buildWhere(query, { includeInactive });
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
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  };
 
  // Admin เห็นสินค้าที่ปิดขายด้วย -> ไม่ cache เพื่อให้เห็นข้อมูลล่าสุดเสมอ
  if (includeInactive) return { value: await loader(), cache: 'BYPASS' };
 
  const version = await cache.getVersion('products');
  const hash = crypto.createHash('sha1').update(JSON.stringify(query)).digest('hex');
  return cache.remember(`products:list:v${version}:${hash}`, env.cacheTtl.productList, loader);
}
 
async function getById(id, { includeInactive = false } = {}) {
  const { value, cache: cacheStatus } = await cache.remember(productKey(id), env.cacheTtl.product, async () => {
    const p = await prisma.product.findUnique({ where: { id } });
    return p ? serialize.product(p) : null;
  });
  if (!value || (!value.isActive && !includeInactive)) throw AppError.notFound('Product');
  return { value, cache: cacheStatus };
}
 
async function invalidate(...ids) {
  await cache.del(...ids.map(productKey));
  await cache.bumpVersion('products');
}
 
async function create(data) {
  const p = await prisma.product.create({ data });
  await invalidate(p.id);
  return serialize.product(p);
}
 
async function update(id, data) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Product');
  const p = await prisma.product.update({ where: { id }, data });
  await invalidate(id);
  return serialize.product(p);
}
 
// Soft delete: ซ่อนสินค้าแทนการลบจริง เพราะ OrderItem เก่ายังอ้างอิงสินค้านี้อยู่
async function remove(id) {
  return update(id, { isActive: false });
}
 
module.exports = { list, getById, create, update, remove, invalidate };
