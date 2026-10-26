# ---- stage 1: build ----
FROM node:20-alpine AS build
WORKDIR /app

# package files before the source, so the npm ci layer stays cached and an edit to a .tsx
# rebuilds in seconds instead of re-downloading Three.js and Rapier.
COPY package*.json ./
RUN npm ci

COPY . .
# '/' for a container, Cloudflare, Netlify, Azure and Capacitor. Only GitHub Pages overrides it.
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

# ---- stage 2: serve ----
# nginx-unprivileged runs as a non-root user and listens on 8080, which is what Azure Container
# Apps, App Service and most Kubernetes policies either require or prefer. The stock nginx image
# needs root to bind port 80.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
