// หน้าแรก: ค้นหา กรอง เรียง และแบ่งหน้าสินค้า
// เก็บตัวกรองไว้ใน URL (?q=pi&category=boards&page=2) จึงกด Back/Forward หรือแชร์ลิงก์ได้ผลเหมือนเดิม
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { shop } from '../api/shop';
import { ProductCard } from '../components/ProductCard';
import { ErrorAlert, Loading, Pagination } from '../components/ui';
import { CATEGORIES } from '../utils/format';
 
const PAGE_SIZE = 8;
const SEARCH_DELAY_MS = 400;
 
export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'newest';
  const inStock = params.get('inStock') === 'true';
  const page = Number(params.get('page')) || 1;
 
  const [searchText, setSearchText] = useState(q);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
 
  // q ใน URL เปลี่ยนจากภายนอก (กด Back/Forward) -> ปรับช่องค้นหาให้ตรง
  // ทำระหว่าง render ตามแนวทางของ React แทน useEffect เพื่อไม่ให้ render ซ้ำ 2 รอบ
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    if (q !== searchText.trim()) setSearchText(q);
  }
 
  // เปลี่ยนค่าใน URL 1 ตัว และกลับไปหน้า 1 ทุกครั้งที่เปลี่ยนตัวกรอง
  const updateParam = useCallback(
    (key, value) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      });
    },
    [setParams],
  );
 
  // Debounce: รอให้หยุดพิมพ์ 400 ms ก่อนค้นหา ไม่ยิง API ทุกตัวอักษร (API มี Rate limit)
  useEffect(() => {
    if (searchText.trim() === q) return undefined;
    const timer = setTimeout(() => updateParam('q', searchText.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText, q, updateParam]);
 
  // ดึงข้อมูลเมื่อ URL เปลี่ยน และยกเลิก Request เก่าที่ยังไม่ตอบ (AbortController) กันผลลัพธ์เก่ามาทับผลใหม่
  useEffect(() => {
    const controller = new AbortController();
    shop
      .listProducts(
        { q, category, sort, inStock: inStock ? 'true' : undefined, page, limit: PAGE_SIZE },
        controller.signal,
      )
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      });
    return () => controller.abort();
  }, [q, category, sort, inStock, page]);
 
  return (
    <section>
      <h1>สินค้าทั้งหมด</h1>
 
      <div className="filters">
        <input
          type="search"
          placeholder="ค้นหาชื่อสินค้า..."
          aria-label="ค้นหาสินค้า"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select aria-label="หมวดหมู่" value={category} onChange={(e) => updateParam('category', e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {Object.entries(CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="เรียงลำดับ" value={sort} onChange={(e) => updateParam('sort', e.target.value)}>
          <option value="newest">ใหม่ล่าสุด</option>
          <option value="price_asc">ราคาต่ำไปสูง</option>
          <option value="price_desc">ราคาสูงไปต่ำ</option>
          <option value="name">ชื่อ A-Z</option>
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => updateParam('inStock', e.target.checked ? 'true' : '')}
          />
          เฉพาะที่มีของ
        </label>
      </div>
 
      <ErrorAlert error={error} />
      {!result && !error && <Loading />}
      {result && result.data.length === 0 && <p className="muted">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>}
      {result && (
        <>
          <div className="grid">
            {result.data.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <Pagination
            page={result.pagination.page}
            totalPages={result.pagination.totalPages}
            onChange={(next) => updateParam('page', String(next))}
          />
        </>
      )}
    </section>
  );
}
