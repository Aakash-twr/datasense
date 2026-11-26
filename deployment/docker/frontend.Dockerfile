# Stage 1: Build optimized static SPA bundle
FROM node:22-alpine AS builder

WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# Stage 2: Serve static assets cleanly via Nginx + API reverse proxy
FROM nginx:1.27-alpine AS runtime

COPY deployment/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/healthz >/dev/null 2>&1 || exit 1
