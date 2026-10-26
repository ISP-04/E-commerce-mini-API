// จุดเดียวที่คุยกับ API: แนบ Token, ต่อ Query string และแปลง Error ของ API เป็น ApiError
// API ตอบ Error รูปแบบเดียวเสมอ: { error: { code, message, details? } } (บทที่ 02)
const BASE_URL = '/api/v1';
const TOKEN_KEY = 'shop.token';
 
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
 
// เก็บ JWT ใน localStorage: Login ค้างไว้ได้แม้รีเฟรชหน้า
// ข้อแลกเปลี่ยน: ถ้าหน้าเว็บโดน XSS สคริปต์อ่าน Token ได้ จึงต้องไม่ใช้ dangerouslySetInnerHTML และตั้ง CSP ที่ Nginx
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
 
// AuthContext ลงทะเบียนฟังก์ชัน Logout ไว้ที่นี่ เมื่อ API ตอบ 401 (Token หมดอายุ/ถูกปฏิเสธ) จะ Logout ทันที
let unauthorizedHandler = () => {};
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}
 
export async function apiFetch(path, { method = 'GET', body, query, signal } = {}) {
  const url = new URL(BASE_URL + path, window.location.origin);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
 
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
 
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err; // ผู้เรียกยกเลิกเอง (เช่น เปลี่ยนหน้า) ไม่ใช่ Error จริง
    throw new ApiError(0, 'NETWORK_ERROR', 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจการเชื่อมต่อ');
  }
 
  if (res.status === 204) return null;
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = payload?.error || {};
    if (res.status === 401 && token) unauthorizedHandler();
    throw new ApiError(res.status, error.code || 'HTTP_ERROR', error.message || `HTTP ${res.status}`, error.details);
  }
  return payload;
}
