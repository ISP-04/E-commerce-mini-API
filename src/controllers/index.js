// ชั้น Controller: รับ Request -> เรียก Service -> ตอบ Response (ไม่มี Business Logic ในชั้นนี้)
// Express 5 ส่ง Error จาก async function ไปที่ errorHandler ให้อัตโนมัติ ไม่ต้องเขียน try/catch
const authService = require('../services/auth.service');
const productService = require('../services/product.service');
const cartService = require('../services/cart.service');
 
const auth = {
  register: async (req, res) => res.status(201).json({ data: await authService.register(req.valid.body) }),
  login: async (req, res) => res.json({ data: await authService.login(req.valid.body) }),
  me: async (req, res) => res.json({ data: await authService.getProfile(req.user.id) }),
};
 
const isAdmin = (req) => req.user && req.user.role === 'ADMIN';
 
const products = {
  list: async (req, res) => res.json(await productService.list(req.valid.query, { includeInactive: isAdmin(req) })),
  get: async (req, res) =>
    res.json({ data: await productService.getById(req.valid.params.id, { includeInactive: isAdmin(req) }) }),
  create: async (req, res) => res.status(201).json({ data: await productService.create(req.valid.body) }),
  update: async (req, res) => res.json({ data: await productService.update(req.valid.params.id, req.valid.body) }),
  remove: async (req, res) => {
    await productService.remove(req.valid.params.id);
    res.status(204).end();
  },
};
 
const cart = {
  get: async (req, res) => res.json({ data: await cartService.getCart(req.user.id) }),
  add: async (req, res) => res.status(201).json({ data: await cartService.addItem(req.user.id, req.valid.body) }),
  update: async (req, res) =>
    res.json({ data: await cartService.updateItem(req.user.id, req.valid.params.itemId, req.valid.body) }),
  remove: async (req, res) => res.json({ data: await cartService.removeItem(req.user.id, req.valid.params.itemId) }),
};
 
module.exports = { auth, products, cart };
