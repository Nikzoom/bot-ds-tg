FROM node:20-alpine AS base
RUN apk add --no-cache openssl
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
  && npm run build -w @dsbot/shared \
  && npm run build -w @dsbot/telegram-bot

WORKDIR /app/packages/telegram-bot
CMD ["node", "dist/index.js"]
