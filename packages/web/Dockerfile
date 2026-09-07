FROM node:20-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY package.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/discord-bot/package.json packages/discord-bot/
COPY packages/telegram-bot/package.json packages/telegram-bot/
COPY packages/web/package.json packages/web/
RUN npm install --no-audit --no-fund

COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma \
  && npm run build -w @dsbot/db \
  && npm run build -w @dsbot/shared

# Build Next.js
WORKDIR /app/packages/web
RUN npm run build -w @dsbot/web

# Runtime stage
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/.next ./packages/web/.next
COPY --from=deps /app/packages/web/package.json ./packages/web/package.json
COPY --from=deps /app/packages/web/next.config.js ./packages/web/next.config.js
COPY --from=deps /app/packages/web/public ./packages/web/public
COPY --from=deps /app/packages/db ./packages/db
COPY --from=deps /app/packages/shared ./packages/shared

WORKDIR /app/packages/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
