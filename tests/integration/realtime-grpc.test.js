// Integration test: WebSocket (WS1) และ gRPC Inventory Service (WS2)
// เปิด HTTP server จริงบนพอร์ตว่าง (พอร์ต 0) เพราะ WebSocket ต้องมี HTTP Upgrade จริง
const http = require('node:http');
const WebSocket = require('ws');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { attachWebSocket } = require('../../src/realtime/websocket');
const { grpc, InventoryService } = require('../../src/grpc/protoLoader');
const grpcServer = require('../../src/grpc/inventory.server');
const { prisma, resetDb, createUser, createProduct } = require('../helpers/db');

const ADDRESS = 'Kasetsart University Chalermphrakiat, Sakon Nakhon';

let app;
let server;
let wss;
let baseWsUrl;

beforeAll(async () => {
  app = createApp();
  server = http.createServer(app);
  wss = attachWebSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseWsUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});

afterAll(async () => {
  wss.close();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

beforeEach(resetDb);

// ---------- ตัวช่วยของ WebSocket ----------

/** เปิด connection แล้วรอข้อความ "connected" (ถ้า handshake ถูกปฏิเสธจะ reject) */
function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseWsUrl}?token=${token}`);
    const received = [];
    ws.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on('open', () => {
      ws.received = received;
      // รอข้อความแรก (connected) ก่อนคืนค่า
      const wait = setInterval(() => {
        if (received.length > 0) {
          clearInterval(wait);
          resolve(ws);
        }
      }, 5);
    });
  });
}

/** รอให้มีข้อความชนิดที่ต้องการเข้ามา (หรือหมดเวลา) */
async function waitForEvent(ws, event, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = ws.received.find((m) => m.event === event);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
}

const close = (...sockets) => sockets.forEach((ws) => ws && ws.close());

describe('WebSocket /ws (Authentication ตอน Handshake)', () => {
  test('ไม่มี token -> ปฏิเสธด้วย 401 ตั้งแต่ Handshake (ไม่เปิด connection)', async () => {
    await expect(connect('')).rejects.toThrow(/401/);
  });

  test('token ปลอม -> 401', async () => {
    await expect(connect('not.a.jwt')).rejects.toThrow(/401/);
  });

  test('token หมดอายุ -> 401', async () => {
    const jwt = require('jsonwebtoken');
    const env = require('../../src/config/env');
    const expired = jwt.sign({ role: 'CUSTOMER' }, env.jwt.secret, {
      subject: '11111111-1111-4111-8111-111111111111',
      algorithm: 'HS256',
      expiresIn: '-1s',
    });
    await expect(connect(expired)).rejects.toThrow(/401/);
  });

  test('token ถูกต้อง -> ได้ข้อความ connected พร้อม userId และ role', async () => {
    const alice = await createUser();
    const ws = await connect(alice.token);

    expect(ws.received[0]).toEqual({ event: 'connected', data: { userId: alice.user.id, role: 'CUSTOMER' } });
    close(ws);
  });

  test('path อื่นที่ไม่ใช่ /ws -> ต่อไม่ได้', async () => {
    const alice = await createUser();
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/other?token=${alice.token}`);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
      }),
    ).rejects.toThrow();
  });
});

describe('WebSocket: ส่ง Event ตามสิทธิ์', () => {
  test('ลูกค้าได้ order.created ของตัวเอง และ Admin ก็ได้ด้วย', async () => {
    const alice = await createUser();
    const admin = await createUser({ role: 'ADMIN' });
    const product = await createProduct({ stock: 10 });
    const aliceWs = await connect(alice.token);
    const adminWs = await connect(admin.token);

    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: product.id, quantity: 1 });
    const res = await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });

    expect(res.status).toBe(201);
    expect(await waitForEvent(aliceWs, 'order.created')).toMatchObject({ data: { orderId: res.body.data.id } });
    expect(await waitForEvent(adminWs, 'order.created')).toMatchObject({ data: { orderId: res.body.data.id } });
    close(aliceWs, adminWs);
  });

  test('ลูกค้าคนอื่นไม่ได้รับ order.created ของคนอื่น', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const product = await createProduct({ stock: 10 });
    const bobWs = await connect(bob.token);

    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: product.id, quantity: 1 });
    await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });

    expect(await waitForEvent(bobWs, 'order.created', 400)).toBeNull();
    close(bobWs);
  });

  test('stock.low ส่งให้ Admin เท่านั้น', async () => {
    const alice = await createUser();
    const admin = await createUser({ role: 'ADMIN' });
    const product = await createProduct({ stock: 2 }); // ต่ำกว่า LOW_STOCK_THRESHOLD
    const aliceWs = await connect(alice.token);
    const adminWs = await connect(admin.token);

    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: product.id, quantity: 1 });
    await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });

    expect(await waitForEvent(adminWs, 'stock.low')).toMatchObject({ data: { productId: product.id, remaining: 1 } });
    expect(await waitForEvent(aliceWs, 'stock.low', 400)).toBeNull();
    close(aliceWs, adminWs);
  });

  test('ลูกค้าได้ order.status_changed เมื่อ Admin เปลี่ยนสถานะ', async () => {
    const alice = await createUser();
    const admin = await createUser({ role: 'ADMIN' });
    const product = await createProduct({ stock: 10 });
    const aliceWs = await connect(alice.token);

    await request(app).post('/api/v1/cart').set(alice.auth).send({ productId: product.id, quantity: 1 });
    const order = await request(app).post('/api/v1/orders').set(alice.auth).send({ shippingAddress: ADDRESS });
    await request(app)
      .patch(`/api/v1/orders/${order.body.data.id}/status`)
      .set(admin.auth)
      .send({ status: 'CANCELLED' });

    expect(await waitForEvent(aliceWs, 'order.status_changed')).toMatchObject({
      data: { from: 'PENDING', to: 'CANCELLED' },
    });
    close(aliceWs);
  });
});

describe('gRPC InventoryService', () => {
  const INTERNAL_TOKEN = process.env.INTERNAL_GRPC_TOKEN || '';
  let handle;
  let client;

  beforeAll(async () => {
    handle = await grpcServer.start('127.0.0.1:0');
    client = new InventoryService(`127.0.0.1:${handle.port}`, grpc.credentials.createInsecure());
  });

  afterAll(() => {
    client.close();
    handle.server.forceShutdown();
  });

  const metadata = () => {
    const md = new grpc.Metadata();
    if (INTERNAL_TOKEN) md.set('x-internal-token', INTERNAL_TOKEN);
    return md;
  };

  const checkStock = (items, md = metadata()) =>
    new Promise((resolve, reject) =>
      client.checkStock({ items }, md, { deadline: Date.now() + 3000 }, (err, res) =>
        err ? reject(err) : resolve(res),
      ),
    );

  const streamRestock = (items, md = metadata()) =>
    new Promise((resolve, reject) => {
      const call = client.streamRestock(md, (err, res) => (err ? reject(err) : resolve(res)));
      for (const item of items) call.write(item);
      call.end();
    });

  test('CheckStock: สต็อกพอ -> sufficient = true', async () => {
    const p = await createProduct({ stock: 10 });

    const res = await checkStock([{ productId: p.id, quantity: 3 }]);

    expect(res.allAvailable).toBe(true);
    expect(res.items[0]).toMatchObject({ productId: p.id, requested: 3, available: 10, sufficient: true });
  });

  test('CheckStock: สต็อกไม่พอ -> sufficient = false (ไม่ใช่ Error)', async () => {
    const p = await createProduct({ stock: 2 });

    const res = await checkStock([{ productId: p.id, quantity: 5 }]);

    expect(res.allAvailable).toBe(false);
    expect(res.items[0]).toMatchObject({ available: 2, sufficient: false });
  });

  test('CheckStock: สินค้าปิดขาย/ไม่มีอยู่ -> available = 0', async () => {
    const inactive = await createProduct({ stock: 50, isActive: false });

    const res = await checkStock([
      { productId: inactive.id, quantity: 1 },
      { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
    ]);

    expect(res.items.map((i) => i.available)).toEqual([0, 0]);
  });

  test.each([
    ['รายการว่าง', []],
    ['productId ไม่ใช่ UUID', [{ productId: 'abc', quantity: 1 }]],
    ['quantity เป็น 0', [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 0 }]],
  ])('CheckStock: %s -> INVALID_ARGUMENT', async (_label, items) => {
    await expect(checkStock(items)).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
  });

  test('StreamRestock: ส่งทีละรายการ -> รวมจำนวนแล้วเพิ่มสต็อกให้ถูกต้อง', async () => {
    const p = await createProduct({ stock: 5 });

    const summary = await streamRestock([
      { productId: p.id, quantity: 2, scannedBy: 'scanner-01' },
      { productId: p.id, quantity: 3, scannedBy: 'scanner-01' },
    ]);

    expect(summary).toMatchObject({ receivedMessages: 2, updatedProducts: 1, totalUnits: 5 });
    expect((await prisma.product.findUnique({ where: { id: p.id } })).stock).toBe(10);
  });

  test('StreamRestock: มีรายการพังใน stream -> ปฏิเสธทั้ง stream ไม่เพิ่มสต็อกบางส่วน', async () => {
    const p = await createProduct({ stock: 5 });

    await expect(
      streamRestock([
        { productId: p.id, quantity: 2, scannedBy: 's' },
        { productId: 'not-a-uuid', quantity: 1, scannedBy: 's' },
      ]),
    ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });

    expect((await prisma.product.findUnique({ where: { id: p.id } })).stock).toBe(5);
  });

  test('StreamRestock: สินค้าที่ไม่มีอยู่ -> ไม่นับเป็น updatedProducts', async () => {
    const summary = await streamRestock([
      { productId: '11111111-1111-4111-8111-111111111111', quantity: 1, scannedBy: 's' },
    ]);
    expect(summary).toMatchObject({ receivedMessages: 1, updatedProducts: 0, totalUnits: 0 });
  });
});

describe('gRPC: ตรวจ Internal token', () => {
  let handle;
  let client;
  let isolatedPrisma;

  beforeAll(async () => {
    // โหลด Server ใหม่พร้อม INTERNAL_GRPC_TOKEN เพื่อให้ isAuthorized ทำงาน
    // (config/env อ่าน env แค่ครั้งเดียวตอน require จึงต้องล้าง Module registry ก่อน)
    jest.resetModules();
    process.env.INTERNAL_GRPC_TOKEN = 'secret-internal-token';
    const guarded = require('../../src/grpc/inventory.server');
    // Registry ใหม่สร้าง PrismaClient ตัวที่สอง — เก็บไว้ปิดใน afterAll ไม่ให้ Jest ค้าง
    isolatedPrisma = require('../../src/lib/prisma');
    handle = await guarded.start('127.0.0.1:0');
    client = new InventoryService(`127.0.0.1:${handle.port}`, grpc.credentials.createInsecure());
  });

  afterAll(async () => {
    client.close();
    handle.server.forceShutdown();
    await isolatedPrisma.$disconnect();
    process.env.INTERNAL_GRPC_TOKEN = '';
    jest.resetModules();
  });

  const call = (token) =>
    new Promise((resolve, reject) => {
      const md = new grpc.Metadata();
      if (token !== undefined) md.set('x-internal-token', token);
      client.checkStock(
        { items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }] },
        md,
        { deadline: Date.now() + 3000 },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
    });

  test('token ถูก -> ผ่าน', async () => {
    await expect(call('secret-internal-token')).resolves.toMatchObject({ allAvailable: false });
  });

  test.each([
    ['token ผิด', 'wrong-token'],
    ['token ยาวไม่เท่ากัน', 'x'],
    ['ไม่ส่ง token', undefined],
  ])('%s -> UNAUTHENTICATED', async (_label, token) => {
    await expect(call(token)).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
  });
});
