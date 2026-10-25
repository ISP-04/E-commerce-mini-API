// WS2 Demo: เรียก gRPC Inventory Service + เปรียบเทียบขนาดข้อมูล JSON vs Protobuf
// รัน: npm run grpc:server (อีกหน้าต่าง) แล้ว node scripts/grpc-demo.js <productId> [productId2]
require('dotenv').config({ quiet: true });
const protobuf = require('@grpc/proto-loader');
const { grpc, InventoryService, PROTO_PATH } = require('../src/grpc/protoLoader');
 
const address = process.env.INVENTORY_GRPC_URL || 'localhost:50051';
const token = process.env.INTERNAL_GRPC_TOKEN || '';
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('usage: node scripts/grpc-demo.js <productId> [productId2 ...]');
  process.exit(1);
}
 
const client = new InventoryService(address, grpc.credentials.createInsecure());
const metadata = new grpc.Metadata();
if (token) metadata.set('x-internal-token', token);
 
function compareSizes(request) {
  // serialize ด้วย Protobuf จริงจาก .proto เดียวกัน เพื่อเทียบกับ JSON
  const def = protobuf.loadSync(PROTO_PATH, { keepCase: false });
  const { requestSerialize } = def['inventory.v1.InventoryService'].CheckStock;
  const jsonBytes = Buffer.byteLength(JSON.stringify(request));
  const protoBytes = requestSerialize(request).length;
  console.log(
    `\n[size] JSON = ${jsonBytes} bytes | Protobuf = ${protoBytes} bytes | เล็กลง ${(100 - (protoBytes / jsonBytes) * 100).toFixed(1)}%`,
  );
}
 
async function main() {
  const request = { items: ids.map((productId) => ({ productId, quantity: 2 })) };
 
  // 1) Unary RPC
  const res = await new Promise((resolve, reject) =>
    client.checkStock(request, metadata, { deadline: Date.now() + 2000 }, (err, r) => (err ? reject(err) : resolve(r))),
  );
  console.log('[CheckStock]', JSON.stringify(res, null, 2));
  compareSizes(request);
 
  // 2) Client streaming RPC: ส่งรายการรับสินค้าเข้าคลังทีละชิ้น
  const summary = await new Promise((resolve, reject) => {
    const call = client.streamRestock(metadata, (err, r) => (err ? reject(err) : resolve(r)));
    for (const productId of ids) {
      for (let i = 0; i < 3; i += 1) call.write({ productId, quantity: 1, scannedBy: 'scanner-01' });
    }
    call.end();
  });
  console.log('\n[StreamRestock]', summary);
  client.close();
}
 
main().catch((err) => {
  console.error('gRPC error:', err.code, err.details || err.message);
  process.exit(1);
});
