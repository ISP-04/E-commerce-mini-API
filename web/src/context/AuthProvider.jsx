// สถานะการเข้าสู่ระบบของทั้งแอป: user, status และฟังก์ชัน login / register / logout
import { useCallback, useEffect, useMemo, useState } from 'react';
import { setUnauthorizedHandler, tokenStore } from '../api/client';
import { shop } from '../api/shop';
import { AuthContext } from './contexts';
 
// อ่านเวลาหมดอายุจาก Payload ของ JWT เพื่อ Logout อัตโนมัติ (ใช้เพื่อ UX เท่านั้น ไม่ได้ตรวจลายเซ็น — API เป็นผู้ตัดสินจริง)
function tokenExpiresAt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
 
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => tokenStore.get());
  // checking = มี Token เก่าและกำลังถาม /auth/me, authenticated = เข้าสู่ระบบแล้ว, guest = ยังไม่เข้าสู่ระบบ
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'checking' : 'guest'));
 
  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
    setStatus('guest');
  }, []);
 
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(() => {});
  }, [logout]);
 
  // เปิดเว็บใหม่หรือรีเฟรช: ตรวจ Token เดิมกับ API ว่ายังใช้ได้หรือไม่
  useEffect(() => {
    if (status !== 'checking') return undefined;
    let cancelled = false;
    shop
      .me()
      .then(({ data }) => {
        if (cancelled) return;
        setUser(data);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) logout();
      });
    return () => {
      cancelled = true;
    };
  }, [status, logout]);
 
  // ตั้งเวลา Logout เมื่อ Token หมดอายุ (JWT ของเราอายุ 1 ชั่วโมง)
  useEffect(() => {
    if (!token) return undefined;
    const expiresAt = tokenExpiresAt(token);
    if (!expiresAt) return undefined;
    // setTimeout รับได้สูงสุดราว 24.8 วัน (2^31-1 ms) ถ้าเกินจะทำงานทันที จึงต้องจำกัดค่า
    const delay = Math.min(Math.max(0, expiresAt - Date.now()), 2 ** 31 - 1);
    const timer = setTimeout(logout, delay);
    return () => clearTimeout(timer);
  }, [token, logout]);
 
  const login = useCallback(async (email, password) => {
    const { data } = await shop.login(email, password);
    tokenStore.set(data.token);
    setToken(data.token);
    setUser(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);
 
  const register = useCallback(
    async ({ name, email, password }) => {
      await shop.register({ name, email, password });
      return login(email, password); // สมัครเสร็จแล้วเข้าสู่ระบบให้ทันที
    },
    [login],
  );
 
  const value = useMemo(
    () => ({ user, token, status, login, register, logout }),
    [user, token, status, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
