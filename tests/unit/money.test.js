// WS9 กิจกรรมที่ 1: Unit test ของ Business logic บริสุทธิ์ ตามรูปแบบ Arrange-Act-Assert (AAA)
const { calculateOrderTotals, toSatang, fromSatang } = require('../../src/utils/money');
 
describe('calculateOrderTotals', () => {
  test('รวมยอดหลายรายการได้ถูกต้อง', () => {
    // Arrange
    const lines = [
      { unitPrice: '249.00', quantity: 2 },
      { unitPrice: '159.50', quantity: 1 },
    ];
    // Act
    const result = calculateOrderTotals(lines);
    // Assert
    expect(result.total).toBe('657.50');
    expect(result.lines.map((l) => l.subtotal)).toEqual(['498.00', '159.50']);
  });
 
  test('ไม่มีปัญหา floating point (0.1 + 0.2)', () => {
    // Arrange
    const lines = [
      { unitPrice: '0.10', quantity: 1 },
      { unitPrice: '0.20', quantity: 1 },
    ];
    // Act
    const { total } = calculateOrderTotals(lines);
    // Assert
    expect(total).toBe('0.30');
  });
 
  test('รับ Decimal object (เช่น Prisma.Decimal) ผ่าน toString()', () => {
    const decimalLike = { toString: () => '19.9' };
    expect(calculateOrderTotals([{ unitPrice: decimalLike, quantity: 3 }]).total).toBe('59.70');
  });
 
  test.each([
    [[], 'at least one line'],
    [[{ unitPrice: '10.00', quantity: 0 }], 'positive integer'],
    [[{ unitPrice: '10.00', quantity: 1.5 }], 'positive integer'],
    [[{ unitPrice: '-1.00', quantity: 1 }], 'must not be negative'],
  ])('ปฏิเสธข้อมูลไม่ถูกต้อง %#', (lines, message) => {
    expect(() => calculateOrderTotals(lines)).toThrow(message);
  });
});
 
describe('toSatang / fromSatang', () => {
  test.each([
    ['100', 10000],
    ['100.5', 10050],
    ['0.01', 1],
    ['-0.50', -50],
    [12.34, 1234],
  ])('toSatang(%p) = %p', (input, expected) => {
    expect(toSatang(input)).toBe(expected);
  });
 
  test('ปฏิเสธทศนิยมเกิน 2 ตำแหน่ง และค่าที่ไม่ใช่ตัวเลข', () => {
    expect(() => toSatang('1.234')).toThrow(TypeError);
    expect(() => toSatang('abc')).toThrow(TypeError);
  });
 
  test.each([
    [0, '0.00'],
    [5, '0.05'],
    [123456, '1234.56'],
    [-50, '-0.50'],
  ])('fromSatang(%p) = %p', (input, expected) => {
    expect(fromSatang(input)).toBe(expected);
  });
 
  test('fromSatang ปฏิเสธค่าที่ไม่ใช่จำนวนเต็ม', () => {
    expect(() => fromSatang(1.5)).toThrow(TypeError);
  });
});
