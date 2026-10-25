//สร้าง HTTP Server แล้ว listen พอร์ต
const http = require('node:http');
const env = require('./config/env');
const { createApp } = require('./app');
const { attachWebSocket } = require('./realtime/websocket');
const prisma = require('./lib/prisma');
const cache = require('./lib/cache');
const mq = require('./lib/messageQueue');
const inventoryClient = require('./grpc/inventory.client');
 
// HTTP และ WebSocket ใช้พอร์ตเดียวกัน (WebSocket เริ่มจาก HTTP Upgrade request)
const server = http.createServer(createApp());
const wss = attachWebSocket(server);
 
async function main() {
  await cache.connect(); // ถ้าต่อ Redis ไม่ได้ แอปยังเปิดได้ (แค่ไม่มี cache)
  await mq.connect(); // ถ้าต่อ RabbitMQ ไม่ได้ แอปยังเปิดได้ (แค่ไม่ส่งอีเมล)
  server.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}  (ws: /ws)`);
  });
}
 
// Graceful shutdown: กด Ctrl+C หรือ docker stop -> หยุดรับ Request ใหม่ แล้วปิดอย่างเรียบร้อย
const shutdown = (signal) => {
  console.log(`[api] ${signal} received, shutting down...`);
  wss.close();
  server.close(async () => {
    inventoryClient.close();
    await Promise.allSettled([mq.disconnect(), cache.disconnect(), prisma.$disconnect()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
 
main().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
