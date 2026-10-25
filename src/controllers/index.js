// Controllers: รับ Request -> เรียก Service -> ตอบ Response (ไม่มี Business logic ในชั้นนี้)
// Express 5 ส่ง Error จาก async handler ไปที่ errorHandler ให้อัตโนมัติ
const authService = require('../services/auth.service');

const auth = {
  register: async (req, res) => res.status(201).json({ data: await authService.register(req.valid.body) }),
  login: async (req, res) => res.json({ data: await authService.login(req.valid.body) }),
  me: async (req, res) => res.json({ data: await authService.getProfile(req.user.id) }),
};

module.exports = { auth };
