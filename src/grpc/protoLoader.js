// โหลดไฟล์ .proto แบบ dynamic (ไม่ต้อง gen โค้ดด้วย protoc ล่วงหน้า)
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
 
const PROTO_PATH = path.join(__dirname, '..', '..', 'proto', 'inventory.proto');
 
const definition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // product_id -> productId
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
 
const { inventory } = grpc.loadPackageDefinition(definition);
 
module.exports = { grpc, InventoryService: inventory.v1.InventoryService, PROTO_PATH };
