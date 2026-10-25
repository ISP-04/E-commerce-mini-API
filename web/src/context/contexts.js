// สร้าง Context และ Hook ไว้ไฟล์เดียว แยกจากไฟล์ Provider (.jsx)
// เพื่อให้ Fast Refresh ของ Vite ทำงานได้: ไฟล์ Component ควร export แต่ Component เท่านั้น
import { createContext, useContext, useEffect, useRef } from 'react';
 
export const AuthContext = createContext(null);
export const CartContext = createContext(null);
export const RealtimeContext = createContext(null);
 
function useRequired(context, name) {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used inside its Provider`);
  return value;
}
 
export const useAuth = () => useRequired(AuthContext, 'useAuth');
export const useCart = () => useRequired(CartContext, 'useCart');
 
// รับ Event จาก WebSocket: handler ถูกเรียกทุกครั้งที่มีข้อความ { event, data, at }
export function useRealtime(handler) {
  const { subscribe, connected } = useRequired(RealtimeContext, 'useRealtime');
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => subscribe((message) => handlerRef.current?.(message)), [subscribe]);
  return connected;
}
