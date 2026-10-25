// โครงสร้าง Queue ที่ API (Producer) และ Worker (Consumer) ต้องประกาศให้ตรงกัน
// แยกไฟล์ไว้เพื่อให้ Worker ใช้ได้โดยไม่ต้องโหลด config ของ API (JWT_SECRET, DATABASE_URL)
const DLX = 'order_events.dlx';
const DLQ = 'order_events.dead';
 
async function assertTopology(ch, queue) {
  await ch.assertExchange(DLX, 'fanout', { durable: true });
  await ch.assertQueue(DLQ, { durable: true });
  await ch.bindQueue(DLQ, DLX, '');
  // durable: true -> Queue อยู่รอดเมื่อ RabbitMQ รีสตาร์ท (คู่กับ persistent message)
  await ch.assertQueue(queue, { durable: true, deadLetterExchange: DLX });
}
 
module.exports = { assertTopology, DLX, DLQ };
