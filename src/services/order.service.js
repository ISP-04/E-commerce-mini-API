// คำสั่งซื้อ: สร้างจากตะกร้า (ตัดสต็อกใน Transaction), ชำระเงินจำลอง, ยกเลิก (คืนสต็อก), เปลี่ยนสถานะ
//
// ป้องกัน Race Condition (การแย่งกันซื้อสินค้าชิ้นสุดท้าย) ด้วย 3 ชั้น:
//   1) Pessimistic lock: SELECT ... FOR UPDATE ล็อกแถวสินค้าไว้จน Transaction จบ
//   2) ล็อกตามลำดับ id เสมอ (ORDER BY id) -> ป้องกัน Deadlock เมื่อ 2 คำสั่งซื้อมีสินค้าซ้อนกัน
//   3) CHECK (stock >= 0) ในฐานข้อมูล เป็นด่านสุดท้ายถ้าโค้ดมีบั๊ก
const crypto = require('node:crypto');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { calculateOrderTotals } = require('../utils/money');
const { STATUS, canAdminTransition, canCustomerCancel, canPay, holdsStock } = require('../utils/orderStatus');
const { emitDomainEvent, EVENTS } = require('../lib/events');
const productService = require('./product.service');
const serialize = require('./serializers');
 
const TX_OPTIONS = { maxWait: 5000, timeout: 10000 };
const ORDER_INCLUDE = { items: true, payments: { orderBy: { createdAt: 'asc' } } };
 
async function createOrder(user, { shippingAddress }) {
  const { order, lowStock } = await prisma.$transaction(async (tx) => {
    // ล็อกตะกร้าของ user ก่อน: กันการกด "สั่งซื้อ" ซ้ำ 2 ครั้งพร้อมกันแล้วได้ 2 Order จากตะกร้าเดียว
    const [cartRow] = await tx.$queryRaw`SELECT id FROM carts WHERE user_id = ${user.id}::uuid FOR UPDATE`;
    if (!cartRow) throw AppError.badRequest('Cart is empty');
 
    const items = await tx.cartItem.findMany({ where: { cartId: cartRow.id } });
    if (items.length === 0) throw AppError.badRequest('Cart is empty');
 
    const productIds = [...new Set(items.map((i) => i.productId))].sort();
    const locked = await tx.$queryRaw`
      SELECT id, name, price::text AS price, stock, is_active
      FROM products
      WHERE id = ANY(${productIds}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    const byId = new Map(locked.map((p) => [p.id, p]));
 
    const problems = [];
    for (const item of items) {
      const p = byId.get(item.productId);
      if (!p || !p.is_active) {
        problems.push({ productId: item.productId, reason: 'UNAVAILABLE', requested: item.quantity, available: 0 });
      } else if (p.stock < item.quantity) {
        problems.push({
          productId: item.productId,
          reason: 'INSUFFICIENT_STOCK',
          requested: item.quantity,
          available: p.stock,
        });
      }
    }
    if (problems.length > 0) {
      throw AppError.conflict('INSUFFICIENT_STOCK', 'Some items are out of stock or unavailable', problems);
    }
 
    // ใช้ราคา ณ ตอนล็อก (ไม่ใช่ราคาตอนใส่ตะกร้า) และบันทึกเป็น Snapshot ลง OrderItem
    const totals = calculateOrderTotals(
      items.map((i) => ({ productId: i.productId, unitPrice: byId.get(i.productId).price, quantity: i.quantity })),
    );
 
    const low = [];
    for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const remaining = byId.get(item.productId).stock - item.quantity;
      await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      if (remaining <= env.lowStockThreshold) {
        low.push({ productId: item.productId, name: byId.get(item.productId).name, remaining });
      }
    }
 
    const created = await tx.order.create({
      data: {
        userId: user.id,
        shippingAddress,
        totalAmount: totals.total,
        items: {
          create: totals.lines.map((l) => ({
            productId: l.productId,
            productName: byId.get(l.productId).name,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            subtotal: l.subtotal,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });
 
    await tx.cartItem.deleteMany({ where: { cartId: cartRow.id } });
    return { order: created, lowStock: low };
  }, TX_OPTIONS);
 
  // หลัง Commit แล้วเท่านั้น จึงล้าง Cache และปล่อย Event (ไม่ส่งอีเมลยืนยันของ Order ที่ Rollback ไปแล้ว)
  await productService.invalidate(...order.items.map((i) => i.productId));
  const result = serialize.order(order);
  emitDomainEvent(EVENTS.ORDER_CREATED, {
    orderId: result.id,
    userId: user.id,
    email: user.email,
    totalAmount: result.totalAmount,
    itemCount: result.items.length,
  });
  for (const item of lowStock) emitDomainEvent(EVENTS.LOW_STOCK, item);
  return result;
}
 
async function findOrderFor(user, orderId) {
  const where = user.role === 'ADMIN' ? { id: orderId } : { id: orderId, userId: user.id };
  const order = await prisma.order.findFirst({ where, include: ORDER_INCLUDE });
  if (!order) throw AppError.notFound('Order');
  return order;
}
 
async function getOrder(user, orderId) {
  return serialize.order(await findOrderFor(user, orderId));
}
 
async function listOrders(user, { page, limit, status }) {
  const where = {};
  if (user.role !== 'ADMIN') where.userId = user.id;
  if (status) where.status = status;
  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { data: rows.map(serialize.order), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
 
/**
 * เปลี่ยนสถานะแบบ Atomic: UPDATE ... WHERE status = <สถานะเดิม>
 * ถ้ามี Request อื่นเปลี่ยนไปก่อน (เช่น จ่ายเงินพร้อมกับยกเลิก) จะได้ count = 0 -> 409
 */
async function transition(order, to, { restock = false, extraData = {}, onCommitTx } = {}) {
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: to, ...extraData },
    });
    if (res.count !== 1) {
      throw AppError.conflict('ORDER_STATE_CHANGED', 'Order was modified by another request, please reload and retry');
    }
    if (restock) {
      const items = [...order.items].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const item of items) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
    }
    if (onCommitTx) await onCommitTx(tx);
    return tx.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
  }, TX_OPTIONS);
 
  if (restock) await productService.invalidate(...order.items.map((i) => i.productId));
  const result = serialize.order(updated);
  emitDomainEvent(EVENTS.ORDER_STATUS_CHANGED, {
    orderId: result.id,
    userId: result.userId,
    from: order.status,
    to,
  });
  return result;
}
 
async function payOrder(user, orderId, { method, simulateFailure }) {
  const order = await findOrderFor({ ...user, role: 'CUSTOMER' }, orderId); // จ่ายได้เฉพาะ Order ของตัวเอง
  if (!canPay(order.status)) {
    throw AppError.conflict('INVALID_ORDER_STATE', `Cannot pay an order with status ${order.status}`);
  }
  const transactionRef = `PAY-${crypto.randomUUID()}`;
 
  if (simulateFailure) {
    await prisma.payment.create({
      data: { orderId: order.id, amount: order.totalAmount, method, status: 'FAILED', transactionRef },
    });
    throw new AppError(402, 'PAYMENT_FAILED', 'Payment was declined (simulated). Order remains PENDING.');
  }
 
  const result = await transition(order, STATUS.PAID, {
    extraData: { paidAt: new Date() },
    onCommitTx: (tx) =>
      tx.payment.create({
        data: { orderId: order.id, amount: order.totalAmount, method, status: 'SUCCESS', transactionRef },
      }),
  });
  emitDomainEvent(EVENTS.ORDER_PAID, {
    orderId: result.id,
    userId: user.id,
    email: user.email,
    totalAmount: result.totalAmount,
    transactionRef,
  });
  return result;
}
 
async function cancelOwnOrder(user, orderId) {
  const order = await findOrderFor({ ...user, role: 'CUSTOMER' }, orderId);
  if (!canCustomerCancel(order.status)) {
    throw AppError.conflict('INVALID_ORDER_STATE', `Cannot cancel an order with status ${order.status}`);
  }
  return transition(order, STATUS.CANCELLED, { restock: holdsStock(order.status) });
}
 
async function updateStatus(orderId, { status }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) throw AppError.notFound('Order');
  if (!canAdminTransition(order.status, status)) {
    throw AppError.conflict('INVALID_TRANSITION', `Cannot change status from ${order.status} to ${status}`);
  }
  return transition(order, status, { restock: status === STATUS.CANCELLED && holdsStock(order.status) });
}
 
module.exports = { createOrder, getOrder, listOrders, payOrder, cancelOwnOrder, updateStatus };
