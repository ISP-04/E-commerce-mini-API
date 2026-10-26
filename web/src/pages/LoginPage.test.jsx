// Component test: เรนเดอร์หน้า Login จริงพร้อม Provider ทั้งหมด แต่จำลอง API ด้วย fetch ปลอม
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../api/client';
import { AuthProvider } from '../context/AuthProvider';
import { CartProvider } from '../context/CartProvider';
import { LoginPage } from './AuthPages';
 
const json = (status, body) => new Response(JSON.stringify(body), { status });
 
function renderLogin(fetchImpl) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<p>หน้าแรก</p>} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}
 
async function fillAndSubmit(email, password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('อีเมล'), email);
  await user.type(screen.getByLabelText('รหัสผ่าน'), password);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}
 
describe('LoginPage', () => {
  it('shows a Thai error message when the credentials are wrong', async () => {
    renderLogin(async () =>
      json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }),
    );
    await fillAndSubmit('customer@shop.local', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(tokenStore.get()).toBeNull();
  });
 
  it('stores the token and redirects home after a successful login', async () => {
    renderLogin(async (url) => {
      if (url.pathname === '/api/v1/auth/login') {
        return json(200, {
          data: {
            token: 'header.payload.sig',
            tokenType: 'Bearer',
            user: { id: 'u1', name: 'Demo', role: 'CUSTOMER' },
          },
        });
      }
      return json(200, { data: { id: null, items: [], itemCount: 0, total: '0.00' } }); // GET /cart
    });
    await fillAndSubmit('customer@shop.local', 'customer1234');
    expect(await screen.findByText('หน้าแรก')).toBeInTheDocument();
    expect(tokenStore.get()).toBe('header.payload.sig');
  });
});
