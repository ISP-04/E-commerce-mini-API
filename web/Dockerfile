# Multi-stage: ใช้ Node แค่ตอน build แล้วเหลือเฉพาะ Nginx + ไฟล์ Static ใน Image สุดท้าย (ไม่มี node_modules)
 
# ---------- Stage 1: build React เป็นไฟล์ Static ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
 
# ---------- Stage 2: Nginx เสิร์ฟไฟล์ + Reverse proxy ไปที่ API ----------
FROM nginx:stable-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/nginx-health >/dev/null || exit 1
