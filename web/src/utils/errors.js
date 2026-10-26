// แปลง Error code จาก API เป็นข้อความภาษาไทยสำหรับผู้ใช้
// ใช้ code ในการตัดสินใจ ไม่ใช้ message เพราะ message ของ API เป็นข้อความสำหรับนักพัฒนา
const MESSAGES = {
  NETWORK_ERROR: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจการเชื่อมต่อ',
  INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  EMAIL_TAKEN: 'อีเมลนี้ถูกใช้สมัครแล้ว',
  RATE_LIMITED: 'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
  INSUFFICIENT_STOCK: 'สินค้าในสต็อกไม่พอ',
  PAYMENT_FAILED: 'ธนาคารปฏิเสธการชำระเงิน คำสั่งซื้อยังรอชำระอยู่ ลองใหม่ได้',
  INVALID_ORDER_STATE: 'สถานะคำสั่งซื้อเปลี่ยนไปแล้ว ไม่สามารถทำรายการนี้ได้',
  ORDER_STATE_CHANGED: 'คำสั่งซื้อถูกแก้ไขพร้อมกันจากที่อื่น กรุณาโหลดใหม่',
  NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
  UNAUTHORIZED: 'กรุณาเข้าสู่ระบบใหม่',
};
 
export function errorMessage(err) {
  if (!err) return '';
  // id ใน URL ผิดรูปแบบ (เช่น /orders/abc) ผู้ใช้ไม่ต้องรู้รายละเอียด ให้เห็นเหมือนหาไม่พบ
  const details = Array.isArray(err.details) ? err.details : [];
  if (
    err.code === 'VALIDATION_ERROR' &&
    details.length > 0 &&
    details.every((d) => String(d.field).startsWith('params.'))
  ) {
    return MESSAGES.NOT_FOUND;
  }
  if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
    // details จาก validate middleware (บทที่ 02): [{ field: 'body.password', message: '...' }]
    return err.details.map((d) => `${String(d.field).replace(/^(body|query|params)\./, '')}: ${d.message}`).join(', ');
  }
  return MESSAGES[err.code] || err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}
