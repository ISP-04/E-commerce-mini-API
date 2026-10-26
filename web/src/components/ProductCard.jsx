import { Link } from 'react-router';
import { CATEGORIES, formatBaht } from '../utils/format';
 
export function StockLabel({ stock }) {
  if (stock === 0) return <span className="stock stock-out">สินค้าหมด</span>;
  if (stock <= 5) return <span className="stock stock-low">เหลือ {stock} ชิ้น</span>;
  return <span className="stock">มีสินค้า</span>;
}
 
// รูปสินค้า: ถ้าไม่มี imageUrl ใช้ตัวอักษรแรกของชื่อแทน
export function ProductThumb({ product }) {
  if (product.imageUrl) return <img className="thumb" src={product.imageUrl} alt={product.name} loading="lazy" />;
  return (
    <div className="thumb thumb-placeholder" aria-hidden="true">
      {product.name.charAt(0)}
    </div>
  );
}
 
export function ProductCard({ product }) {
  return (
    <article className="card product-card">
      <Link to={`/products/${product.id}`} className="product-link">
        <ProductThumb product={product} />
        <span className="category">{CATEGORIES[product.category] || product.category}</span>
        <h3>{product.name}</h3>
      </Link>
      <div className="product-meta">
        <strong className="price">{formatBaht(product.price)}</strong>
        <StockLabel stock={product.stock} />
      </div>
    </article>
  );
}
