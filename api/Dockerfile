# ─────────────────────────────────────────────────────────────────────────────
# HillFamilyHoopla API — Dockerfile
# Multi-stage: base → deps → builder → development | production
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# ── Stage 2: deps (install all dependencies) ──────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
# Copy shared package so workspace resolution works
COPY ../shared /app/../shared/
RUN npm ci --ignore-scripts

# ── Stage 3: builder (compile TypeScript) ────────────────────────────────────
FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 4: development (hot-reload with tsx) ────────────────────────────────
FROM deps AS development
ENV NODE_ENV=development
COPY tsconfig.json ./
COPY src ./src
# tsx watches for file changes and re-runs
CMD ["npx", "tsx", "watch", "--tsconfig", "tsconfig.json", "src/index.ts"]

# ── Stage 5: production (minimal image, compiled JS only) ────────────────────
FROM base AS production
ENV NODE_ENV=production

# Only copy production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Certs directory (mounted at runtime — never baked into the image)
RUN mkdir -p /app/certs

# Drop privileges
USER node

EXPOSE 3001

# dumb-init ensures signals are forwarded correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
