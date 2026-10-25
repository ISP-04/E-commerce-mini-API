// WS10 "What if...?": ถ้ามีคนยิง Request รัวๆ 1,000 ครั้ง/วินาที -> Rate Limiting ดักไว้ที่ชั้น API
const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');
 
const errorBody = (message) => ({ error: { code: 'RATE_LIMITED', message } });
 
const globalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !env.rateLimit.enabled,
  message: errorBody('Too many requests, please try again later'),
});
 
// เข้มกว่าสำหรับ login/register ป้องกัน Brute-force รหัสผ่าน
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.authMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !env.rateLimit.enabled,
  message: errorBody('Too many authentication attempts, please try again later'),
});
 
module.exports = { globalLimiter, authLimiter };
