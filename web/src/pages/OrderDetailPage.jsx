// รายละเอียดคำสั่งซื้อ: ชำระเงิน (จำลอง), ยกเลิก และเห็นสถานะเปลี่ยนทันทีผ่าน WebSocket
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { shop } from '../api/shop';
import { ErrorAlert, Loading, StatusBadge, SuccessAlert } from '../components/ui';
import { useRealtime } from '../context/contexts';
import { PAYMENT_METHODS, formatBaht, formatDate, shortId } from '../utils/format';
 
function PaymentForm({ order, onDone }) {
  const [method, setMethod] = useState('PROMPTPAY');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
 
  const handlePay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await shop.payOrder(order.id, method, simulateFailure);
      onDone(data, 'ชำระเงินสำเร็จ');
    } catch (err) {
      setError(err);
      onDone(null); // ชำระไม่ผ่านก็มีประวัติ Payment ใหม่ (FAILED) ให้โหลดใหม่
    } finally {
      setBusy(false);
    }
  };
 
  const handleCancel = async () => {
    if (!window.confirm('ยืนยันยกเลิกคำสั่งซื้อนี้? สต็อกจะถูกคืนเข้าระบบ')) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await shop.cancelOrder(order.id);
      onDone(data, 'ยกเลิกคำสั่งซื้อแล้ว');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
 
  return (
    <form className="card form" onSubmit={handlePay}>
      <h2>ชำระเงิน</h2>
      <fieldset className="methods">
        <legend>ช่องทาง</legend>
        {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
          <label key={value} className="radio">
            <input
              type="radio"
              name="method"
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />
        จำลองว่าธนาคารปฏิเสธ (ทดสอบกรณีล้มเหลว)
      </label>
      <ErrorAlert error={error} />
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'กำลังดำเนินการ...' : `ชำระ ${formatBaht(order.totalAmount)}`}
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={handleCancel}>
          ยกเลิกคำสั่งซื้อ
        </button>
      </div>
    </form>
  );
}
 
export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
 
  const load = useCallback(
    (signal) =>
      shop
        .getOrder(id, signal)
        .then(({ data }) => {
          setOrder(data);
          setError(null);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err);
        }),
    [id],
  );
 
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);
 
  // มี Event ของ Order นี้ (เช่น Admin เปลี่ยนเป็น SHIPPED) -> โหลดข้อมูลล่าสุดจาก API
  const connected = useRealtime(
    useCallback(
      (message) => {
        if (message.data?.orderId === id) load();
      },
      [id, load],
    ),
  );
 
  const handleDone = (updated, text) => {
    if (updated) setOrder(updated);
    setNotice(text || '');
    load();
  };
 
  if (error && !order) return <ErrorAlert error={error} />;
  if (!order) return <Loading />;
 
  return (
    <section>
      <Link to="/orders" className="back">
        ← คำสั่งซื้อทั้งหมด
      </Link>
      <div className="order-head">
        <h1>คำสั่งซื้อ #{shortId(order.id)}</h1>
        <StatusBadge status={order.status} />
        <span className="muted small">{connected ? '● อัปเดตสถานะอัตโนมัติ' : '○ ไม่ได้เชื่อมต่อ Real-time'}</span>
      </div>
      <p className="muted">
        สั่งเมื่อ {formatDate(order.createdAt)}
        {order.paidAt && ` • ชำระเมื่อ ${formatDate(order.paidAt)}`}
      </p>
      <SuccessAlert>{notice}</SuccessAlert>
 
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th className="num">ราคา/ชิ้น</th>
              <th className="num">จำนวน</th>
              <th className="num">รวม</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td>{i.productName}</td>
                <td className="num">{formatBaht(i.unitPrice)}</td>
                <td className="num">{i.quantity}</td>
                <td className="num">{formatBaht(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3} className="num">
                ยอดรวม
              </th>
              <th className="num">{formatBaht(order.totalAmount)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
 
      <div className="card">
        <h2>ที่อยู่จัดส่ง</h2>
        <p className="pre">{order.shippingAddress}</p>
      </div>
 
      {order.status === 'PENDING' && <PaymentForm order={order} onDone={handleDone} />}
 
      {order.payments.length > 0 && (
        <div className="card">
          <h2>ประวัติการชำระเงิน</h2>
          <ul className="payments">
            {order.payments.map((p) => (
              <li key={p.id}>
                {formatDate(p.createdAt)} • {PAYMENT_METHODS[p.method] || p.method} • {formatBaht(p.amount)} •{' '}
                <strong className={p.status === 'SUCCESS' ? 'ok' : 'fail'}>
                  {p.status === 'SUCCESS' ? 'สำเร็จ' : 'ไม่สำเร็จ'}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
