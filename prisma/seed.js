require('dotenv').config({ quiet: true });
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

async function main() {
  for (const p of PRODUCTS) {
    const exists = await prisma.product.findFirst({ where: { name: p.name } });
    if (!exists) await prisma.product.create({ data: p });
  }
  console.log(`Seeded: products=${PRODUCTS.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
