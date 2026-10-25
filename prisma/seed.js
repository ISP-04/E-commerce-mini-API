// ข้อมูลตั้งต้น: บัญชี Admin (จาก env) + ลูกค้าทดสอบ + สินค้าตัวอย่าง
// รัน: npm run db:seed  (รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ)
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const PRODUCTS = [
  {
    name: 'Mechanical Keyboard',
    price: '1290.00',
    stock: 15,
    category: 'peripherals',
    description: 'Hot-swappable switches, 75% layout',
  },
  {
    name: 'Wireless Mouse',
    price: '590.00',
    stock: 40,
    category: 'peripherals',
    description: 'Ergonomic, 2.4GHz + Bluetooth',
  },
  {
    name: '1TB NVMe SSD',
    price: '2190.00',
    stock: 25,
    category: 'storage',
    description: 'PCIe 4.0 M.2 2280 solid-state drive',
  },
  { name: 'Wi-Fi 6 Router', price: '1590.00', stock: 60, category: 'networking' },
  { name: 'Gigabit Switch 8 Port', price: '690.00', stock: 30, category: 'networking' },
  {
    name: 'USB-C GaN Charger 65W',
    price: '450.00',
    stock: 3,
    category: 'accessories',
    description: 'Laptop and phone fast charger (low stock demo)',
  },
];

async function upsertUser(email, password, name, role) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, name, role } });
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@shop.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('Set ADMIN_PASSWORD (>= 8 chars) in .env before seeding');
  }
  await upsertUser(adminEmail, adminPassword, 'Shop Admin', 'ADMIN');
  // บัญชีทดสอบรหัสผ่านสาธารณะ — สร้างเฉพาะตอนพัฒนา ห้ามมีบน Production
  if (process.env.NODE_ENV !== 'production') {
    await upsertUser('customer@shop.local', 'customer1234', 'Demo Customer', 'CUSTOMER');
  }

  for (const p of PRODUCTS) {
    const exists = await prisma.product.findFirst({ where: { name: p.name } });
    if (!exists) await prisma.product.create({ data: p });
  }
  const customer = process.env.NODE_ENV !== 'production' ? 'customer@shop.local' : '(ไม่สร้างบน production)';
  console.log(`Seeded: admin=${adminEmail}, customer=${customer}, products=${PRODUCTS.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());