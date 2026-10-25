// WS5: Caching Layer (Cache-Aside Pattern) บน Redis
// WS10: Fallback — ถ้า Redis ล่ม/ไม่ได้ตั้งค่า ระบบต้องไม่ล่ม แต่ไปอ่านจาก DB แทน
const { createClient } = require('redis');
const env = require('../config/env');
 
let client = null;
 
async function connect() {
  if (!env.redisUrl || client) return;
  client = createClient({
    url: env.redisUrl,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
  });
  client.on('error', (err) => console.warn('[redis] error:', err.message));
  try {
    await client.connect();
    console.log('[redis] connected');
  } catch (err) {
    console.warn('[redis] initial connect failed, cache disabled until reconnect:', err.message);
  }
}
 
function isReady() {
  return Boolean(client && client.isReady);
}
 
async function getJSON(key) {
  if (!isReady()) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[redis] get failed:', err.message);
    return null;
  }
}
 
async function setJSON(key, value, ttlSeconds) {
  if (!isReady()) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.warn('[redis] set failed:', err.message);
  }
}
 
async function del(...keys) {
  if (!isReady() || keys.length === 0) return;
  try {
    await client.del(keys);
  } catch (err) {
    console.warn('[redis] del failed:', err.message);
  }
}
 
// ใช้ "version key" แทนการลบ key แบบ wildcard (SCAN/KEYS ช้าเมื่อข้อมูลเยอะ)
// เมื่อสินค้าเปลี่ยน -> INCR version -> cache รายการเก่าทั้งหมดใช้ไม่ได้ทันที
async function getVersion(name) {
  if (!isReady()) return '0';
  try {
    return (await client.get(`${name}:version`)) || '0';
  } catch {
    return '0';
  }
}
 
async function bumpVersion(name) {
  if (!isReady()) return;
  try {
    await client.incr(`${name}:version`);
  } catch (err) {
    console.warn('[redis] incr failed:', err.message);
  }
}
 
/**
 * Cache-aside helper: อ่าน cache ก่อน (Cache Hit) ถ้าไม่เจอ (Cache Miss) ค่อยเรียก loader แล้วเก็บผลลง cache
 * @returns {Promise<{value: any, cache: 'HIT'|'MISS'|'BYPASS'}>}
 */
async function remember(key, ttlSeconds, loader) {
  if (!isReady()) {
    return { value: await loader(), cache: 'BYPASS' };
  }
  const cached = await getJSON(key);
  if (cached !== null) return { value: cached, cache: 'HIT' };
  const value = await loader();
  if (value !== null && value !== undefined) await setJSON(key, value, ttlSeconds);
  return { value, cache: 'MISS' };
}
 
async function disconnect() {
  if (client) {
    try {
      await client.quit();
    } catch {
      // ignore
    }
    client = null;
  }
}
 
module.exports = { connect, disconnect, isReady, getJSON, setJSON, del, getVersion, bumpVersion, remember };
