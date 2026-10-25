// Express application (ไม่ listen ที่นี่ — แยกจาก server.js เพื่อให้บทที่ 11 ทดสอบด้วย Supertest ได้)
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const env = require('./config/env');
const prisma = require('./lib/prisma');
const cache = require('./lib/cache');
const apiRoutes = require('./routes');
const { globalLimiter } = require('./middlewares/rateLimit');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// เอกสาร OpenAPI (Swagger) เขียนเป็น YAML แล้วแปลงเป็น Object ตอนเริ่มแอป
const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, 'docs', 'openapi.yaml'), 'utf8'));

function createApp() {
  const app = express();
  app.disable('x-powered-by'); // ไม่บอกผู้โจมตีว่าใช้ Express
  // ใช้ X-Forwarded-For เฉพาะเมื่อมี Reverse proxy จริงเท่านั้น (TRUST_PROXY_HOPS) — ป้องกันการปลอม IP หลบ Rate limit
  app.set('trust proxy', env.trustProxyHops);
 
  app.use(helmet()); // ใส่ Security Headers มาตรฐาน
  app.use(cors({ origin: env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' })); // จำกัดขนาด Body กันการส่งข้อมูลใหญ่เกินไป
  if (!env.isTest) app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev')); // Log ทุก Request
 
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
      services: { database, cache: cache.isReady() ? 'up' : 'disabled' },
      uptimeSeconds: Math.round(process.uptime()),
    });
  });
 
  // หน้าเอกสาร API แบบ Interactive (Swagger UI): http://localhost:8080/api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.get('/openapi.json', (_req, res) => res.json(openapi));

  // หน้าเว็บทดสอบ WebSocket (WS1): http://localhost:8080/realtime.html
  app.use(express.static(path.join(__dirname, 'public')));
 
  // Versioning: ใส่ /api/v1 ไว้หน้า URL เพื่อให้ออก v2 ได้ในอนาคตโดยไม่กระทบ Client เดิม
  app.use('/api/v1', globalLimiter, apiRoutes);
 
  app.use(notFoundHandler); // ไม่ตรงกับ Route ไหนเลย -> 404
  app.use(errorHandler); // ต้องอยู่ล่างสุดเสมอ
  return app;
}
 
module.exports = { createApp };
