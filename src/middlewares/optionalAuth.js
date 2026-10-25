// ใช้กับ Endpoint สาธารณะ (เช่น GET /products) ที่ Admin จะเห็นข้อมูลมากกว่า
// ไม่มี token = ผ่านเป็น guest, แต่ถ้าส่ง token มาแล้ว token ผิด = 401 (ไม่ปล่อยผ่านแบบเงียบๆ)
const { authenticate } = require('./auth');
 
function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}
 
module.exports = optionalAuth;
