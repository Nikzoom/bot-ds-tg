#!/usr/bin/env bash
# Запуск и обновление Discord-бота на VPS (Ubuntu/Debian).
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

fail() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }

[ -f docker-compose.yml ] || fail "Запусти скрипт из репозитория."
[ -f .env.example ] || fail ".env.example не найден."

if ! command -v docker >/dev/null 2>&1; then
  info "Устанавливаю Docker из репозитория системы"
  command -v apt-get >/dev/null 2>&1 || fail "Автоустановка поддерживается на Ubuntu/Debian. Установи Docker вручную."
  if [ "$(id -u)" -eq 0 ]; then SUDO=(); else SUDO=(sudo); fi
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y docker.io
  "${SUDO[@]}" apt-get install -y docker-compose-plugin || \
    "${SUDO[@]}" apt-get install -y docker-compose-v2 || \
    fail "Не удалось установить Docker Compose v2"
  "${SUDO[@]}" systemctl enable --now docker
fi

if docker info >/dev/null 2>&1; then SUDO=(); else SUDO=(sudo); fi
if ! "${SUDO[@]}" docker compose version >/dev/null 2>&1; then
  command -v apt-get >/dev/null 2>&1 || fail "Нужен Docker Compose v2 (docker compose)."
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y docker-compose-plugin || \
    "${SUDO[@]}" apt-get install -y docker-compose-v2 || \
    fail "Не удалось установить Docker Compose v2"
fi
if ! "${SUDO[@]}" docker buildx version >/dev/null 2>&1; then
  command -v apt-get >/dev/null 2>&1 || fail "Нужен Docker Buildx"
  "${SUDO[@]}" apt-get install -y docker-buildx-plugin || \
    "${SUDO[@]}" apt-get install -y docker-buildx || \
    fail "Не удалось установить Docker Buildx"
fi
"${SUDO[@]}" docker info >/dev/null 2>&1 || fail "Docker daemon недоступен"
if command -v apt-get >/dev/null 2>&1; then "${SUDO[@]}" apt-get clean; fi

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  printf '%s\n' 'Создан .env. Заполни DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID и пароли БД/панели, затем повтори запуск. ID ролей задаются в панели.'
  exit 1
fi

env_value() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'; }
for name in DISCORD_TOKEN DISCORD_CLIENT_ID DISCORD_GUILD_ID POSTGRES_PASSWORD PANEL_PASSWORD PANEL_API_SECRET; do
  [ -n "$(env_value "$name")" ] || fail "$name не задан в .env"
done
[ "$(env_value POSTGRES_PASSWORD)" != 'dsbot_password' ] || fail "Замени стандартный POSTGRES_PASSWORD"
[ "$(env_value PANEL_PASSWORD)" != 'admin' ] || fail "Замени стандартный PANEL_PASSWORD"
[ "$(env_value PANEL_API_SECRET)" != 'change-me' ] || fail "Замени стандартный PANEL_API_SECRET"
[ "$(env_value DATABASE_URL)" != 'postgresql://dsbot:dsbot_password@postgres:5432/dsbot?schema=public' ] || fail "Укажи в DATABASE_URL тот же пароль, что в POSTGRES_PASSWORD"

docker_root="$("${SUDO[@]}" docker info --format '{{.DockerRootDir}}')"
free_mib="$(df -Pm "$docker_root" | awk 'NR==2 {print $4}')"
if [ "$free_mib" -lt 4096 ]; then
  info "Свободно менее 4 ГБ; очищаю неиспользуемый кэш сборки и старые образы проекта"
  "${SUDO[@]}" docker builder prune -f --keep-storage 512MB >/dev/null
  "${SUDO[@]}" docker image prune -f --filter label=app=dsbot >/dev/null
  free_mib="$(df -Pm "$docker_root" | awk 'NR==2 {print $4}')"
fi
[ "$free_mib" -ge 3072 ] || fail "Для сборки нужно хотя бы 3 ГБ свободного места в разделе Docker; сейчас ${free_mib} МБ"

info "Собираю Discord-бота и панель последовательно"
"${SUDO[@]}" docker compose build discord-bot
"${SUDO[@]}" docker compose build web
"${SUDO[@]}" docker compose up -d --no-build postgres discord-bot web
# Если Telegram запускался прежней версией compose, останавливаем его.
"${SUDO[@]}" docker compose --profile telegram stop telegram-bot >/dev/null 2>&1 || true

info "Жду подключения Discord-бота"
ready=0
for attempt in {1..18}; do
  if "${SUDO[@]}" docker compose logs --no-color discord-bot 2>/dev/null | grep -F 'Discord bot logged in as' >/dev/null; then
    ready=1
    break
  fi
  sleep 5
done
if [ "$ready" -ne 1 ]; then
  "${SUDO[@]}" docker compose logs --tail=50 discord-bot >&2
  fail "Бот не подключился к Discord за 90 секунд"
fi

info "Состояние контейнеров"
"${SUDO[@]}" docker compose ps
info "Очищаю кэш сборки и старые образы проекта; данные PostgreSQL сохраняются"
"${SUDO[@]}" docker builder prune -f --keep-storage 512MB >/dev/null || true
"${SUDO[@]}" docker image prune -f --filter label=app=dsbot >/dev/null || true
"${SUDO[@]}" docker system df
printf '\nЛоги Discord-бота: %s docker compose logs -f discord-bot\n' "${SUDO[*]}"
