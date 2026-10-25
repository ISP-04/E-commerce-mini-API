// อ่านค่า config จาก Environment Variables ที่เดียว (ห้าม hardcode ค่าลับในโค้ด)
require('dotenv').config({ quiet: true });
 
const nodeEnv = process.env.NODE_ENV || 'development';
 
// ค่าที่ขาดไม่ได้: ถ้าไม่ได้ตั้งไว้ ให้แอปหยุดตั้งแต่เริ่ม ดีกว่าไปพังตอนมีผู้ใช้เรียก
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
 
function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}
 
const jwtSecret = required('JWT_SECRET');
if (nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
 
module.exports = Object.freeze({
  nodeEnv,
  isTest: nodeEnv === 'test',
  port: toInt(process.env.PORT, 8080),
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  // ค่าว่าง = ปิดฟีเจอร์นั้น (ระบบยังทำงานได้ — Graceful degradation)
  redisUrl: process.env.REDIS_URL || '',
  cacheTtl: {
    product: toInt(process.env.CACHE_TTL_PRODUCT, 60),
    productList: toInt(process.env.CACHE_TTL_PRODUCT_LIST, 30),
  },
  rateLimit: {
    // ปิดใน test เป็นค่าเริ่มต้น (มี test เฉพาะที่เปิดด้วย RATE_LIMIT_ENABLED=true)
    enabled: process.env.RATE_LIMIT_ENABLED ? process.env.RATE_LIMIT_ENABLED === 'true' : nodeEnv !== 'test',
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_MAX, 300),
    authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 10),
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // จำนวน Reverse proxy ที่อยู่หน้า API (0 = ไม่มี, เปิดตรงสู่อินเทอร์เน็ต)
  // ถ้าตั้งมากกว่าความจริง ผู้โจมตีปลอม X-Forwarded-For เพื่อหลบ Rate limit ได้
  trustProxyHops: toInt(process.env.TRUST_PROXY_HOPS, 0),
});
