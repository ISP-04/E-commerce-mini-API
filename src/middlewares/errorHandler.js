// จัดการ Error ทั้งระบบที่เดียว: ตอบกลับรูปแบบเดียวกันเสมอ { error: { code, message, details? } }
const AppError = require('../utils/AppError');
 
function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}
 
function mapKnownError(err) {
  if (err instanceof AppError) return err;
 
  // JSON body พัง (WS10: Unit test เคส JSON ผิดรูปแบบ)
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  // Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference
  if (err.code === 'P2002') {
    return new AppError(409, 'DUPLICATE', 'Resource already exists');
  }
  if (err.code === 'P2025') {
    return new AppError(404, 'NOT_FOUND', 'Resource not found');
  }
  return null;
}
 
// Express นับเป็น error handler ได้เพราะมี 4 พารามิเตอร์ (ห้ามลบ _next แม้ไม่ได้ใช้)
function errorHandler(err, req, res, _next) {
  const known = mapKnownError(err);
  if (known) {
    const body = { error: { code: known.code, message: known.message } };
    if (known.details) body.error.details = known.details;
    return res.status(known.statusCode).json(body);
  }
  // Error ที่ไม่คาดคิด: log รายละเอียดฝั่งเซิร์ฟเวอร์ แต่ไม่ส่ง stack trace ให้ Client
  console.error('[error]', req.method, req.originalUrl, err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
 
module.exports = { errorHandler, notFoundHandler };
