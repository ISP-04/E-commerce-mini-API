// Error มาตรฐานของแอป: มี HTTP status + code ที่ฝั่ง Client ใช้ตัดสินใจได้
class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
 
  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
 
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
 
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  }
 
  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }
 
  static conflict(code, message, details) {
    return new AppError(409, code, message, details);
  }
}
 
module.exports = AppError;
