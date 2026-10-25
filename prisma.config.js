// Prisma 7 config (CommonJS) — URL ของฐานข้อมูลอ่านจาก .env / environment
require('dotenv').config({ quiet: true });

module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    // ค่า fallback ใช้เฉพาะตอน `prisma generate` ใน Docker build ที่ไม่มี DB จริง
    url: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
};
