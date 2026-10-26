import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { AuthProvider } from './context/AuthProvider';
import { CartProvider } from './context/CartProvider';
import { RealtimeProvider } from './context/RealtimeProvider';
import './index.css';
 
// ลำดับ Provider สำคัญ: Cart และ Realtime ต้องรู้ว่าใครเข้าสู่ระบบ จึงอยู่ภายใน AuthProvider
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
