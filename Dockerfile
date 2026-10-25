# WS8: Multi-stage build — image สุดท้ายมีแค่สิ่งที่ต้องใช้ตอนรัน (เล็กและปลอดภัยกว่า)
# ใช้ image เดียวนี้รันได้ทั้ง API (ค่าเริ่มต้น) และ gRPC Inventory Service (override CMD ใน compose)
 
# ---------- Stage 1: dependencies สำหรับ production ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
 
# ---------- Stage 2: build (มี devDependencies เช่น prisma CLI) ----------
# stage นี้ถูกใช้ซ้ำเป็น service "migrate" ใน docker-compose (target: build)
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.js ./
RUN npx prisma generate
# src ใช้ตอนรัน seed: docker compose run --rm migrate node prisma/seed.js
COPY src ./src
 
# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# Prisma Client ที่ generate แล้ว (engine-free: ใช้ WASM query compiler ไม่ต้องมี native binary)
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node proto ./proto
#COPY --chown=node:node public ./public
 
# ไม่รันด้วย root — ถ้าแอปถูกเจาะ ผู้โจมตีจะไม่ได้สิทธิ์ root ใน container
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
