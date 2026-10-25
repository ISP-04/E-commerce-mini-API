// Event bus ภายใน process: Service ปล่อย event -> ผู้ฟัง (RabbitMQ publisher, WebSocket) ทำงานต่อ
// ทำให้ Service ไม่ต้องรู้จัก WebSocket/RabbitMQ โดยตรง (Loose coupling) และทดสอบง่าย
const { EventEmitter } = require('node:events');
const { publishEvent } = require('./messageQueue');
 
const EVENTS = Object.freeze({
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_PAID: 'ORDER_PAID',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  LOW_STOCK: 'LOW_STOCK',
});
 
const bus = new EventEmitter();
bus.setMaxListeners(50);
 
// ส่งเฉพาะ event ที่ต้องทำงานเบื้องหลัง (อีเมล/แจ้งเตือน) เข้า Queue
const QUEUED_EVENTS = new Set(Object.values(EVENTS));
 
function emitDomainEvent(type, payload) {
  bus.emit(type, payload);
  if (QUEUED_EVENTS.has(type)) {
    publishEvent(type, payload).catch((err) => console.warn('[events] publish error:', err.message));
  }
}
 
module.exports = { bus, EVENTS, emitDomainEvent };
