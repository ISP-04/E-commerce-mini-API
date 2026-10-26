// ประวัติคำสั่งซื้อ: กรองตามสถานะ แบ่งหน้า และโหลดใหม่อัตโนมัติเมื่อได้รับ Event จาก WebSocket
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { shop } from '../api/shop';
import { ErrorAlert, Loading, Pagination, StatusBadge } from '../components/ui';
import { useRealtime } from '../context/contexts';
import { STATUS_LABELS, formatBaht, formatDate, shortId } from '../utils/format';
 
export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Number(params.get('page')) || 1;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0); // เพิ่มค่าเพื่อสั่งโหลดใหม่
 
  useEffect(() => {
    const controller = new AbortController();
    shop
      .listOrders({ status: status || undefined, page, limit: 10 }, controller.signal)
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      });
    return () => controller.abort();
  }, [status, page, version]);
 
  useRealtime(
    useCallback((message) => {
      if (message.event.startsWith('order.')) setVersion((v) => v + 1);
    }, []),
  );
 
  const setFilter = (value) => setParams(value ? { status: value } : {});
 
  return (
    <section>
      <h1>คำสั่งซื้อของฉัน</h1>
      <div className="tabs" role="tablist">
        {[['', 'ทั้งหมด'], ...Object.entries(STATUS_LABELS)].map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === value}
            className={status === value ? 'tab active' : 'tab'}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
 
      <ErrorAlert error={error} />
      {!result && !error && <Loading />}
      {result && result.data.length === 0 && <p className="muted">ยังไม่มีคำสั่งซื้อ</p>}
      {result && result.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>วันที่สั่ง</th>
                <th className="num">จำนวนรายการ</th>
                <th className="num">ยอดรวม</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/orders/${o.id}`}>#{shortId(o.id)}</Link>
                  </td>
                  <td>{formatDate(o.createdAt)}</td>
                  <td className="num">{o.items.length}</td>
                  <td className="num">{formatBaht(o.totalAmount)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result && (
        <Pagination
          page={result.pagination.page}
          totalPages={result.pagination.totalPages}
          onChange={(next) => setParams({ ...(status ? { status } : {}), page: String(next) })}
        />
      )}
    </section>
  );
}
