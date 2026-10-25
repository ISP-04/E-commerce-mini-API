// โหลดก่อนทุก test file: ตั้งค่า env สำหรับการทดสอบ (ไม่แตะฐานข้อมูล production)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://shop:shop@localhost:5432/shop_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';
// ปิด RabbitMQ/gRPC ใน test เป็นค่าเริ่มต้น (มี test เฉพาะที่เปิดเอง) — Redis ใช้ตาม env ถ้ามี (CI มี service redis)
process.env.RABBITMQ_URL = '';
process.env.INVENTORY_GRPC_URL = '';
process.env.REDIS_URL = process.env.REDIS_URL || '';
