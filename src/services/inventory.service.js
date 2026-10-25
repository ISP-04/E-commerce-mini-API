// ตรรกะตรวจสต็อกกลาง — บทที่ 10 จะย้ายไปเรียกผ่าน gRPC Inventory Service (WS2)
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
 
module.exports = { checkStock };
