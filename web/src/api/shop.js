// รวม Endpoint ทั้งหมดที่หน้าเว็บใช้ไว้ที่เดียว (อ้างอิงสัญญาจาก Swagger: /api-docs)
import { apiFetch } from './client';
 
const id = (value) => encodeURIComponent(value);
 
export const shop = {
  register: (data) => apiFetch('/auth/register', { method: 'POST', body: data }),
  login: (email, password) => apiFetch('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => apiFetch('/auth/me'),
 
  listProducts: (query, signal) => apiFetch('/products', { query, signal }),
  getProduct: (productId, signal) => apiFetch(`/products/${id(productId)}`, { signal }),
 
  getCart: () => apiFetch('/cart'),
  addToCart: (productId, quantity) => apiFetch('/cart', { method: 'POST', body: { productId, quantity } }),
  updateCartItem: (itemId, quantity) => apiFetch(`/cart/${id(itemId)}`, { method: 'PATCH', body: { quantity } }),
  removeCartItem: (itemId) => apiFetch(`/cart/${id(itemId)}`, { method: 'DELETE' }),
 
  createOrder: (shippingAddress) => apiFetch('/orders', { method: 'POST', body: { shippingAddress } }),
  listOrders: (query, signal) => apiFetch('/orders', { query, signal }),
  getOrder: (orderId, signal) => apiFetch(`/orders/${id(orderId)}`, { signal }),
  payOrder: (orderId, method, simulateFailure = false) =>
    apiFetch(`/orders/${id(orderId)}/pay`, { method: 'POST', body: { method, simulateFailure } }),
  cancelOrder: (orderId) => apiFetch(`/orders/${id(orderId)}/cancel`, { method: 'POST' }),
};
