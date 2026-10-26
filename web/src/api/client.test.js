import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, setUnauthorizedHandler, tokenStore } from './client';
 
// จำลอง fetch ให้ตอบตามที่กำหนด แล้วตรวจว่า apiFetch ส่ง Request และแปลงผลถูกต้อง
function mockFetch(status, body) {
  const fn = vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
 
describe('apiFetch', () => {
  it('prefixes /api/v1, drops empty query values and attaches the Bearer token', async () => {
    tokenStore.set('abc.def.ghi');
    const fetchFn = mockFetch(200, { data: [] });
 
    await apiFetch('/products', { query: { q: 'pi', category: '', page: 2, inStock: undefined } });
 
    const [url, init] = fetchFn.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/products');
    expect(url.search).toBe('?q=pi&page=2');
    expect(init.headers.Authorization).toBe('Bearer abc.def.ghi');
  });
 
  it('sends JSON bodies with the right Content-Type', async () => {
    const fetchFn = mockFetch(201, { data: { id: '1' } });
    await apiFetch('/cart', { method: 'POST', body: { productId: 'p1', quantity: 2 } });
    const [, init] = fetchFn.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ productId: 'p1', quantity: 2 });
  });
 
  it('converts the API error format into ApiError', async () => {
    mockFetch(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough', details: { available: 1 } } });
    const err = await apiFetch('/cart', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK', details: { available: 1 } });
  });
 
  it('calls the unauthorized handler on 401 only when a token was sent', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
 
    mockFetch(401, { error: { code: 'INVALID_CREDENTIALS', message: 'x' } });
    await apiFetch('/auth/login', { method: 'POST', body: {} }).catch(() => {});
    expect(handler).not.toHaveBeenCalled(); // Login ผิด ไม่ใช่ Token หมดอายุ
 
    tokenStore.set('expired.token.value');
    mockFetch(401, { error: { code: 'UNAUTHORIZED', message: 'Token expired' } });
    await apiFetch('/cart').catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });
 
  it('reports network failures as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/products')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
 
  it('returns null for 204 No Content', async () => {
    mockFetch(204);
    await expect(apiFetch('/something', { method: 'DELETE' })).resolves.toBeNull();
  });
});
