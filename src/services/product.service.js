const AppError = require('../utils/AppError');
 
const PRODUCTS = [
  {
    id: '6f1c2a10-0000-4000-8000-000000000001',
    name: 'Mechanical Keyboard',
    price: '1290.00',
    stock: 40,
    category: 'peripherals',
  },
  { id: '6f1c2a10-0000-4000-8000-000000000002', name: '1TB NVMe SSD', price: '2190.00', stock: 60, category: 'storage' },
  {
    id: '6f1c2a10-0000-4000-8000-000000000003',
    name: 'Wi-Fi 6 Router',
    price: '1590.00',
    stock: 0,
    category: 'networking',
  },
];
 
async function list() {
  return { data: PRODUCTS, pagination: { page: 1, limit: PRODUCTS.length, total: PRODUCTS.length, totalPages: 1 } };
}
 
async function getById(id) {
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) throw AppError.notFound('Product');
  return product;
}
 
module.exports = { list, getById };
