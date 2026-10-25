// Unit test ของ State Machine คำสั่งซื้อ: ตารางกฎว่าสถานะไหนเปลี่ยนไปไหนได้
const {
  STATUS,
  ADMIN_TRANSITIONS,
  canAdminTransition,
  canCustomerCancel,
  canPay,
  holdsStock,
} = require('../../src/utils/orderStatus');

describe('canAdminTransition', () => {
  test.each([
    [STATUS.PENDING, STATUS.CANCELLED],
    [STATUS.PAID, STATUS.SHIPPED],
    [STATUS.PAID, STATUS.CANCELLED],
  ])('Admin เปลี่ยน %s -> %s ได้', (from, to) => {
    expect(canAdminTransition(from, to)).toBe(true);
  });

  test('PENDING -> PAID ไม่ได้ (ต้องผ่าน Payment endpoint เพื่อให้มีหลักฐานการชำระเงิน)', () => {
    expect(canAdminTransition(STATUS.PENDING, STATUS.PAID)).toBe(false);
  });

  test.each([
    [STATUS.SHIPPED, STATUS.CANCELLED],
    [STATUS.SHIPPED, STATUS.PAID],
    [STATUS.CANCELLED, STATUS.PENDING],
    [STATUS.CANCELLED, STATUS.PAID],
  ])('สถานะปลายทาง %s เปลี่ยนเป็น %s ไม่ได้', (from, to) => {
    expect(canAdminTransition(from, to)).toBe(false);
  });

  test('เปลี่ยนเป็นสถานะเดิม หรือสถานะที่ไม่รู้จัก -> ไม่ได้ (ไม่โยน Error)', () => {
    expect(canAdminTransition(STATUS.PAID, STATUS.PAID)).toBe(false);
    expect(canAdminTransition('UNKNOWN', STATUS.SHIPPED)).toBe(false);
    expect(canAdminTransition(undefined, STATUS.SHIPPED)).toBe(false);
  });

  test('ทุกสถานะมีกฎกำหนดไว้ครบ (กันลืมเพิ่มกฎเมื่อเพิ่มสถานะใหม่)', () => {
    expect(Object.keys(ADMIN_TRANSITIONS).sort()).toEqual(Object.values(STATUS).sort());
  });
});

describe('canCustomerCancel', () => {
  test('ยกเลิกเองได้เฉพาะตอน PENDING', () => {
    expect(canCustomerCancel(STATUS.PENDING)).toBe(true);
  });

  test.each([[STATUS.PAID], [STATUS.SHIPPED], [STATUS.CANCELLED]])(
    '%s ยกเลิกเองไม่ได้ (ต้องติดต่อ Admin)',
    (status) => {
      expect(canCustomerCancel(status)).toBe(false);
    },
  );
});

describe('canPay', () => {
  test('จ่ายได้เฉพาะ PENDING', () => {
    expect(canPay(STATUS.PENDING)).toBe(true);
  });

  test.each([[STATUS.PAID], [STATUS.SHIPPED], [STATUS.CANCELLED]])('%s จ่ายไม่ได้ (กันจ่ายซ้ำ)', (status) => {
    expect(canPay(status)).toBe(false);
  });
});

describe('holdsStock (สถานะที่จองสต็อกไว้ -> ยกเลิกแล้วต้องคืนสต็อก)', () => {
  test.each([
    [STATUS.PENDING, true],
    [STATUS.PAID, true],
    [STATUS.SHIPPED, false],
    [STATUS.CANCELLED, false],
  ])('%s -> %p', (status, expected) => {
    expect(holdsStock(status)).toBe(expected);
  });
});
