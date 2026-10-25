// WS6: Authentication (AuthN = คุณคือใคร) และ Authorization (AuthZ = คุณทำอะไรได้)
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
 
function verifyToken(token) {
  // ระบุ algorithms ชัดเจน ป้องกันการโจมตีแบบ "alg: none" / สลับอัลกอริทึม
  const payload = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
  if (!payload || typeof payload.sub !== 'string' || !payload.role) {
    throw new Error('Malformed token payload');
  }
  return { id: payload.sub, role: payload.role, email: payload.email, exp: payload.exp };
}
 
function signToken(user) {
  return jwt.sign({ role: user.role, email: user.email }, env.jwt.secret, {
    subject: user.id,
    expiresIn: env.jwt.expiresIn,
    algorithm: 'HS256',
  });
}
 
// Auth Middleware: ไม่มี token / token ผิด / หมดอายุ => 401 Unauthorized
function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }
  try {
    const { id, role, email } = verifyToken(token);
    req.user = { id, role, email };
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return next(AppError.unauthorized(message));
  }
}
 
// Role Middleware: ล็อกอินแล้วแต่ role ไม่ถึง => 403 Forbidden
function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}
 
module.exports = { authenticate, authorize, signToken, verifyToken };
