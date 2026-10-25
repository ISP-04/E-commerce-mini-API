// WS7: Producer — โยนงาน (เช่น ส่งอีเมลยืนยันคำสั่งซื้อ) เข้า RabbitMQ แทนการทำใน Request
// WS10: Durable queue + persistent message => ข้อความไม่หายเมื่อ RabbitMQ รีสตาร์ท
const amqp = require('amqplib');
const env = require('../config/env');
 
const { assertTopology, DLX, DLQ } = require('./mqTopology');
 
let connection = null;
let channel = null;
let connecting = null;
 
async function connect() {
  if (!env.rabbitmqUrl) return null;
  if (channel) return channel;
  if (connecting) return connecting;
 
  connecting = (async () => {
    try {
      connection = await amqp.connect(env.rabbitmqUrl);
      connection.on('error', (err) => console.warn('[rabbitmq] connection error:', err.message));
      connection.on('close', () => {
        console.warn('[rabbitmq] connection closed');
        connection = null;
        channel = null;
      });
      // ConfirmChannel: broker ตอบกลับ (ack) เมื่อเก็บข้อความเรียบร้อย
      channel = await connection.createConfirmChannel();
      await assertTopology(channel, env.orderQueue);
      console.log('[rabbitmq] connected, queue =', env.orderQueue);
      return channel;
    } catch (err) {
      console.warn('[rabbitmq] connect failed:', err.message);
      connection = null;
      channel = null;
      return null;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}
 
/**
 * Publish event แบบ best-effort: ถ้า Broker ล่ม จะคืนค่า false แต่ไม่ทำให้ Request ล้ม
 * (ข้อจำกัด: ถ้าต้องการรับประกัน 100% ควรใช้ Transactional Outbox Pattern — ดู README)
 */
async function publishEvent(type, payload) {
  const ch = await connect();
  if (!ch) return false;
  const message = { type, payload, occurredAt: new Date().toISOString() };
  try {
    ch.sendToQueue(env.orderQueue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
      type,
    });
    await ch.waitForConfirms();
    return true;
  } catch (err) {
    console.warn('[rabbitmq] publish failed:', err.message);
    return false;
  }
}
 
async function disconnect() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch {
    // ignore
  }
  channel = null;
  connection = null;
}
 
module.exports = { connect, publishEvent, disconnect, assertTopology, DLX, DLQ };
