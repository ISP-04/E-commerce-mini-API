// แผนผังหน้าเว็บ (Routing): URL ไหนแสดง Component ไหน
import { Link, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { CartPage } from './pages/CartPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';
 
function NotFoundPage() {
  return (
    <section>
      <h1>ไม่พบหน้านี้</h1>
      <Link to="/">กลับหน้าแรก</Link>
    </section>
  );
}
 
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        {/* หน้าที่ต้องเข้าสู่ระบบ */}
        <Route element={<ProtectedRoute />}>
          <Route path="cart" element={<CartPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
