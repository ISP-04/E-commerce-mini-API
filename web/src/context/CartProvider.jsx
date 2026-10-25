// ตะกร้าสินค้า: ทุกคำสั่ง (เพิ่ม/แก้/ลบ) ส่งไปที่ API แล้วใช้ตะกร้าที่ API ตอบกลับเป็นค่าใหม่
// ไม่คำนวณยอดรวมเองฝั่งหน้าเว็บ — ราคาและสต็อกจริงอยู่ที่เซิร์ฟเวอร์
import { useCallback, useEffect, useMemo, useState } from 'react';
import { shop } from '../api/shop';
import { CartContext, useAuth } from './contexts';
 
export function CartProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // จำไว้ด้วยว่าตะกร้าเป็นของใคร: เปลี่ยนผู้ใช้แล้วจะไม่เห็นตะกร้าของคนก่อนแม้แต่ชั่วขณะ
  const [state, setState] = useState({ userId: null, data: null, error: null });
  const mine = userId && state.userId === userId;
  const cart = mine ? state.data : null;
  const loadError = mine ? state.error : null;
 
  const apply = useCallback(
    async (request) => {
      const { data } = await request;
      setState({ userId, data, error: null });
      return data;
    },
    [userId],
  );
  const refresh = useCallback(() => apply(shop.getCart()), [apply]);
 
  // Login หรือเปลี่ยนผู้ใช้ -> โหลดตะกร้าของผู้ใช้คนนั้น (Logout แล้ว cart เป็น null เองจากเงื่อนไขด้านบน)
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false; // ผู้ใช้เปลี่ยนก่อน Request เดิมตอบ -> ไม่เอาผลเก่ามาใช้
    shop
      .getCart()
      .then(({ data }) => {
        if (!cancelled) setState({ userId, data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ userId, data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
 
  const value = useMemo(
    () => ({
      cart,
      loadError,
      itemCount: cart?.itemCount ?? 0,
      refresh,
      add: (productId, quantity) => apply(shop.addToCart(productId, quantity)),
      update: (itemId, quantity) => apply(shop.updateCartItem(itemId, quantity)),
      remove: (itemId) => apply(shop.removeCartItem(itemId)),
    }),
    [cart, loadError, refresh, apply],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
