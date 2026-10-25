// Zod schemas สำหรับตรวจสอบ Input ทุก Endpoint (บทถัดๆ ไปจะเพิ่มของ Cart, Order)
const { z } = require('zod');
 
const uuid = z.uuid({ message: 'must be a valid UUID' });
const idParam = z.object({ id: uuid });
 
// ราคา: ตัวเลขบวก ทศนิยมไม่เกิน 2 ตำแหน่ง รับได้ทั้ง number และ string ("199.50")
const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,8}(\.\d{1,2})?$/.test(v), { message: 'must be a positive amount with at most 2 decimals' });
 
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
 
const product = {
  listQuery: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      q: z.string().trim().max(100).optional(),
      category: z.string().trim().max(50).optional(),
      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),
      inStock: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
      sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
    })
    .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
      message: 'minPrice must be less than or equal to maxPrice',
      path: ['minPrice'],
    }),
  create: z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    price: money,
    stock: z.number().int().min(0).max(1_000_000),
    category: z.string().trim().min(1).max(50),
    imageUrl: z.url().max(500).optional(),
  }),
};
product.update = product.create
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, { message: 'at least one field is required' });
 
module.exports = { idParam, auth, product };
