FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# Install workspace dependencies first (for layer caching)
COPY package.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/discord-bot/package.json packages/discord-bot/
COPY packages/telegram-bot/package.json packages/telegram-bot/
COPY packages/web/package.json packages/web/
RUN npm install --no-audit --no-fund

# Copy source and build the whole workspace
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma \
  && npm run build -w @dsbot/db \
  && npm run build -w @dsbot/shared \
  && npm run build -w @dsbot/discord-bot

WORKDIR /app/packages/discord-bot
CMD ["node", "dist/index.js"]
