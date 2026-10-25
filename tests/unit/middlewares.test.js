// Unit test ของ Middleware: สร้าง req/res/next ปลอม ไม่ต้องเปิดแอปจริง
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const { authenticate, authorize, signToken, verifyToken } = require('../../src/middlewares/auth');
const validate = require('../../src/middlewares/validate');
const { errorHandler, notFoundHandler } = require('../../src/middlewares/errorHandler');
const AppError = require('../../src/utils/AppError');
const env = require('../../src/config/env');

const USER = { id: '11111111-1111-4111-8111-111111111111', role: 'CUSTOMER', email: 'a@test.local' };

// res ปลอมที่จดจำ status/body ที่ถูกเรียก (รองรับการต่อ .status().json())
function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('authenticate', () => {
  test('Token ถูกต้อง -> ใส่ req.user แล้วไปต่อ', () => {
    // Arrange
    const req = { headers: { authorization: `Bearer ${signToken(USER)}` } };
    const next = jest.fn();

    // Act
    authenticate(req, mockRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual(USER);
  });

  test.each([
    ['ไม่มี Header', {}],
    ['Scheme ผิด', { authorization: `Basic ${signToken(USER)}` }],
    ['มีแต่คำว่า Bearer', { authorization: 'Bearer' }],
  ])('%s -> 401 UNAUTHORIZED', (_label, headers) => {
    const next = jest.fn();
    authenticate({ headers }, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });

  test('Token ปลอม (เซ็นด้วย secret อื่น) -> 401 Invalid token', () => {
    const forged = jwt.sign({ role: 'ADMIN' }, 'another-secret', { subject: USER.id, algorithm: 'HS256' });
    const next = jest.fn();
    authenticate({ headers: { authorization: `Bearer ${forged}` } }, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, message: 'Invalid token' });
  });

  test('Token หมดอายุ -> 401 Token expired (ข้อความต่างจาก Token ปลอม)', () => {
    const expired = jwt.sign({ role: 'CUSTOMER' }, env.jwt.secret, {
      subject: USER.id,
      algorithm: 'HS256',
      expiresIn: '-1s',
    });
    const next = jest.fn();
    authenticate({ headers: { authorization: `Bearer ${expired}` } }, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, message: 'Token expired' });
  });

  test('verifyToken ปฏิเสธ Payload ที่ไม่มี sub/role (Malformed)', () => {
    const noRole = jwt.sign({ foo: 'bar' }, env.jwt.secret, { subject: USER.id, algorithm: 'HS256' });
    expect(() => verifyToken(noRole)).toThrow('Malformed token payload');
  });

  test('ปฏิเสธ alg: none (ป้องกันการสลับอัลกอริทึม)', () => {
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: USER.id, role: 'ADMIN' }),
    ).toString('base64url')}.`;
    expect(() => verifyToken(unsigned)).toThrow();
  });
});

describe('authorize', () => {
  test('Role ตรง -> ผ่าน', () => {
    const next = jest.fn();
    authorize('ADMIN')({ user: { role: 'ADMIN' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test('ล็อกอินแล้วแต่ Role ไม่ถึง -> 403 FORBIDDEN', () => {
    const next = jest.fn();
    authorize('ADMIN')({ user: { role: 'CUSTOMER' } }, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  test('ยังไม่ล็อกอิน -> 401 ไม่ใช่ 403', () => {
    const next = jest.fn();
    authorize('ADMIN')({}, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  test('รับหลาย Role ได้', () => {
    const next = jest.fn();
    authorize('ADMIN', 'CUSTOMER')({ user: { role: 'CUSTOMER' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('validate', () => {
  const schema = { body: z.object({ quantity: z.number().int().min(1) }) };

  test('ผ่านแล้วเก็บผลที่ req.valid (ไม่เขียนทับ req.body)', () => {
    const req = { body: { quantity: 3 } };
    const next = jest.fn();
    validate(schema)(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.valid.body).toEqual({ quantity: 3 });
  });

  test('ข้อมูลผิด -> 400 VALIDATION_ERROR พร้อม details ระบุ field', () => {
    const next = jest.fn();
    validate(schema)({ body: { quantity: 0 } }, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(err.details[0].field).toBe('body.quantity');
  });

  test('ใส่ค่า default จาก Schema และตรวจ query/params ได้ด้วย', () => {
    const req = { query: { page: '2' }, params: { id: '11111111-1111-4111-8111-111111111111' } };
    const next = jest.fn();
    validate({
      query: z.object({ page: z.coerce.number().default(1), limit: z.coerce.number().default(10) }),
      params: z.object({ id: z.uuid() }),
    })(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.valid.query).toEqual({ page: 2, limit: 10 });
  });

  test('ไม่มี body เลย -> ตรวจเทียบกับ object ว่าง (ไม่ระเบิด)', () => {
    const next = jest.fn();
    validate(schema)({}, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('errorHandler', () => {
  const req = { method: 'POST', originalUrl: '/api/v1/orders' };

  test('AppError -> ใช้ status/code ของตัวเอง และแนบ details', () => {
    const res = mockRes();
    errorHandler(AppError.conflict('INSUFFICIENT_STOCK', 'out of stock', [{ productId: 'p1' }]), req, res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', message: 'out of stock' });
    expect(res.body.error.details).toHaveLength(1);
  });

  test('ไม่มี details -> ไม่มี key details ในคำตอบ', () => {
    const res = mockRes();
    errorHandler(AppError.notFound('Product'), req, res, jest.fn());
    expect(res.statusCode).toBe(404);
    expect(res.body.error).not.toHaveProperty('details');
  });

  test.each([
    [{ type: 'entity.parse.failed' }, 400, 'INVALID_JSON'],
    [{ type: 'entity.too.large' }, 413, 'PAYLOAD_TOO_LARGE'],
    [{ code: 'P2002' }, 409, 'DUPLICATE'],
    [{ code: 'P2025' }, 404, 'NOT_FOUND'],
  ])('แปลง Error ที่รู้จัก %# -> %p', (err, status, code) => {
    const res = mockRes();
    errorHandler(err, req, res, jest.fn());
    expect(res.statusCode).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  test('Error ที่ไม่คาดคิด -> 500 และไม่ส่ง stack trace ให้ Client', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    errorHandler(new Error('boom: /home/secret/path'), req, res, jest.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    spy.mockRestore();
  });

  test('notFoundHandler -> ส่ง 404 ROUTE_NOT_FOUND ที่ระบุ Method และ URL', () => {
    const next = jest.fn();
    notFoundHandler({ method: 'GET', originalUrl: '/nope' }, mockRes(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404, code: 'ROUTE_NOT_FOUND' });
    expect(next.mock.calls[0][0].message).toContain('GET /nope');
  });
});
