#!/usr/bin/env bash
# check.sh — быстрая проверка статуса стека DS_TG_BOT
set -uo pipefail
cd "$(dirname "$0")" || exit 1

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "Docker Compose не найден"; exit 1
fi

echo "==================== КОНТЕЙНЕРЫ ===================="
$DC ps
echo

echo "==================== ЛОГИ (последние строки) ===================="
for s in postgres discord-bot telegram-bot web; do
  echo "--- $s ---"
  $DC logs --tail=15 "$s" 2>&1 | tail -n 15
  echo
done

PORT="$(grep -E '^WEB_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
PORT="${PORT:-3000}"
echo "==================== ПАНЕЛЬ ===================="
if curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:${PORT}/login"; then
  echo "Панель отвечает на порту ${PORT}"
else
  echo "Панель НЕ отвечает на порту ${PORT} — смотри логи web выше"
fi
echo
echo "Логи в реальном времени: $DC logs -f discord-bot"
