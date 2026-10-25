// WS2: gRPC Inventory Server — รันเป็น Service แยก (ดู docker-compose.yml: inventory)
const crypto = require('node:crypto');
const { grpc, InventoryService } = require('./protoLoader');
const inventory = require('../services/inventory.service');
const productService = require('../services/product.service');
const env = require('../config/env');
 
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 100;
const MAX_STREAM_MESSAGES = 10_000; // กันการส่ง stream ไม่รู้จบจนหน่วยความจำเต็ม
 
// Service ภายในต้องยืนยันตัวตนด้วย token ร่วม (ป้องกันคนนอกยิงเข้ามาตรงๆ ถ้าพอร์ตหลุด)
function isAuthorized(call) {
  if (!env.grpc.internalToken) return true;
  const [token] = call.metadata.get('x-internal-token');
  if (typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(env.grpc.internalToken);
  // เปรียบเทียบแบบเวลาคงที่ ป้องกัน Timing attack เดา token ทีละตัวอักษร
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
 
function validItem(i) {
  return UUID_RE.test(i.productId) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 100_000;
}
 
async function checkStock(call, callback) {
  if (!isAuthorized(call)) {
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'invalid internal token' });
  }
  const items = call.request.items || [];
  if (items.length === 0 || items.length > MAX_ITEMS || !items.every(validItem)) {
    return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'items must be 1-100 valid {productId, quantity}' });
  }
  try {
    const result = await inventory.checkStock(items);
    return callback(null, result);
  } catch (err) {
    console.error('[grpc] CheckStock failed:', err);
    return callback({ code: grpc.status.INTERNAL, message: 'internal error' });
  }
}
 
function streamRestock(call, callback) {
  if (!isAuthorized(call)) {
    call.destroy();
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'invalid internal token' });
  }
  const received = [];
  let invalid = false;
  let tooMany = false;
  call.on('data', (item) => {
    if (received.length >= MAX_STREAM_MESSAGES) tooMany = true;
    else if (!validItem(item)) invalid = true;
    else received.push(item);
  });
  call.on('error', (err) => console.warn('[grpc] StreamRestock stream error:', err.message));
  call.on('end', async () => {
    if (tooMany) {
      return callback({
        code: grpc.status.RESOURCE_EXHAUSTED,
        message: `max ${MAX_STREAM_MESSAGES} messages per stream`,
      });
    }
    if (invalid) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'stream contained invalid items' });
    }
    try {
      const summary = await inventory.applyRestock(received);
      await productService.invalidate(...summary.productIds);
      return callback(null, {
        receivedMessages: received.length,
        updatedProducts: summary.updatedProducts,
        totalUnits: summary.totalUnits,
      });
    } catch (err) {
      console.error('[grpc] StreamRestock failed:', err);
      return callback({ code: grpc.status.INTERNAL, message: 'internal error' });
    }
  });
  return undefined;
}
 
function createServer() {
  const server = new grpc.Server();
  server.addService(InventoryService.service, { checkStock, streamRestock });
  return server;
}
 
/** @returns {Promise<{server: grpc.Server, port: number}>} */
function start(address = `0.0.0.0:${env.grpc.port}`) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) return reject(err);
      return resolve({ server, port });
    });
  });
}
 
if (require.main === module) {
  const cache = require('../lib/cache');
  cache
    .connect()
    .then(() => start())
    .then(({ port }) => console.log(`[grpc] InventoryService listening on :${port}`))
    .catch((err) => {
      console.error('[grpc] failed to start:', err);
      process.exit(1);
    });
}
 
module.exports = { createServer, start };
