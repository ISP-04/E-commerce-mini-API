//อ่านค่า config จาก Environment Variables ที่เดียว (ห้าม hardcode ค่าลับในโค้ด)
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

module.exports = Object.freeze({
  nodeEnv,
  isTest: nodeEnv === 'test',
  port: toInt(process.env.PORT, 8080),
  databaseUrl: required('DATABASE_URL'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwt: Object.freeze({
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  }),
});
