// ชั้น Controller: รับ Request -> เรียก Service -> ตอบ Response (ไม่มี Business Logic ในชั้นนี้)
// Express 5 ส่ง Error จาก async function ไปที่ errorHandler ให้อัตโนมัติ ไม่ต้องเขียน try/catch
const authService = require('../services/auth.service');
const productService = require('../services/product.service');
 
const auth = {
  register: async (req, res) => res.status(201).json({ data: await authService.register(req.valid.body) }),
  login: async (req, res) => res.json({ data: await authService.login(req.valid.body) }),
  me: async (req, res) => res.json({ data: await authService.getProfile(req.user.id) }),
};
 
const products = {
  list: async (req, res) => res.json(await productService.list()),
  get: async (req, res) => res.json({ data: await productService.getById(req.params.id) }),
};
 
module.exports = { auth, products };
