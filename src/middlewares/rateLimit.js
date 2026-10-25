// Rate limit: จำกัดจำนวน request ต่อ IP เพื่อกัน brute-force
const { rateLimit } = require('express-rate-limit');

const handler = (req, res) => res.status(429).json({ message: 'Too many requests, please try again later.' });

// ใช้ทั้งระบบ: 100 ครั้ง / 15 นาที ต่อ IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

// ใช้กับ login/register: เข้มกว่า (ป้องกัน brute force คือการเดารหัสผ่านซ้ำๆ)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

module.exports = { apiLimiter, authLimiter };
