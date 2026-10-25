//อ่านค่า config จาก Environment Variables ที่เดียว (ห้าม hardcode ค่าลับในโค้ด)
require('dotenv').config({ quiet: true });
 
const nodeEnv = process.env.NODE_ENV || 'development';
 
function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}
 
module.exports = Object.freeze({
  nodeEnv,
  isTest: nodeEnv === 'test',
  port: toInt(process.env.PORT, 8080),
  corsOrigin: process.env.CORS_ORIGIN || '*',
});
