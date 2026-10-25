// Unit test ของ auth.service: Mock Prisma และ bcrypt — ไม่ต้องมีฐานข้อมูล
jest.mock('../../src/lib/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
}));

const bcrypt = require('bcryptjs');
const prisma = require('../../src/lib/prisma');
const authService = require('../../src/services/auth.service');
const { verifyToken } = require('../../src/middlewares/auth');

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alice@test.local',
  passwordHash: '$2b$04$hash',
  name: 'Alice',
  role: 'CUSTOMER',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('register', () => {
  test('สมัครสำเร็จ -> คืนข้อมูลผู้ใช้โดยไม่มี passwordHash', async () => {
    // Arrange
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(ROW);

    // Act
    const user = await authService.register({ email: ROW.email, password: 'password123', name: 'Alice' });

    // Assert
    expect(user).toEqual({
      id: ROW.id,
      email: ROW.email,
      name: 'Alice',
      role: 'CUSTOMER',
      createdAt: ROW.createdAt,
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  test('เก็บเฉพาะ hash ไม่เก็บรหัสผ่านดิบ และ hash ตรวจสอบกลับได้', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(ROW);

    await authService.register({ email: ROW.email, password: 'password123', name: 'Alice' });

    const { data } = prisma.user.create.mock.calls[0][0];
    expect(data.passwordHash).not.toBe('password123');
    expect(bcrypt.compareSync('password123', data.passwordHash)).toBe(true);
  });

  test('role มาจากฝั่งเซิร์ฟเวอร์เสมอ เป็น CUSTOMER (กัน Privilege escalation)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ ...ROW, role: 'CUSTOMER' });

    await authService.register({ email: ROW.email, password: 'password123', name: 'Alice', role: 'ADMIN' });

    expect(prisma.user.create.mock.calls[0][0].data.role).toBe('CUSTOMER');
  });

  test('อีเมลซ้ำ -> 409 EMAIL_TAKEN และไม่สร้างผู้ใช้', async () => {
    prisma.user.findUnique.mockResolvedValue(ROW);

    await expect(
      authService.register({ email: ROW.email, password: 'password123', name: 'Alice' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  const HASH = bcrypt.hashSync('password123', 4);

  test('รหัสถูก -> คืน Token ที่ถอดกลับได้เป็น id และ role ของผู้ใช้', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...ROW, passwordHash: HASH });

    const result = await authService.login({ email: ROW.email, password: 'password123' });

    expect(result.tokenType).toBe('Bearer');
    expect(verifyToken(result.token)).toMatchObject({ id: ROW.id, role: 'CUSTOMER', email: ROW.email });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  test('รหัสผิด -> 401 INVALID_CREDENTIALS', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...ROW, passwordHash: HASH });

    await expect(authService.login({ email: ROW.email, password: 'wrong-password' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  test('ไม่พบอีเมล -> ข้อความเดียวกับรหัสผิด (ไม่บอกว่าอีเมลไหนมีในระบบ)', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...ROW, passwordHash: HASH });
    const wrongPassword = await authService.login({ email: ROW.email, password: 'nope' }).catch((e) => e);
    prisma.user.findUnique.mockResolvedValue(null);
    const noUser = await authService.login({ email: 'ghost@test.local', password: 'nope' }).catch((e) => e);

    expect(noUser.message).toBe(wrongPassword.message);
    expect(noUser.code).toBe(wrongPassword.code);
  });

  test('ไม่พบอีเมล -> ยังเทียบ hash จำลอง (ลดการเดาจากเวลาตอบสนอง)', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    prisma.user.findUnique.mockResolvedValue(null);

    await authService.login({ email: 'ghost@test.local', password: 'nope' }).catch(() => {});

    expect(compare).toHaveBeenCalled();
    expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$/);
    compare.mockRestore();
  });
});

describe('getProfile', () => {
  test('พบผู้ใช้ -> คืนข้อมูลสาธารณะ', async () => {
    prisma.user.findUnique.mockResolvedValue(ROW);
    expect(await authService.getProfile(ROW.id)).toMatchObject({ id: ROW.id, email: ROW.email });
  });

  test('ไม่พบผู้ใช้ (เช่น ถูกลบหลังออก Token) -> 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(authService.getProfile(ROW.id)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
