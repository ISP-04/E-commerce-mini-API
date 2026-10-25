// Zod schemas สำหรับตรวจสอบ Input ทุก Endpoint
const { z } = require('zod');

const auth = {
  register: z.object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    // bcrypt ใช้แค่ 72 byte แรก — ภาษาไทย 1 ตัวอักษร = 3 byte (UTF-8) จึงต้องนับเป็น byte ไม่ใช่ตัวอักษร
    // ไม่งั้นรหัสผ่านไทยยาวๆ ที่ต่างกันแค่ท้ายสุดจะ login ได้ทั้งคู่
    password: z
      .string()
      .min(8, 'must be at least 8 characters')
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, { message: 'must be at most 72 bytes (UTF-8)' }),
    name: z.string().trim().min(1).max(100),
  }),
  login: z.object({
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(200),
  }),
};

module.exports = { auth };
