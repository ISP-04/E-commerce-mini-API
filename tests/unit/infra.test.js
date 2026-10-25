// Unit test ของชั้น Infrastructure: Redis cache, RabbitMQ producer, gRPC fallback, Worker
// ทั้งหมดใช้ Mock — ไม่ต้องมี Redis/RabbitMQ จริง
 
describe('cache (Redis, Cache-Aside + Fallback)', () => {
  let cache;
  let store;
  let fakeClient;
 
  beforeEach(async () => {
    jest.resetModules();
    store = new Map();
    fakeClient = {
      isReady: true,
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(),
      quit: jest.fn().mockResolvedValue(),
      get: jest.fn(async (k) => store.get(k) ?? null),
      set: jest.fn(async (k, v) => store.set(k, v)),
      del: jest.fn(async (keys) => keys.forEach((k) => store.delete(k))),
      incr: jest.fn(async (k) => store.set(k, String(Number(store.get(k) || 0) + 1))),
    };
    jest.doMock('redis', () => ({ createClient: () => fakeClient }));
    process.env.REDIS_URL = 'redis://fake:6379';
    cache = require('../../src/lib/cache');
    await cache.connect();
  });
 
  afterEach(async () => {
    await cache.disconnect();
    process.env.REDIS_URL = '';
  });
 
  test('ครั้งแรก MISS (เรียก loader) ครั้งที่สอง HIT (ไม่เรียก loader)', async () => {
    const loader = jest.fn().mockResolvedValue({ id: 1 });
    expect(await cache.remember('k', 60, loader)).toEqual({ value: { id: 1 }, cache: 'MISS' });
    expect(await cache.remember('k', 60, loader)).toEqual({ value: { id: 1 }, cache: 'HIT' });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fakeClient.set).toHaveBeenCalledWith('k', '{"id":1}', { EX: 60 });
  });
 
  test('ไม่ cache ค่า null (เช่น สินค้าไม่พบ)', async () => {
    await cache.remember('missing', 60, async () => null);
    expect(fakeClient.set).not.toHaveBeenCalled();
  });
 
  test('Redis error -> ไม่ล่ม แต่ไปอ่านจาก loader แทน', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    fakeClient.get.mockRejectedValue(new Error('ECONNRESET'));
    fakeClient.set.mockRejectedValue(new Error('ECONNRESET'));
    const result = await cache.remember('k', 60, async () => 'from-db');
    expect(result.value).toBe('from-db');
  });
 
  test('Redis ไม่พร้อม -> BYPASS', async () => {
    fakeClient.isReady = false;
    expect(await cache.remember('k', 60, async () => 'db')).toEqual({ value: 'db', cache: 'BYPASS' });
    expect(await cache.getVersion('products')).toBe('0');
  });
 
  test('bumpVersion ทำให้ version เปลี่ยน (ใช้ invalidate cache รายการสินค้า)', async () => {
    expect(await cache.getVersion('products')).toBe('0');
    await cache.bumpVersion('products');
    expect(await cache.getVersion('products')).toBe('1');
    await cache.del('a', 'b');
    expect(fakeClient.del).toHaveBeenCalledWith(['a', 'b']);
  });
});

describe('messageQueue (RabbitMQ Producer)', () => {
  let mq;
  let channel;
  let connection;
  let amqp;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    channel = {
      assertExchange: jest.fn().mockResolvedValue(),
      assertQueue: jest.fn().mockResolvedValue(),
      bindQueue: jest.fn().mockResolvedValue(),
      sendToQueue: jest.fn(),
      waitForConfirms: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
    };
    connection = {
      on: jest.fn(),
      createConfirmChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(),
    };
    amqp = { connect: jest.fn().mockResolvedValue(connection) };
    jest.doMock('amqplib', () => amqp);
    process.env.RABBITMQ_URL = 'amqp://fake:5672';
    mq = require('../../src/lib/messageQueue');
  });

  afterEach(async () => {
    await mq.disconnect();
    process.env.RABBITMQ_URL = '';
    jest.restoreAllMocks();
  });

  test('publishEvent ส่งข้อความแบบ persistent และรอ Broker ยืนยัน (ack)', async () => {
    // Arrange / Act
    const ok = await mq.publishEvent('ORDER_CREATED', { orderId: 'o-1' });

    // Assert
    expect(ok).toBe(true);
    const [queue, buffer, options] = channel.sendToQueue.mock.calls[0];
    expect(queue).toBe('order_events');
    expect(JSON.parse(buffer.toString())).toMatchObject({ type: 'ORDER_CREATED', payload: { orderId: 'o-1' } });
    expect(options).toMatchObject({ persistent: true, contentType: 'application/json', type: 'ORDER_CREATED' });
    expect(channel.waitForConfirms).toHaveBeenCalled();
  });

  test('ประกาศ Dead Letter Exchange/Queue ให้ตรงกับฝั่ง Worker', async () => {
    await mq.connect();
    expect(channel.assertExchange).toHaveBeenCalledWith(mq.DLX, 'fanout', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith(mq.DLQ, { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('order_events', {
      durable: true,
      deadLetterExchange: mq.DLX,
    });
  });

  test('ต่อ Broker ไม่ได้ -> คืน false ไม่โยน Error (Request ของลูกค้าไม่ล้มตาม)', async () => {
    amqp.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await mq.publishEvent('ORDER_PAID', {})).toBe(false);
  });

  test('Broker ไม่ยืนยัน (waitForConfirms พัง) -> คืน false', async () => {
    channel.waitForConfirms.mockRejectedValue(new Error('channel closed'));
    expect(await mq.publishEvent('ORDER_PAID', {})).toBe(false);
  });

  test('ไม่ตั้ง RABBITMQ_URL -> ปิดฟีเจอร์ ไม่พยายามต่อเลย (Graceful degradation)', async () => {
    jest.resetModules();
    process.env.RABBITMQ_URL = '';
    const disabled = require('../../src/lib/messageQueue');
    expect(await disabled.connect()).toBeNull();
    expect(await disabled.publishEvent('LOW_STOCK', {})).toBe(false);
    expect(amqp.connect).not.toHaveBeenCalled();
  });
});

describe('gRPC inventory client (Fallback ไปฐานข้อมูล)', () => {
  const ITEMS = [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 2 }];
  let inventoryClient;
  let checkStockImpl;
  let inventoryService;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    checkStockImpl = jest.fn((_req, _md, _opts, cb) => cb(null, { allAvailable: true, items: [] }));
    jest.doMock('../../src/grpc/protoLoader', () => ({
      grpc: {
        Metadata: class {
          set() {}
        },
        credentials: { createInsecure: () => ({}) },
      },
      InventoryService: class {
        checkStock(...args) {
          return checkStockImpl(...args);
        }
        close() {}
      },
    }));
    inventoryService = { checkStock: jest.fn().mockResolvedValue({ allAvailable: false, items: [{ available: 0 }] }) };
    jest.doMock('../../src/services/inventory.service', () => inventoryService);
  });

  afterEach(() => {
    inventoryClient.close();
    process.env.INVENTORY_GRPC_URL = '';
    jest.restoreAllMocks();
  });

  test('gRPC ตอบได้ -> source = grpc (ไม่แตะฐานข้อมูล)', async () => {
    process.env.INVENTORY_GRPC_URL = 'localhost:50051';
    inventoryClient = require('../../src/grpc/inventory.client');

    const res = await inventoryClient.checkStock(ITEMS);

    expect(res).toMatchObject({ allAvailable: true, source: 'grpc' });
    expect(inventoryService.checkStock).not.toHaveBeenCalled();
  });

  test('gRPC ล่ม -> Fallback อ่านจากฐานข้อมูล (source = database)', async () => {
    process.env.INVENTORY_GRPC_URL = 'localhost:50051';
    inventoryClient = require('../../src/grpc/inventory.client');
    checkStockImpl.mockImplementation((_req, _md, _opts, cb) =>
      cb(Object.assign(new Error('deadline exceeded'), { code: 4 })),
    );

    const res = await inventoryClient.checkStock(ITEMS);

    expect(res.source).toBe('database');
    expect(inventoryService.checkStock).toHaveBeenCalledWith(ITEMS);
  });

  test('ไม่ตั้ง INVENTORY_GRPC_URL -> ใช้ฐานข้อมูลตรง ๆ', async () => {
    process.env.INVENTORY_GRPC_URL = '';
    inventoryClient = require('../../src/grpc/inventory.client');

    expect((await inventoryClient.checkStock(ITEMS)).source).toBe('database');
    expect(checkStockImpl).not.toHaveBeenCalled();
  });
});

describe('worker.buildEmail (Pure function)', () => {
  const { buildEmail } = require('../../worker/worker');
  const ORDER_ID = 'abcd1234-0000-4000-8000-000000000000';

  test('ORDER_CREATED -> อีเมลยืนยันคำสั่งซื้อถึงลูกค้า', () => {
    const email = buildEmail({
      type: 'ORDER_CREATED',
      payload: { email: 'a@test.local', orderId: ORDER_ID, totalAmount: '657.50' },
    });
    expect(email).toEqual({
      to: 'a@test.local',
      subject: 'ยืนยันคำสั่งซื้อ #abcd1234',
      body: 'ยอดรวม 657.50 บาท',
    });
  });

  test('ORDER_PAID -> แจ้งเลขอ้างอิงการชำระเงิน', () => {
    const email = buildEmail({
      type: 'ORDER_PAID',
      payload: { email: 'a@test.local', orderId: ORDER_ID, transactionRef: 'PAY-9' },
    });
    expect(email).toMatchObject({ to: 'a@test.local', body: 'เลขอ้างอิง PAY-9' });
  });

  test('ORDER_STATUS_CHANGED -> ระบุสถานะเดิมและใหม่', () => {
    const email = buildEmail({
      type: 'ORDER_STATUS_CHANGED',
      payload: { userId: 'u-1', orderId: ORDER_ID, from: 'PAID', to: 'SHIPPED' },
    });
    expect(email).toMatchObject({ to: 'user:u-1', body: 'PAID -> SHIPPED' });
  });

  test('LOW_STOCK -> แจ้งเตือน Admin', () => {
    const email = buildEmail({ type: 'LOW_STOCK', payload: { name: 'DHT22', remaining: 2 } });
    expect(email).toMatchObject({ to: 'admin@shop.local', body: 'เหลือ 2 ชิ้น' });
  });

  test('Event ที่ไม่รู้จัก -> คืน null (Worker จะ ack ทิ้งไม่ส่งอีเมล)', () => {
    expect(buildEmail({ type: 'SOMETHING_ELSE', payload: {} })).toBeNull();
  });
});
