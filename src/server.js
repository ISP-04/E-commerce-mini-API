//สร้าง HTTP Server แล้ว listen พอร์ต
const http = require('node:http');
const env = require('./config/env');
const { createApp } = require('./app');
const prisma = require('./lib/prisma');

const server = http.createServer(createApp());

server.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});

// Graceful shutdown: กด Ctrl+C หรือ docker stop -> หยุดรับ Request ใหม่ แล้วปิดอย่างเรียบร้อย
const shutdown = (signal) => {
  console.log(`[api] ${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect(); // ปิด Connection Pool ของฐานข้อมูล
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
