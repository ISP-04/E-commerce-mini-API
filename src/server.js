//สร้าง HTTP Server แล้ว listen พอร์ต
const http = require('node:http');
const env = require('./config/env');
const { createApp } = require('./app');
const prisma = require('./lib/prisma');
const cache = require('./lib/cache');
 
const server = http.createServer(createApp());
 
async function main() {
  await cache.connect(); // ถ้าต่อ Redis ไม่ได้ แอปยังเปิดได้ (แค่ไม่มี cache)
  server.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
  });
}
 
// Graceful shutdown: กด Ctrl+C หรือ docker stop -> หยุดรับ Request ใหม่ แล้วปิดอย่างเรียบร้อย
const shutdown = (signal) => {
  console.log(`[api] ${signal} received, shutting down...`);
  server.close(async () => {
    await Promise.allSettled([cache.disconnect(), prisma.$disconnect()]);
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
