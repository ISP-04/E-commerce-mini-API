// แปลง Prisma Decimal -> string เพื่อให้ JSON ไม่เสียความแม่นยำของเงิน (เช่น "199.50")
const { fromSatang, toSatang } = require('../utils/money');
 
const money = (d) => (d === null || d === undefined ? d : fromSatang(toSatang(d)));
 
function product(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: money(p.price),
    stock: p.stock,
    category: p.category,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
 
function order(o) {
  return {
    id: o.id,
    userId: o.userId,
    status: o.status,
    totalAmount: money(o.totalAmount),
    shippingAddress: o.shippingAddress,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: (o.items || []).map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      unitPrice: money(i.unitPrice),
      quantity: i.quantity,
      subtotal: money(i.subtotal),
    })),
    payments: (o.payments || []).map((p) => ({
      id: p.id,
      amount: money(p.amount),
      method: p.method,
      status: p.status,
      transactionRef: p.transactionRef,
      createdAt: p.createdAt,
    })),
  };
}
 
module.exports = { money, product, order };
