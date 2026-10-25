// Component ขนาดเล็กที่ใช้ซ้ำหลายหน้า
import { STATUS_LABELS } from '../utils/format';
import { errorMessage } from '../utils/errors';
 
export function StatusBadge({ status }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>;
}
 
// role="alert" ให้โปรแกรมอ่านหน้าจออ่านข้อความผิดพลาดทันที
export function ErrorAlert({ error }) {
  if (!error) return null;
  return (
    <p className="alert alert-error" role="alert">
      {typeof error === 'string' ? error : errorMessage(error)}
    </p>
  );
}
 
export function SuccessAlert({ children }) {
  if (!children) return null;
  return (
    <p className="alert alert-success" role="status">
      {children}
    </p>
  );
}
 
export function Loading({ text = 'กำลังโหลด...' }) {
  return (
    <p className="muted" role="status">
      {text}
    </p>
  );
}
 
export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="เปลี่ยนหน้า">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ก่อนหน้า
      </button>
      <span>
        หน้า {page} / {totalPages}
      </span>
      <button type="button" className="btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ถัดไป
      </button>
    </nav>
  );
}