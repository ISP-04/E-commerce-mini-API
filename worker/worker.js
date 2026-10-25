// WS7: Consumer / Background Worker — ดึงงานจาก Queue "order_events" ไปส่งอีเมล (จำลอง)
// รันได้หลายตัวพร้อมกัน (Scalability): RabbitMQ จะแจกงานแบบ Round-robin ให้ Worker แต่ละตัว
require('dotenv').config({ quiet: true });
const amqp = require('amqplib');
const { assertTopology } = require('../src/lib/mqTopology');
 
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QUEUE = process.env.ORDER_QUEUE || 'order_events';
const EMAIL_DELAY_MS = Number.parseInt(process.env.EMAIL_DELAY_MS || '3000', 10);
const MAX_ATTEMPTS = 3;
const WORKER_ID = process.env.HOSTNAME || `worker-${process.pid}`;
 
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
 
// แปลง Event เป็นอีเมล (Pure function — ทดสอบได้ง่าย)
function buildEmail(message) {
  const { type, payload } = message;
  switch (type) {
    case 'ORDER_CREATED':
      return {
        to: payload.email,
        subject: `ยืนยันคำสั่งซื้อ #${payload.orderId.slice(0, 8)}`,
        body: `ยอดรวม ${payload.totalAmount} บาท`,
      };
    case 'ORDER_PAID':
      return {
        to: payload.email,
        subject: `ชำระเงินสำเร็จ #${payload.orderId.slice(0, 8)}`,
        body: `เลขอ้างอิง ${payload.transactionRef}`,
      };
    case 'ORDER_STATUS_CHANGED':
      return {
        to: `user:${payload.userId}`,
        subject: `คำสั่งซื้อ #${payload.orderId.slice(0, 8)} เปลี่ยนสถานะ`,
        body: `${payload.from} -> ${payload.to}`,
      };
    case 'LOW_STOCK':
      return {
        to: 'admin@shop.local',
        subject: `[ALERT] สินค้าใกล้หมด: ${payload.name}`,
        body: `เหลือ ${payload.remaining} ชิ้น`,
      };
    default:
      return null;
  }
}
 
async function sendEmail(email) {
  console.log(`[${WORKER_ID}] [x] ${email.subject} -> ${email.to}. Sending email...`);
  await sleep(EMAIL_DELAY_MS); // จำลองความหน่วงของ SMTP server
  console.log(`[${WORKER_ID}] [v] Email sent successfully! (${email.body})`);
}
 
async function start() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await assertTopology(channel, QUEUE);
  channel.prefetch(1); // รับทีละ 1 งาน ทำเสร็จค่อยรับงานใหม่ -> กระจายงานเท่ากันระหว่าง Worker
 
  console.log(`[${WORKER_ID}] waiting for messages in "${QUEUE}"...`);
 
  await channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const attempts = (msg.properties.headers && msg.properties.headers['x-attempts']) || 0;
    try {
      const message = JSON.parse(msg.content.toString());
      const email = buildEmail(message);
      if (email) await sendEmail(email);
      channel.ack(msg); // บอก RabbitMQ ว่า "ทำเสร็จแล้ว ลบออกจากคิวได้"
    } catch (err) {
      console.error(`[${WORKER_ID}] failed (attempt ${attempts + 1}/${MAX_ATTEMPTS}):`, err.message);
      if (attempts + 1 < MAX_ATTEMPTS && !(err instanceof SyntaxError)) {
        // Retry: ส่งกลับเข้าคิวพร้อมนับจำนวนครั้ง แล้ว ack ตัวเดิม
        channel.sendToQueue(QUEUE, msg.content, {
          persistent: true,
          contentType: msg.properties.contentType,
          type: msg.properties.type,
          headers: { ...msg.properties.headers, 'x-attempts': attempts + 1 },
        });
        channel.ack(msg);
      } else {
        // เกินจำนวนครั้ง/ข้อมูลพัง -> nack ไม่ requeue -> ไปที่ Dead Letter Queue ให้คนตรวจสอบ
        channel.nack(msg, false, false);
      }
    }
  });
 
  const shutdown = async () => {
    console.log(`[${WORKER_ID}] shutting down...`);
    try {
      await channel.close();
      await connection.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
 
if (require.main === module) {
  // รอ RabbitMQ พร้อม (ตอน docker compose up ระบบอาจบูตไม่พร้อมกัน)
  (async () => {
    for (let i = 1; ; i += 1) {
      try {
        await start();
        return;
      } catch (err) {
        if (i >= 10) {
          console.error(`[${WORKER_ID}] cannot connect to RabbitMQ:`, err.message);
          process.exit(1);
        }
        console.warn(`[${WORKER_ID}] RabbitMQ not ready (${err.message}), retry ${i}/10 in 3s`);
        await sleep(3000);
      }
    }
  })();
}
 
module.exports = { buildEmail };
