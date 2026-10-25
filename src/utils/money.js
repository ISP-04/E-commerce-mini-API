// คำนวณเงินเป็น "สตางค์" (จำนวนเต็ม) เพื่อเลี่ยงปัญหา floating point เช่น 0.1 + 0.2 !== 0.3
 
function toSatang(amount) {
  const value = typeof amount === 'object' && amount !== null ? amount.toString() : String(amount);
  if (!/^-?\d+(\.\d{1,2})?$/.test(value.trim())) {
    throw new TypeError(`Invalid money amount: ${value}`);
  }
  const [whole, fraction = ''] = value.trim().split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  const satang = Math.abs(Number.parseInt(whole, 10)) * 100 + Number.parseInt(fraction.padEnd(2, '0'), 10);
  return sign * satang;
}
 
function fromSatang(satang) {
  if (!Number.isInteger(satang)) {
    throw new TypeError('satang must be an integer');
  }
  const sign = satang < 0 ? '-' : '';
  const abs = Math.abs(satang);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
 
/**
 * คำนวณยอดรวมของรายการสินค้า
 * @param {{unitPrice: string|number|object, quantity: number}[]} lines
 * @returns {{lines: {unitPrice: string, quantity: number, subtotal: string}[], total: string}}
 */
function calculateOrderTotals(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Order must contain at least one line');
  }
  let totalSatang = 0;
  const computed = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error('quantity must be a positive integer');
    }
    const unit = toSatang(line.unitPrice);
    if (unit < 0) {
      throw new Error('unitPrice must not be negative');
    }
    const subtotal = unit * line.quantity;
    totalSatang += subtotal;
    return { ...line, unitPrice: fromSatang(unit), subtotal: fromSatang(subtotal) };
  });
  return { lines: computed, total: fromSatang(totalSatang) };
}
 
module.exports = { toSatang, fromSatang, calculateOrderTotals };
