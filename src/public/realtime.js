// Native WebSocket API — แสดง event ล่าสุดไว้บนสุด (DOM update ทันทีโดยไม่ต้อง Refresh)
// @ts-nocheck
(() => {
  const form = document.getElementById('connect-form');
  const tokenInput = document.getElementById('token');
  const statusEl = document.getElementById('status');
  const list = document.getElementById('events');
  let socket = null;
 
  const setStatus = (text, on) => {
    statusEl.textContent = text;
    statusEl.className = `status ${on ? 'on' : 'off'}`;
  };
 
  const addEvent = (msg) => {
    const li = document.createElement('li');
    // Threshold alert (WS1 bonus): สต็อกใกล้หมดแสดงเป็นสีแดง
    if (msg.event === 'stock.low') li.className = 'alert';
    const title = document.createElement('strong');
    title.textContent = msg.event;
    const body = document.createElement('pre');
    body.textContent = JSON.stringify(msg.data, null, 2);
    li.append(title, body);
    list.prepend(li);
  };
 
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (socket) socket.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(tokenInput.value.trim())}`);
    setStatus('connecting...', false);
    socket.onopen = () => setStatus('connected', true);
    socket.onclose = () => setStatus('disconnected (token ผิด/หมดอายุ หรือเซิร์ฟเวอร์ปิด)', false);
    socket.onmessage = (ev) => addEvent(JSON.parse(ev.data));
  });
})();
