// แผนผังหน้าเว็บ (Routing): URL ไหนแสดง Component ไหน
// บทที่ 14: หน้าสินค้าและเข้าสู่ระบบ — หน้าตะกร้าและคำสั่งซื้อจะเพิ่มในบทที่ 15
import { Link, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { LoginPage, RegisterPage } from './pages/AuthPages';
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
