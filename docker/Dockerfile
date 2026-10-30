# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
# Build-time placeholders only — real values are injected at runtime by compose.
# Kept here so `prisma generate` / `next build` never depend on a committed .env.
ENV DATABASE_URL="postgresql://tracker:tracker@localhost:5432/tracker?schema=public"
ENV AUTH_SECRET="build-time-placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- tools: migrations + seed (full deps; run on demand, never serves traffic) ----
FROM builder AS tools
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runner: lean Next.js standalone server ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
