const STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
});
 
// การเปลี่ยนสถานะที่ Admin ทำได้ผ่าน PATCH /orders/:id/status
// (PENDING -> PAID ต้องผ่าน Payment endpoint เท่านั้น เพื่อให้มีหลักฐานการชำระเงินเสมอ)
const ADMIN_TRANSITIONS = Object.freeze({
  [STATUS.PENDING]: [STATUS.CANCELLED],
  [STATUS.PAID]: [STATUS.SHIPPED, STATUS.CANCELLED],
  [STATUS.SHIPPED]: [],
  [STATUS.CANCELLED]: [],
});
 
function canAdminTransition(from, to) {
  return (ADMIN_TRANSITIONS[from] || []).includes(to);
}
 
function canCustomerCancel(status) {
  return status === STATUS.PENDING;
}
 
function canPay(status) {
  return status === STATUS.PENDING;
}
 
// สถานะที่สต็อกถูก "จอง" ไว้แล้ว — ถ้ายกเลิกจากสถานะเหล่านี้ต้องคืนสต็อก
function holdsStock(status) {
  return status === STATUS.PENDING || status === STATUS.PAID;
}
 
module.exports = { STATUS, ADMIN_TRANSITIONS, canAdminTransition, canCustomerCancel, canPay, holdsStock };
