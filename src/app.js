// Express application (ไม่ listen ที่นี่ — แยกจาก server.js เพื่อให้บทที่ 11 ทดสอบด้วย Supertest ได้)
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const prisma = require('./lib/prisma');
const apiRoutes = require('./routes');
const { globalLimiter } = require('./middlewares/rateLimit');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
 
function createApp() {
  const app = express();
  app.disable('x-powered-by'); // ไม่บอกผู้โจมตีว่าใช้ Express
  // ใช้ X-Forwarded-For เฉพาะเมื่อมี Reverse proxy จริงเท่านั้น (TRUST_PROXY_HOPS) — ป้องกันการปลอม IP หลบ Rate limit
  app.set('trust proxy', env.trustProxyHops);
 
  app.use(helmet()); // ใส่ Security Headers มาตรฐาน
  app.use(cors({ origin: env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' })); // จำกัดขนาด Body กันการส่งข้อมูลใหญ่เกินไป
  if (!env.isTest) app.use(morgan('dev')); // Log ทุก Request
 
  // Health check: ใช้ตรวจว่าระบบยังทำงานอยู่ (Docker / Load balancer จะเรียก URL นี้)
  // ตรวจฐานข้อมูลด้วย SELECT 1 ถ้าต่อไม่ได้ตอบ 503 ให้ระบบภายนอกรู้ว่า API ยังไม่พร้อม
  app.get('/health', async (_req, res) => {
    let database = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      services: { database },
      uptimeSeconds: Math.round(process.uptime()),
    });
  });
 
  // Versioning: ใส่ /api/v1 ไว้หน้า URL เพื่อให้ออก v2 ได้ในอนาคตโดยไม่กระทบ Client เดิม
  app.use('/api/v1', globalLimiter, apiRoutes);
 
  app.use(notFoundHandler); // ไม่ตรงกับ Route ไหนเลย -> 404
  app.use(errorHandler); // ต้องอยู่ล่างสุดเสมอ
  return app;
}
 
module.exports = { createApp };
