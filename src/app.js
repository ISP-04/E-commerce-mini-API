// Express application (ไม่ listen ที่นี่ — แยกจาก server.js เพื่อทดสอบด้วย Supertest ได้)
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
 
function createApp() {
  const app = express();
  app.disable('x-powered-by'); // ไม่บอกผู้โจมตีว่าใช้ Express
 
  app.use(helmet()); // ใส่ Security Headers มาตรฐาน
  app.use(cors({ origin: env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' })); // จำกัดขนาด Body กันการส่งข้อมูลใหญ่เกินไป
  if (!env.isTest) app.use(morgan('dev')); // Log ทุก Request
 
  // Health check: ใช้ตรวจว่าระบบยังทำงานอยู่ (Docker / Load balancer จะเรียก URL นี้)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });
 
  // Versioning: ใส่ /api/v1 ไว้หน้า URL เพื่อให้ออก v2 ได้ในอนาคตโดยไม่กระทบ Client เดิม
  app.use('/api/v1', apiRoutes);
 
  app.use(notFoundHandler); // ไม่ตรงกับ Route ไหนเลย -> 404
  app.use(errorHandler); // ต้องอยู่ล่างสุดเสมอ
  return app;
}
 
module.exports = { createApp };
