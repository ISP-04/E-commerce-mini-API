// ตะกร้าสินค้า: 1 user มี 1 cart, 1 cart มีหลาย CartItem
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const inventory = require('./inventory.service');
const { calculateOrderTotals } = require('../utils/money');
const { money } = require('./serializers');
 
const MAX_QTY_PER_ITEM = 99;
 
async function getOrCreateCart(userId) {
  return prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
}
 
async function getCart(userId) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
  });
  const items = cart ? cart.items : [];
  const lines = items.map((i) => ({
    id: i.id,
    productId: i.productId,
    name: i.product.name,
    unitPrice: money(i.product.price),
    quantity: i.quantity,
    stock: i.product.stock,
    // ให้ฝั่งหน้าเว็บรู้ล่วงหน้าว่ารายการไหนสั่งไม่ได้ (สต็อกไม่พอ/สินค้าถูกปิดขาย)
    available: i.product.isActive && i.product.stock >= i.quantity,
  }));
  const totals = lines.length > 0 ? calculateOrderTotals(lines) : { lines: [], total: '0.00' };
  return {
    id: cart ? cart.id : null,
    items: totals.lines,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    total: totals.total,
  };
}
 
async function ensureStock(productId, quantity) {
  const res = await inventory.checkStock([{ productId, quantity }]);
  const item = res.items[0];
  if (!item || !item.sufficient) {
    throw AppError.conflict('INSUFFICIENT_STOCK', 'Not enough stock for this product', {
      productId,
      requested: quantity,
      available: item ? item.available : 0,
    });
  }
}
 
async function addItem(userId, { productId, quantity }) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) throw AppError.notFound('Product');
 
  const cart = await getOrCreateCart(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });
  const newQuantity = (existing ? existing.quantity : 0) + quantity;
  if (newQuantity > MAX_QTY_PER_ITEM) {
    throw AppError.badRequest(`Quantity per item cannot exceed ${MAX_QTY_PER_ITEM}`);
  }
  // ตรวจสต็อกเบื้องต้น (ตัวตัดสินจริงคือ Transaction ตอนสร้าง Order ในบทที่ 07)
  await ensureStock(productId, newQuantity);
 
  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity },
    update: { quantity: { increment: quantity } },
  });
  return getCart(userId);
}
 
async function findOwnItem(userId, itemId) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
  // ไม่บอกว่ามี item นี้แต่เป็นของคนอื่น — ตอบ 404 เหมือนกัน (ป้องกัน IDOR enumeration)
  if (!item) throw AppError.notFound('Cart item');
  return item;
}
 
async function updateItem(userId, itemId, { quantity }) {
  const item = await findOwnItem(userId, itemId);
  await ensureStock(item.productId, quantity);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCart(userId);
}
 
async function removeItem(userId, itemId) {
  const item = await findOwnItem(userId, itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
  return getCart(userId);
}
 
module.exports = { getCart, addItem, updateItem, removeItem, MAX_QTY_PER_ITEM };
