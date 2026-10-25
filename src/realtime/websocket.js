// WS1: Real-time push ด้วย WebSocket — ลูกค้าเห็นสถานะ Order เปลี่ยนทันที, Admin เห็น Order ใหม่/สต็อกใกล้หมด
// เชื่อมต่อ: ws://host:8080/ws?token=<JWT>
const { WebSocketServer } = require('ws');
const { verifyToken } = require('../middlewares/auth');
const { bus, EVENTS } = require('../lib/events');
 
function attachWebSocket(httpServer) {
  // Client ไม่ต้องส่งข้อมูลใหญ่มา (ใช้รับ event อย่างเดียว) -> จำกัด 4KB กัน Memory DoS (ค่าเริ่มต้นของ ws คือ 100MB)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const socketsByUser = new Map(); // userId -> Set<WebSocket>
  const adminSockets = new Set();
 
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    let user;
    try {
      user = verifyToken(url.searchParams.get('token') || '');
    } catch {
      // ปฏิเสธตั้งแต่ขั้น Handshake: ไม่มี token ที่ถูกต้อง = ไม่ได้เปิด connection
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      wss.emit('connection', ws);
    });
  });
 
  wss.on('connection', (ws) => {
    const { id, role } = ws.user;
    if (!socketsByUser.has(id)) socketsByUser.set(id, new Set());
    socketsByUser.get(id).add(ws);
    if (role === 'ADMIN') adminSockets.add(ws);
    ws.isAlive = true;
    // ต้องมี error listener เสมอ: ถ้าไม่มี error (เช่น client ส่งข้อความเกิน maxPayload)
    // จะกลายเป็น unhandled 'error' event และทำให้ทั้ง process ของ API ล่ม
    ws.on('error', (err) => console.warn(`[ws] client ${id} error: ${err.message}`));
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    // Token หมดอายุระหว่างที่ต่ออยู่ -> ตัดการเชื่อมต่อ (ต้องล็อกอินใหม่) ไม่ให้ใช้สิทธิ์ต่อได้เรื่อยๆ
    const expiresInMs = ws.user.exp ? ws.user.exp * 1000 - Date.now() : 0;
    const expiryTimer = expiresInMs > 0 ? setTimeout(() => ws.close(4001, 'Token expired'), expiresInMs) : null;
    expiryTimer?.unref();
    ws.on('close', () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      socketsByUser.get(id)?.delete(ws);
      if (socketsByUser.get(id)?.size === 0) socketsByUser.delete(id);
      adminSockets.delete(ws);
    });
    ws.send(JSON.stringify({ event: 'connected', data: { userId: id, role } }));
  });
 
  const send = (sockets, event, data) => {
    const msg = JSON.stringify({ event, data, at: new Date().toISOString() });
    for (const s of sockets || []) if (s.readyState === s.OPEN) s.send(msg);
  };
 
  const toUserAndAdmins = (event) => (payload) => {
    send(socketsByUser.get(payload.userId), event, payload);
    send(
      [...adminSockets].filter((s) => s.user.id !== payload.userId),
      event,
      payload,
    );
  };
  const listeners = {
    [EVENTS.ORDER_CREATED]: toUserAndAdmins('order.created'),
    [EVENTS.ORDER_STATUS_CHANGED]: toUserAndAdmins('order.status_changed'),
    [EVENTS.LOW_STOCK]: (payload) => send(adminSockets, 'stock.low', payload),
  };
  for (const [evt, fn] of Object.entries(listeners)) bus.on(evt, fn);
 
  // Heartbeat: ตัด connection ที่ตายแล้ว (เช่น มือถือหลุดเน็ต) ทุก 30 วินาที
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();
 
  wss.on('close', () => {
    clearInterval(heartbeat);
    for (const [evt, fn] of Object.entries(listeners)) bus.off(evt, fn);
  });
  return wss;
}
 
module.exports = { attachWebSocket };
