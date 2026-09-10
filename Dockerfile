# syntax=docker/dockerfile:1
#
# Single Dockerfile for the whole monorepo.
# Targets:
#   bots  -> runtime for discord-bot + telegram-bot (shared image)
#   web   -> runtime for the Next.js panel (standalone)

# ---------------------------------------------------------------------------
# Build / deps stage — runs npm install ONCE for the entire workspace
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/discord-bot/package.json packages/discord-bot/
COPY packages/telegram-bot/package.json packages/telegram-bot/
COPY packages/web/package.json packages/web/

RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund

COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma \
  && npm run build -w @dsbot/db \
  && npm run build -w @dsbot/shared \
  && npm run build -w @dsbot/discord-bot \
  && npm run build -w @dsbot/telegram-bot

# Build Next.js (standalone)
WORKDIR /app/packages/web
RUN npm run build -w @dsbot/web

# ---------------------------------------------------------------------------
# Bots runtime (shared by discord-bot and telegram-bot)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS bots
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/packages/db ./packages/db
COPY --from=deps /app/packages/shared ./packages/shared
COPY --from=deps /app/packages/discord-bot ./packages/discord-bot
COPY --from=deps /app/packages/telegram-bot ./packages/telegram-bot

# ---------------------------------------------------------------------------
# Web runtime (Next standalone)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS web
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Next standalone server + traced node_modules (preserves monorepo path layout)
COPY --from=deps /app/packages/web/.next/standalone ./
# Static assets & public files (standalone keeps the "packages/web" prefix)
COPY --from=deps /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=deps /app/packages/web/public ./packages/web/public
# Prisma client + native engine (safety net if tracing misses it)
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
CMD ["node", "packages/web/server.js"]
