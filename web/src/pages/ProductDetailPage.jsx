import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { shop } from '../api/shop';
import { ProductThumb, StockLabel } from '../components/ProductCard';
import { ErrorAlert, Loading, SuccessAlert } from '../components/ui';
import { useAuth, useCart } from '../context/contexts';
import { CATEGORIES, formatBaht } from '../utils/format';
 
const MAX_QTY = 99; // ตรงกับ MAX_QTY_PER_ITEM ใน cart.service.js
 
export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { add } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
 
  // เก็บ id ที่โหลดไว้คู่กับข้อมูล: เปลี่ยนไปสินค้าอื่นแล้วจะไม่แสดงข้อมูลของสินค้าเก่า
  const [loaded, setLoaded] = useState({ id: null, product: null, error: null });
  const product = loaded.id === id ? loaded.product : null;
  const loadError = loaded.id === id ? loaded.error : null;
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);
 
  useEffect(() => {
    const controller = new AbortController();
    shop
      .getProduct(id, controller.signal)
      .then(({ data }) => setLoaded({ id, product: data, error: null }))
      .catch((err) => {
        if (err.name !== 'AbortError') setLoaded({ id, product: null, error: err });
      });
    return () => controller.abort();
  }, [id]);
 
  if (loadError) return <ErrorAlert error={loadError} />;
  if (!product) return <Loading />;
 
  const maxQty = Math.min(MAX_QTY, product.stock);
 
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setBusy(true);
    setError(null);
    setAdded(false);
    try {
      await add(product.id, quantity);
      setAdded(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
 
  return (
    <section className="detail">
      <Link to="/" className="back">
        ← กลับไปหน้าสินค้า
      </Link>
      <div className="detail-body">
        <ProductThumb product={product} />
        <div>
          <span className="category">{CATEGORIES[product.category] || product.category}</span>
          <h1>{product.name}</h1>
          {product.description && <p>{product.description}</p>}
          <p className="price big">{formatBaht(product.price)}</p>
          <StockLabel stock={product.stock} />
 
          {product.stock > 0 && (
            <form className="add-form" onSubmit={handleAdd}>
              <label>
                จำนวน
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'กำลังเพิ่ม...' : 'ใส่ตะกร้า'}
              </button>
            </form>
          )}
          <ErrorAlert error={error} />
          {added && (
            <SuccessAlert>
              เพิ่มลงตะกร้าแล้ว <Link to="/cart">ไปที่ตะกร้า</Link>
            </SuccessAlert>
          )}
        </div>
      </div>
    </section>
  );
}
