#!/usr/bin/env bash
#
# deploy.sh — установка зависимостей и запуск DS_TG_BOT на VPS (Linux)
#
# Что делает:
#   1. Проверяет свободное место и чистит docker-кэш при нехватке
#   2. Определяет ОС и пакетный менеджер (apt / dnf / yum)
#   3. Ставит недостающее: curl, git, Docker, Docker Compose (v2)
#   4. Проверяет .env — если нет, создаёт из .env.example и спрашивает токены
#   5. Собирает и запускает весь стек через docker compose
#   6. Проверяет статус, ждёт готовности и показывает итог
#
# Запуск (в папке проекта):
#   chmod +x deploy.sh && ./deploy.sh
#
# Автоклон репозитория: GIT_REPO_URL=https://... ./deploy.sh

set -Eeuo pipefail

# --- Цвета ---------------------------------------------------------------
C_RESET='\033[0m'; C_BOLD='\033[1m'
C_OK='\033[0;32m'; C_INFO='\033[0;36m'; C_WARN='\033[0;33m'; C_ERR='\033[0;31m'

log()  { echo -e "${C_INFO}[INFO]${C_RESET} $*"; }
ok()   { echo -e "${C_OK}[ OK ]${C_RESET} $*"; }
warn() { echo -e "${C_WARN}[WARN]${C_RESET} $*"; }
err()  { echo -e "${C_ERR}[FAIL]${C_RESET} $*" >&2; }
step() { echo -e "\n${C_BOLD}==> $*${C_RESET}"; }

die() { err "$*"; exit 1; }

# --- Определение ОС ------------------------------------------------------
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID:-}"
  else
    OS_ID=""
  fi

  case "$OS_ID" in
    ubuntu|debian|linuxmint|pop) PKG=apt ;;
    centos|rhel|rocky|almalinux|fedora|ol|amzn) PKG=dnf ;;
    *) PKG="" ;;
  esac

  log "ОС: ${OS_ID:-unknown} (пакетный менеджер: ${PKG:-не найден})"
}

# --- Диск ----------------------------------------------------------------
check_disk() {
  step "Проверка свободного места"
  local avail
  avail="$(df -P -k / | awk 'NR==2 {print $4}')"   # свободно в KiB
  avail=$((avail / 1024 / 1024))                   # в GiB

  log "Свободно на диске: ${avail} ГБ"
  if [ "$avail" -lt 3 ]; then
    warn "Места мало — чищу docker build-кэш и висячие образы..."
    docker builder prune -f >/dev/null 2>&1 || true
    docker image prune -f >/dev/null 2>&1 || true
    docker system prune -f >/dev/null 2>&1 || true
    avail="$(df -P -k / | awk 'NR==2 {print $4}')"
    avail=$((avail / 1024 / 1024))
    log "После очистки свободно: ${avail} ГБ"
    if [ "$avail" -lt 2 ]; then
      die "Всё ещё мало места (<2 ГБ). Увеличь диск VPS."
    fi
  fi
  return 0
}

# --- Базовые утилиты -----------------------------------------------------
ensure_core() {
  step "Базовые утилиты (curl, git, ca-certificates)"
  if [ "$PKG" = "apt" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null
    apt-get install -y curl git ca-certificates gnupg lsb-release >/dev/null
  elif [ "$PKG" = "dnf" ]; then
    dnf install -y curl git ca-certificates >/dev/null
  else
    warn "Неизвестный пакетный менеджер — пропускаю установку."
  fi
  ok "Готово"
}

# --- Docker --------------------------------------------------------------
ensure_docker() {
  step "Docker + Docker Compose"
  if command -v docker >/dev/null 2>&1; then
    ok "Docker уже установлен: $(docker --version)"
  else
    log "Docker не найден — устанавливаю через официальный скрипт get.docker.com..."
    curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 || die "Не удалось установить Docker"
    systemctl enable --now docker >/dev/null 2>&1 || true
    ok "Docker установлен"
  fi

  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose v2: $(docker compose version --short 2>/dev/null || echo ok)"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
    ok "Docker Compose v1 (docker-compose)"
  else
    warn "Compose-плагин отсутствует — доустанавливаю..."
    if [ "$PKG" = "apt" ]; then
      apt-get install -y docker-compose-plugin >/dev/null 2>&1 || \
        die "Не удалось установить docker-compose-plugin"
    elif [ "$PKG" = "dnf" ]; then
      dnf install -y docker-compose-plugin >/dev/null 2>&1 || \
        die "Не удалось установить docker-compose-plugin"
    fi
    COMPOSE="docker compose"
    ok "Compose v2 установлен"
  fi

  if ! docker info >/dev/null 2>&1; then
    warn "Нет доступа к docker daemon без sudo. Продолжаю с sudo."
    SUDO="sudo"
  else
    SUDO=""
  fi
}

# --- Репозиторий ---------------------------------------------------------
ensure_repo() {
  step "Проверка проекта"
  if [ -f docker-compose.yml ]; then
    ok "Проект найден в текущей папке: $(pwd)"
    return
  fi

  if [ -n "${GIT_REPO_URL:-}" ]; then
    log "docker-compose.yml не найден — клонирую из ${GIT_REPO_URL}..."
    git clone "${GIT_REPO_URL}" . || die "Не удалось склонировать репозиторий"
    ok "Репозиторий склонирован"
  else
    die "В текущей папке нет docker-compose.yml. Запусти из папки проекта или задай GIT_REPO_URL."
  fi
}

# --- .env ----------------------------------------------------------------
ask_env() {
  local var="$1" prompt="$2"
  local cur
  cur="$(grep -E "^${var}=" .env | tail -1 | cut -d= -f2- || true)"
  if [ -z "$cur" ]; then
    printf "%b" "  ${prompt}: "
    read -r val
    if [ -n "$val" ]; then
      sed -i "s|^${var}=.*|${var}=${val}|" .env
    fi
  fi
}

ensure_env() {
  step "Конфигурация (.env)"
  if [ -f .env ]; then
    ok ".env уже существует — оставляю как есть"
  else
    [ -f .env.example ] || die ".env.example не найден"
    cp .env.example .env
    log "Создан .env из .env.example. Заполни токены (пустое — оставит пустым):"
    ask_env DISCORD_TOKEN      "DISCORD_TOKEN"
    ask_env DISCORD_CLIENT_ID  "DISCORD_CLIENT_ID"
    ask_env TELEGRAM_BOT_TOKEN "TELEGRAM_BOT_TOKEN"
    ask_env TELEGRAM_JOIN_PASSWORD "TELEGRAM_JOIN_PASSWORD (пароль активации группы)"
    ask_env DISCORD_GUILD_ID   "DISCORD_GUILD_ID (можно позже)"
    ask_env PANEL_PASSWORD     "PANEL_PASSWORD (пароль панели)"
  fi

  local missing=0
  for v in DISCORD_TOKEN DISCORD_CLIENT_ID TELEGRAM_BOT_TOKEN; do
    if ! grep -qE "^${v}=.+" .env; then
      warn "${v} не заполнен"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    warn "Заполни их в .env и запусти: ${SUDO:-} $COMPOSE up -d --build"
  fi
  return 0
}

# --- Сборка и запуск -----------------------------------------------------
run_stack() {
  step "Сборка и запуск (первый раз 5–10 минут)"
  log "Чищу build-кэш перед сборкой..."
  docker builder prune -f >/dev/null 2>&1 || true

  ${SUDO:-} $COMPOSE up -d --build
  ok "Стек запущен"
}

verify() {
  step "Проверка статуса"
  ${SUDO:-} $COMPOSE ps
  echo

  local web_port
  web_port="$(grep -E '^WEB_PORT=' .env | cut -d= -f2- || true)"
  web_port="${web_port:-3000}"
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  log "Жду готовности панели (до 60с)..."
  for i in $(seq 1 12); do
    if curl -s -o /dev/null "http://localhost:${web_port}/login"; then
      ok "Панель доступна: http://${ip:-<IP-сервера>}:${web_port}"
      break
    fi
    sleep 5
  done

  log "Пароль панели — переменная PANEL_PASSWORD в .env"
  log "Логи ботов: ${SUDO:-} $COMPOSE logs -f discord-bot"
  log "Логи telegram: ${SUDO:-} $COMPOSE logs -f telegram-bot"
}

# --- Main -----------------------------------------------------------------
main() {
  echo -e "${C_BOLD}DS_TG_BOT — деплой на VPS${C_RESET}"
  detect_os
  check_disk
  ensure_core
  ensure_docker
  ensure_repo
  ensure_env
  run_stack
  verify
  ok "Всё готово!"
}

COMPOSE="docker compose"
SUDO=""
main "$@"
