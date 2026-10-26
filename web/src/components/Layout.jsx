// โครงหน้าเว็บ: แถบเมนูด้านบน + พื้นที่แจ้งเตือน Real-time + เนื้อหาของแต่ละหน้า (Outlet)
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, useCart, useRealtime } from '../context/contexts';
import { STATUS_LABELS, shortId } from '../utils/format';
 
function describe(message) {
  const { event, data } = message;
  if (event === 'order.created') return `สร้างคำสั่งซื้อ #${shortId(data.orderId)} แล้ว`;
  if (event === 'order.status_changed') {
    return `คำสั่งซื้อ #${shortId(data.orderId)} เปลี่ยนเป็น "${STATUS_LABELS[data.to] || data.to}"`;
  }
  return null; // event อื่น (เช่น stock.low สำหรับ Admin) ไม่แสดง
}
 
export function Layout() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
 
  const connected = useRealtime(
    useCallback((message) => {
      const text = describe(message);
      if (!text) return;
      const id = `${message.at}-${Math.random()}`;
      setToasts((list) => [...list.slice(-2), { id, text }]); // แสดงไม่เกิน 3 รายการ
    }, []),
  );
 
  // ซ่อนการแจ้งเตือนอัตโนมัติหลัง 5 วินาที
  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timer = setTimeout(() => setToasts((list) => list.slice(1)), 5000);
    return () => clearTimeout(timer);
  }, [toasts]);
 
  const handleLogout = () => {
    logout();
    navigate('/');
  };
 
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            Mini Shop
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              สินค้า
            </NavLink>
            {user && (
              <>
                <NavLink to="/cart">ตะกร้า{itemCount > 0 && <span className="count">{itemCount}</span>}</NavLink>
                <NavLink to="/orders">คำสั่งซื้อ</NavLink>
              </>
            )}
          </nav>
          <div className="account">
            {user ? (
              <>
                <span
                  className={`live-dot ${connected ? 'on' : ''}`}
                  title={connected ? 'เชื่อมต่อ Real-time แล้ว' : 'ยังไม่เชื่อมต่อ Real-time'}
                />
                <span className="user-name">{user.name}</span>
                <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login">เข้าสู่ระบบ</NavLink>
                <NavLink to="/register" className="btn btn-primary">
                  สมัครสมาชิก
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
 
      <main className="container main">
        <Outlet />
      </main>
 
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
