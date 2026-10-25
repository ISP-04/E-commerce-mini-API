// WS6: Register (bcrypt hash) + Login (JWT)
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { signToken } = require('../middlewares/auth');
 
const SALT_ROUNDS = 10;
// hash จำลองไว้เทียบเมื่อไม่พบ user — ให้เวลาตอบสนองใกล้เคียงกัน ลดการเดาว่าอีเมลไหนมีในระบบ (Timing attack)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);
 
function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}
 
async function register({ email, password, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw AppError.conflict('EMAIL_TAKEN', 'Email is already registered');
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // role ไม่รับจาก Client เด็ดขาด — สมัครใหม่เป็น CUSTOMER เสมอ (ป้องกัน Privilege escalation)
  const user = await prisma.user.create({ data: { email, passwordHash, name, role: 'CUSTOMER' } });
  return toPublicUser(user);
}
 
async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    // ข้อความเดียวกันทั้งกรณีไม่พบ user และรหัสผิด
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return { token: signToken(user), tokenType: 'Bearer', user: toPublicUser(user) };
}
 
async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User');
  return toPublicUser(user);
}
 
module.exports = { register, login, getProfile, toPublicUser, SALT_ROUNDS };
