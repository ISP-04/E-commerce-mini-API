// ตรรกะตรวจสต็อกกลาง — ใช้ร่วมกันทั้ง gRPC Inventory Server (WS2) และเป็น Fallback ของ API
const prisma = require('../lib/prisma');
 
/**
 * @param {{productId: string, quantity: number}[]} items
 * @returns {Promise<{allAvailable: boolean, items: {productId: string, requested: number, available: number, sufficient: boolean}[]}>}
 */
async function checkStock(items) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, stock: true, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const result = items.map((item) => {
    const p = byId.get(item.productId);
    const available = p && p.isActive ? p.stock : 0;
    return {
      productId: item.productId,
      requested: item.quantity,
      available,
      sufficient: available >= item.quantity,
    };
  });
  return { allAvailable: result.every((r) => r.sufficient), items: result };
}
 
/**
 * รับสินค้าเข้าคลัง (Restock) — gRPC Client Streaming ส่งมาทีละรายการ
 * @param {{productId: string, quantity: number}[]} adjustments
 */
async function applyRestock(adjustments) {
  const totals = new Map();
  for (const a of adjustments) {
    totals.set(a.productId, (totals.get(a.productId) || 0) + a.quantity);
  }
  let updatedProducts = 0;
  let totalUnits = 0;
  await prisma.$transaction(async (tx) => {
    for (const [productId, quantity] of totals) {
      const res = await tx.product.updateMany({ where: { id: productId }, data: { stock: { increment: quantity } } });
      if (res.count === 1) {
        updatedProducts += 1;
        totalUnits += quantity;
      }
    }
  });
  return { updatedProducts, totalUnits, productIds: [...totals.keys()] };
}
 
module.exports = { checkStock, applyRestock };
