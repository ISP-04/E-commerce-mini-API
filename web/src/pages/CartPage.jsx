// ตะกร้าและการสั่งซื้อ: แก้จำนวน, ลบ, กรอกที่อยู่ แล้วสร้าง Order (API ตัดสต็อกใน Transaction — บทที่ 07)
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { shop } from '../api/shop';
import { ErrorAlert, Loading } from '../components/ui';
import { useCart } from '../context/contexts';
import { formatBaht } from '../utils/format';
 
function CartRow({ item, onChange, onRemove, busy }) {
  return (
    <tr className={item.available ? '' : 'row-warning'}>
      <td>
        <Link to={`/products/${item.productId}`}>{item.name}</Link>
        {!item.available && <div className="warning">สต็อกเหลือ {item.stock} ชิ้น กรุณาลดจำนวนหรือลบออก</div>}
      </td>
      <td className="num">{formatBaht(item.unitPrice)}</td>
      <td className="num">
        {/* ใช้ปุ่ม − / + แทนช่องพิมพ์ เพราะทุกการเปลี่ยนคือ 1 Request ไปที่ API */}
        <div className="stepper">
          <button
            type="button"
            aria-label={`ลดจำนวน ${item.name}`}
            disabled={busy || item.quantity <= 1}
            onClick={() => onChange(item.id, item.quantity - 1)}
          >
            −
          </button>
          <span aria-label={`จำนวน ${item.name}`}>{item.quantity}</span>
          <button
            type="button"
            aria-label={`เพิ่มจำนวน ${item.name}`}
            disabled={busy || item.quantity >= Math.min(99, item.stock)}
            onClick={() => onChange(item.id, item.quantity + 1)}
          >
            +
          </button>
        </div>
      </td>
      <td className="num">{formatBaht(item.subtotal)}</td>
      <td>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onRemove(item.id)}>
          ลบ
        </button>
      </td>
    </tr>
  );
}
 
export function CartPage() {
  const { cart, loadError, update, remove, refresh } = useCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
 
  if (loadError) return <ErrorAlert error={loadError} />;
  if (!cart) return <Loading />;
 
  // ทุกคำสั่งรอผลจาก API ก่อนแสดง และกันกดซ้ำระหว่างรอ (busy)
  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setBusy(false);
    }
  };
 
  const handleCheckout = async (e) => {
    e.preventDefault();
    const result = await run(() => shop.createOrder(address));
    if (result) {
      await refresh().catch(() => {}); // API ล้างตะกร้าหลังสร้าง Order แล้ว โหลดใหม่ให้ตัวเลขบนเมนูตรง
      navigate(`/orders/${result.data.id}`);
    } else {
      await refresh().catch(() => {}); // สต็อกอาจเปลี่ยน โหลดตะกร้าใหม่เพื่อแสดงรายการที่มีปัญหา
    }
  };
 
  if (cart.items.length === 0) {
    return (
      <section>
        <h1>ตะกร้าสินค้า</h1>
        <p className="muted">ตะกร้ายังว่างอยู่</p>
        <Link to="/" className="btn btn-primary">
          เลือกซื้อสินค้า
        </Link>
      </section>
    );
  }
 
  const hasProblem = cart.items.some((i) => !i.available);
 
  return (
    <section>
      <h1>ตะกร้าสินค้า</h1>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th className="num">ราคา/ชิ้น</th>
              <th className="num">จำนวน</th>
              <th className="num">รวม</th>
              <th aria-label="จัดการ" />
            </tr>
          </thead>
          <tbody>
            {cart.items.map((item) => (
              <CartRow
                key={item.id}
                item={item}
                busy={busy}
                onChange={(id, qty) => run(() => update(id, qty))}
                onRemove={(id) => run(() => remove(id))}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3} className="num">
                ยอดรวม ({cart.itemCount} ชิ้น)
              </th>
              <th className="num">{formatBaht(cart.total)}</th>
              <th />
            </tr>
          </tfoot>
        </table>
      </div>
 
      <ErrorAlert error={error} />
 
      <form className="card form checkout" onSubmit={handleCheckout}>
        <h2>ที่อยู่จัดส่ง</h2>
        <textarea
          required
          minLength={10}
          maxLength={500}
          rows={3}
          placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
          aria-label="ที่อยู่จัดส่ง"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || hasProblem}>
          {busy ? 'กำลังดำเนินการ...' : `สั่งซื้อ ${formatBaht(cart.total)}`}
        </button>
        {hasProblem && <p className="warning">มีสินค้าที่สต็อกไม่พอ กรุณาแก้ไขก่อนสั่งซื้อ</p>}
      </form>
    </section>
  );
}
