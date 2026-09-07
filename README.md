# DS_TG_BOT — Discord + Telegram бот сообщества

Бот, который следит за активностью, объединяет Discord-сервер и Telegram-группу, даёт гибкие правила-зависимости через веб-панель, запускает споры и раздаёт награды самым активным участникам по итогам месяца.

## Возможности

- **Сбор статистики**: время в голосовых каналах, сообщения (Discord + Telegram), теги игр, ежедневные и месячные агрегаты.
- **Гибкие правила** через веб-панель: `условие → действие`. Например: «трое определённых людей в голосовом канале → пометить как Valorant и написать в Telegram».
- **Споры**: запуск в Discord (`/dispute`) или через панель → автоматически появляются в Telegram-группе с кнопками голосования.
- **Награды месяца**: в конце месяца считается самый активный участник, награда уходит в Discord, Telegram и отображается на сайте.
- **Красивая веб-панель**: дашборд, редактор правил, споры, рейтинг, награды, настройки.

## Архитектура

Монорепа (npm workspaces):

```
packages/
  db/            Prisma-схема + сервисы статистики/наград (PostgreSQL)
  shared/        Общие типы (правила, шаблоны, утилиты)
  discord-bot/   discord.js — трекинг активности, команды, движок правил
  telegram-bot/  grammY — команды, мост сообщений, голосование в спорах
  web/           Next.js — панель управления
```

Связь Discord ↔ Telegram идёт через таблицу `BridgeMessage` в общей БД: Discord-бот пишет события, Telegram-бот их подхватывает.

## Быстрый старт (Docker)

### Автодеплой одной командой (VPS/Linux)

Загрузи проект на VPS (или запусти с `GIT_REPO_URL`), затем:

```bash
chmod +x deploy.sh && ./deploy.sh
```

Скрипт сам: определит ОС, поставит Docker + Compose, создаст `.env` (спросит токены), соберёт и запустит всё, покажет адрес панели.

Требуется: Docker + Docker Compose (v2), Node 20+ для локальной разработки.

1. Скопируй `.env.example` → `.env` и заполни токены:

```bash
cp .env.example .env
```

2. Заполни в `.env`:

| Переменная | Где взять |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | [Discord Developer Portal](https://discord.com/developers/applications) → Bot |
| `DISCORD_GUILD_ID` | ID твоего Discord-сервера (правый клик по серверу → Copy ID, нужен режим разработчика) |
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ID группы (например `-1001234567890`) |
| `PANEL_PASSWORD` | пароль для входа в веб-панель |

3. Запусти:

```bash
docker compose up -d --build
```

4. Открой панель: `http://<VPS-IP>:3000` (порт задаётся через `WEB_PORT`).

## Настройка Discord-бота

При создании приложения в Discord Developer Portal включи:

- **Privileged Gateway Intents**: `SERVER MEMBERS`, `MESSAGE CONTENT`, `PRESENCE` (для отслеживания игр).
- **Bot Permissions**: `Read Messages`, `Send Messages`, `Use Slash Commands`, `View Channels`, `Connect` (если нужен голос).
- Пригласи бота на сервер через OAuth2 → URL Generator → scopes `bot` + `applications.commands`.

## Настройка Telegram-бота

1. Создай бота у @BotFather.
2. Добавь его в группу и выдай права администратора (нужно для чтения сообщений).
3. Укажи `TELEGRAM_CHAT_ID` — ID чата можно узнать, написав боту сообщение и прочитав `update` (или через @userinfobot).

## Локальная разработка

```bash
npm install
npm run db:generate                 # сгенерировать Prisma Client
# заполни .env и подними PostgreSQL (docker compose up -d postgres)
npm run db:migrate                  # применить миграции

npm run dev:discord                 # Discord-бот
npm run dev:telegram                # Telegram-бот
npm run dev:web                     # веб-панель на http://localhost:3000
```

## Команды

**Discord (slash-команды):**
- `/stats [@user]` — статистика за месяц
- `/leaderboard` — топ активных
- `/dispute create <title> <options>` — создать спор
- `/dispute vote <id> <option>` — проголосовать
- `/dispute results <id>` — результаты
- `/rules` — список правил

**Telegram:**
- `/start`, `/stats`, `/leaderboard`, `/rules`
- Споры приходят с кнопками голосования.

## Как работают правила

Правило = триггер + условия + действия. Триггеры: `voice` (голос), `message` (сообщение), `presence` (игра).

Условия:
- `users_in_voice` — определённые пользователи вместе в голосовом канале (операторы: все / хотя бы N / любой / никого)
- `user_in_voice` — пользователь в голосе
- `user_playing` — пользователь играет в игру
- `message_contains` — сообщение содержит слова
- `message_in_channel` — сообщение в канале

Действия:
- `announce_discord` / `announce_telegram` — сообщение (с шаблонами `{users}`, `{game}`)
- `assign_game_tag` — пометить текущую голосовую сессию игрой (идёт в статистику)

ID пользователей в условиях — это **Discord user ID** (правый клик по пользователю → Copy ID).

## Формула рейтинга

`очки = минуты_в_голосе × вес_голоса + сообщения × вес_сообщения`

Веса настраиваются в панели → Настройки.

## Награды месяца

Автоматически считаются в последний день месяца в 23:00 (или вручную в панели → Награды → «Посчитать награды месяца»). Топ-3 получают награды с отображением в Discord, Telegram и на сайте.
