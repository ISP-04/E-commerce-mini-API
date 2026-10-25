//Prisma Client (ORM) — ใช้ Driver Adapter ของ PostgreSQL (Prisma 7)
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const env = require('../config/env');
 
const adapter = new PrismaPg({ connectionString: env.databaseUrl });
const prisma = new PrismaClient({ adapter });
 
module.exports = prisma;
