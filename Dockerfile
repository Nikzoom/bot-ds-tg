# syntax=docker/dockerfile:1
#
# Single Dockerfile for the whole monorepo.
# Targets:
#   bots  -> Discord bot runtime
#   telegram -> optional Telegram bot runtime
#   web   -> runtime for the Next.js panel (standalone)

# ---------------------------------------------------------------------------
# Shared build stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build-common
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/discord-bot/package.json packages/discord-bot/
COPY packages/telegram-bot/package.json packages/telegram-bot/
COPY packages/web/package.json packages/web/

RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .
RUN ./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma \
  && npm run build -w @dsbot/db \
  && npm run build -w @dsbot/shared \
  && npm run build -w @dsbot/discord-bot

FROM build-common AS web-build
WORKDIR /app/packages/web
RUN npm run build -w @dsbot/web

FROM build-common AS telegram-build
RUN npm run build -w @dsbot/telegram-bot

# Install only the Discord bot's production workspaces in its runtime image.
FROM node:20-alpine AS bot-modules
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/discord-bot/package.json packages/discord-bot/
COPY packages/telegram-bot/package.json packages/telegram-bot/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund \
  --workspace=@dsbot/db --workspace=@dsbot/shared --workspace=@dsbot/discord-bot \
  --include-workspace-root
COPY packages/db/prisma packages/db/prisma
RUN ./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma

# Discord bot runtime
FROM node:20-alpine AS bots
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
LABEL app=dsbot

COPY --from=bot-modules /app/node_modules ./node_modules
COPY --from=build-common /app/package.json ./package.json
COPY --from=build-common /app/packages/db ./packages/db
COPY --from=build-common /app/packages/shared ./packages/shared
COPY --from=build-common /app/packages/discord-bot ./packages/discord-bot

FROM node:20-alpine AS telegram
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
LABEL app=dsbot
COPY --from=telegram-build /app/node_modules ./node_modules
COPY --from=telegram-build /app/package.json ./package.json
COPY --from=telegram-build /app/packages/db ./packages/db
COPY --from=telegram-build /app/packages/shared ./packages/shared
COPY --from=telegram-build /app/packages/telegram-bot ./packages/telegram-bot

# ---------------------------------------------------------------------------
# Web runtime (Next standalone)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS web
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
LABEL app=dsbot

# Next standalone server + traced node_modules (preserves monorepo path layout)
COPY --from=web-build /app/packages/web/.next/standalone ./
# Static assets & public files (standalone keeps the "packages/web" prefix)
COPY --from=web-build /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=web-build /app/packages/web/public ./packages/web/public
# Prisma client + native engine (safety net if tracing misses it)
COPY --from=web-build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-build /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3000
CMD ["node", "packages/web/server.js"]
