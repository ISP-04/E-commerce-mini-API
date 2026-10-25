// Demo การป้องกัน Race Condition: ลูกค้า N คนแย่งกันสั่งสินค้าที่เหลือ STOCK ชิ้นพร้อมกัน
// รัน: npm run seed แล้ว node scripts/race-demo.js [baseUrl] [buyers] [stock]
// ผลที่ถูกต้อง: สั่งสำเร็จ = STOCK พอดี, ที่เหลือได้ 409 INSUFFICIENT_STOCK, สต็อกสุดท้าย = 0 (ไม่ติดลบ)
require('dotenv').config({ quiet: true });
 
const BASE = process.argv[2] || 'http://localhost:8080/api/v1';
const BUYERS = Number(process.argv[3] || 10);
const STOCK = Number(process.argv[4] || 3);
 
async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
 
async function login(email, password) {
  const r = await call('POST', '/auth/login', null, { email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body.data.token;
}
 
async function main() {
  const admin = await login(process.env.ADMIN_EMAIL || 'admin@shop.local', process.env.ADMIN_PASSWORD);
  const product = await call('POST', '/products', admin, {
    name: `Limited Edition Pico #${Date.now()}`,
    price: '999.00',
    stock: STOCK,
    category: 'limited',
  });
  const productId = product.body.data.id;
  console.log(`สร้างสินค้า ${productId} สต็อก ${STOCK} ชิ้น, ผู้ซื้อ ${BUYERS} คน`);
 
  const tokens = [];
  for (let i = 0; i < BUYERS; i += 1) {
    const email = `racer${i}.${Date.now()}@example.com`;
    await call('POST', '/auth/register', null, { email, password: 'password123', name: `Racer ${i}` });
    const t = await login(email, 'password123');
    await call('POST', '/cart', t, { productId, quantity: 1 });
    tokens.push(t);
  }
 
  console.log('ทุกคนกด "สั่งซื้อ" พร้อมกัน...');
  const results = await Promise.all(
    tokens.map((t) => call('POST', '/orders', t, { shippingAddress: 'Kasetsart University, Sakon Nakhon' })),
  );
  const ok = results.filter((r) => r.status === 201).length;
  const conflict = results.filter((r) => r.status === 409).length;
  const final = await call('GET', `/products/${productId}`, admin);
  console.log(
    `สำเร็จ ${ok} | สต็อกไม่พอ (409) ${conflict} | อื่นๆ ${BUYERS - ok - conflict} | สต็อกคงเหลือ ${final.body.data.stock}`,
  );
  console.log(ok === STOCK && final.body.data.stock === 0 ? 'PASS: ไม่มีการขายเกินสต็อก' : 'FAIL: ตรวจสอบ Transaction');
}
 
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
