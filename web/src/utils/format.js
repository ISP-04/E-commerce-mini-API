// API ส่งเงินเป็น String เช่น "3290.00" เพื่อไม่ให้เสียความแม่นยำ (บทที่ 03)
// หน้าเว็บแปลงเป็นตัวเลขเพื่อ "แสดงผล" เท่านั้น ยอดรวมทุกตัวใช้ค่าที่ API คำนวณให้ ไม่คำนวณเองฝั่ง Client
const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
 
export const formatBaht = (amount) => baht.format(Number(amount));
 
export const formatDate = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
 
// แสดงเลขคำสั่งซื้อแบบสั้น 8 ตัวแรกของ UUID
export const shortId = (uuid) => uuid.slice(0, 8).toUpperCase();
 
export const STATUS_LABELS = {
  PENDING: 'รอชำระเงิน',
  PAID: 'ชำระเงินแล้ว',
  SHIPPED: 'จัดส่งแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
};
 
export const PAYMENT_METHODS = {
  CARD: 'บัตรเครดิต/เดบิต',
  PROMPTPAY: 'พร้อมเพย์',
  BANK_TRANSFER: 'โอนผ่านธนาคาร',
};
 
// API ไม่มี Endpoint รายชื่อหมวดหมู่ จึงกำหนดไว้ตรงนี้ให้ตรงกับ prisma/seed.js
export const CATEGORIES = {
  boards: 'บอร์ด',
  sensors: 'เซนเซอร์',
  actuators: 'อุปกรณ์ขับเคลื่อน',
  accessories: 'อุปกรณ์เสริม',
};