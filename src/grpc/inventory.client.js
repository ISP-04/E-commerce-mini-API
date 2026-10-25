// gRPC Client ฝั่ง API: เรียก Inventory Service พร้อม Deadline
// WS10 Fallback: ถ้า gRPC ล่ม/ช้าเกิน -> ตรวจสต็อกจาก DB โดยตรงแทน (ระบบไม่ล่มตาม)
const { grpc, InventoryService } = require('./protoLoader');
const inventory = require('../services/inventory.service');
const env = require('../config/env');
 
let client = null;
 
function getClient() {
  if (!env.grpc.inventoryUrl) return null;
  if (!client) {
    client = new InventoryService(env.grpc.inventoryUrl, grpc.credentials.createInsecure());
  }
  return client;
}
 
function callCheckStock(c, items) {
  const metadata = new grpc.Metadata();
  if (env.grpc.internalToken) metadata.set('x-internal-token', env.grpc.internalToken);
  const deadline = new Date(Date.now() + env.grpc.timeoutMs);
  return new Promise((resolve, reject) => {
    c.checkStock({ items }, metadata, { deadline }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
 
/** @returns {Promise<{allAvailable: boolean, items: object[], source: 'grpc'|'database'}>} */
async function checkStock(items) {
  const c = getClient();
  if (c) {
    try {
      const res = await callCheckStock(c, items);
      return { ...res, source: 'grpc' };
    } catch (err) {
      console.warn(`[grpc] CheckStock failed (${err.code}: ${err.details || err.message}), falling back to DB`);
    }
  }
  const res = await inventory.checkStock(items);
  return { ...res, source: 'database' };
}
 
function close() {
  if (client) {
    client.close();
    client = null;
  }
}
 
module.exports = { checkStock, close };
