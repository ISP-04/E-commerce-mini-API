// เปิด WebSocket 1 เส้นต่อผู้ใช้ แล้วกระจายข้อความให้ทุกหน้าที่ subscribe (บทที่ 09)
// URL: ws(s)://<host เดียวกับหน้าเว็บ>/ws?token=<JWT> — Vite (Dev) และ Nginx (Production) ส่งต่อไปที่ API
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RealtimeContext, useAuth } from './contexts';
 
const MAX_RETRY_DELAY_MS = 30_000;
 
export function RealtimeProvider({ children }) {
  const { token, status } = useAuth();
  const listeners = useRef(new Set());
  const [connected, setConnected] = useState(false);
 
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);
 
  useEffect(() => {
    if (status !== 'authenticated' || !token) return undefined;
    let socket;
    let retryTimer;
    let attempt = 0;
    let stopped = false;
 
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return; // ข้อความที่ไม่ใช่ JSON ไม่ใช่ของเรา ข้ามไป
        }
        for (const fn of listeners.current) fn(message);
      };
      socket.onclose = (event) => {
        setConnected(false);
        // 4001 = Token หมดอายุ (กำหนดใน src/realtime/websocket.js) ไม่ต้องต่อใหม่ AuthProvider จะ Logout เอง
        if (stopped || event.code === 4001) return;
        // Exponential backoff: รอ 1, 2, 4, 8 ... วินาที (สูงสุด 30) ไม่ระดมต่อใหม่ตอนเซิร์ฟเวอร์ล่ม
        const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };
 
    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
      setConnected(false);
    };
  }, [token, status]);
 
  const value = useMemo(() => ({ subscribe, connected }), [subscribe, connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
