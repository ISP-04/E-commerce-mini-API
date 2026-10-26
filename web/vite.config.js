
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ตอน dev (vite :5173) ไม่มี Nginx คั่น -> ต้อง proxy /api กับ /ws ไปที่ API เอง
  // ไม่งั้น fetch('/api/v1/...') จะวิ่งเข้า Dev server แล้วได้ 404
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
