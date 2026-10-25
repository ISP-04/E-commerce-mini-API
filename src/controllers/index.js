// Express 5 ส่ง Error จาก async function ไปที่ errorHandler ให้อัตโนมัติ ไม่ต้องเขียน try/catch
const productService = require('../services/product.service');
 
const products = {
  list: async (req, res) => res.json(await productService.list()),
  get: async (req, res) => res.json({ data: await productService.getById(req.params.id) }),
};
 
module.exports = { products };
