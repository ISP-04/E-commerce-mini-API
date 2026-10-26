// หน้าเข้าสู่ระบบและสมัครสมาชิก
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ErrorAlert } from '../components/ui';
import { useAuth } from '../context/contexts';
 
// หลัง Login กลับไปหน้าที่ผู้ใช้ตั้งใจจะไป (ProtectedRoute เก็บไว้ใน state.from)
function useRedirectTarget() {
  const location = useLocation();
  const from = location.state?.from;
  return from ? `${from.pathname}${from.search || ''}` : '/';
}
 
export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
 
  if (status === 'authenticated') return <Navigate to={target} replace />;
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email, form.password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
 
  return (
    <section className="auth-card card">
      <h1>เข้าสู่ระบบ</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          อีเมล
          <input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <ErrorAlert error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
      <p className="muted">
        ยังไม่มีบัญชี? <Link to="/register">สมัครสมาชิก</Link>
      </p>
    </section>
  );
}
 
export function RegisterPage() {
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
 
  if (status === 'authenticated') return <Navigate to="/" replace />;
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
 
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
 
  return (
    <section className="auth-card card">
      <h1>สมัครสมาชิก</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          ชื่อที่แสดง
          <input autoComplete="name" required maxLength={100} value={form.name} onChange={set('name')} />
        </label>
        <label>
          อีเมล
          <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </label>
        <label>
          รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
          />
        </label>
        <ErrorAlert error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
        </button>
      </form>
      <p className="muted">
        มีบัญชีแล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
      </p>
    </section>
  );
}
