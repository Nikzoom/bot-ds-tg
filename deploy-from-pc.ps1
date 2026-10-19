param(
  [string]$VpsHost,
  [string]$VpsUser,
  [string]$VpsPath,
  [ValidateRange(1, 65535)][int]$VpsPort,
  [string]$SshKey
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

function Ask-Value {
  param([string]$Label, [string]$Default, [string]$Pattern, [string]$Hint)
  while ($true) {
    Write-Host $Hint
    $suffix = if ($Default) { " [$Default]" } else { "" }
    $answer = (Read-Host "$Label$suffix").Trim()
    if (-not $answer) { $answer = $Default }
    if ($answer -and $answer -match $Pattern) { return $answer }
    Write-Host "Формат не подходит. Попробуй ещё раз." -ForegroundColor Yellow
  }
}

function Ask-Secret {
  param([string]$Label, [string]$Pattern, [string]$Hint)
  while ($true) {
    Write-Host $Hint
    $secure = Read-Host $Label -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $answer = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($answer -and $answer -match $Pattern) { return $answer }
    Write-Host "Формат не подходит. Попробуй ещё раз." -ForegroundColor Yellow
  }
}

Write-Host "Настройка деплоя DS_TG_BOT. Нажми Enter, чтобы принять значение в квадратных скобках."
if (-not $VpsHost) {
  $VpsHost = Ask-Value "IP или домен VPS" "" '^[a-zA-Z0-9.-]+$' "Пример: 203.0.113.10 или vps.example.com. Адрес указан у провайдера VPS."
}
if (-not $VpsUser) {
  $VpsUser = Ask-Value "SSH-пользователь" "ubuntu" '^[a-zA-Z_][a-zA-Z0-9_-]*$' "Пример: ubuntu или root. Это имя для входа на VPS, не имя бота."
}
if (-not $PSBoundParameters.ContainsKey("VpsPort")) {
  $VpsPort = [int](Ask-Value "SSH-порт" "22" '^[0-9]{1,5}$' "Обычно 22. Если провайдер дал другой порт, впиши его число, например 2222.")
}
if (-not $VpsPath) {
  $VpsPath = Ask-Value "Папка проекта на VPS" "dsbot" '^(?!.*\.\.)(?!.*//)[a-zA-Z0-9_][a-zA-Z0-9_/-]*$' "Папка в домашнем каталоге SSH-пользователя. Пример: dsbot."
}
if (-not $PSBoundParameters.ContainsKey("SshKey")) {
  Write-Host "Если используешь SSH-ключ, укажи полный путь, например C:\Users\Nikita\.ssh\id_ed25519."
  Write-Host "Если входишь по паролю или ключ уже настроен в SSH, нажми Enter. ssh.exe сам запросит пароль."
  $SshKey = (Read-Host "Путь к SSH-ключу (необязательно)").Trim()
}
if ($VpsHost -notmatch '^[a-zA-Z0-9.-]+$') { throw "Неверный адрес VPS" }
if ($VpsUser -notmatch '^[a-zA-Z_][a-zA-Z0-9_-]*$') { throw "Неверное имя SSH-пользователя" }
if ($VpsPort -lt 1 -or $VpsPort -gt 65535) { throw "SSH-порт должен быть от 1 до 65535" }
if ($VpsPath -notmatch '^(?!.*\.\.)(?!.*//)[a-zA-Z0-9_][a-zA-Z0-9_/-]*$') { throw "Неверная папка проекта на VPS" }
if ($SshKey -and -not (Test-Path -LiteralPath $SshKey -PathType Leaf)) { throw "SSH-ключ не найден: $SshKey" }

foreach ($command in @("ssh.exe", "scp.exe", "tar.exe")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Нужна утилита $command. Установи OpenSSH Client в компонентах Windows." }
}

$envValues = @{}
$envLines = if (Test-Path -LiteralPath $envPath -PathType Leaf) {
  Write-Host "Найден локальный .env: сохранённые секреты будут использованы повторно."
  [System.IO.File]::ReadAllLines($envPath, [System.Text.Encoding]::UTF8)
} else {
  [System.IO.File]::ReadAllLines((Join-Path $projectRoot ".env.example"), [System.Text.Encoding]::UTF8)
}
foreach ($line in $envLines) {
  if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $envValues[$Matches[1]] = $Matches[2].Trim() }
}

if (-not $envValues.DISCORD_TOKEN) {
  $envValues.DISCORD_TOKEN = Ask-Secret "Токен Discord-бота" '^[A-Za-z0-9._-]+$' "Discord Developer Portal -> Applications -> приложение -> Bot -> Reset Token / Copy. Это длинная строка с точками, не Application ID. Ввод скрыт."
}
if (-not $envValues.DISCORD_CLIENT_ID) {
  $envValues.DISCORD_CLIENT_ID = Ask-Value "Application ID" "" '^[0-9]{17,22}$' "Discord Developer Portal -> приложение -> General Information -> Application ID. Пример: 123456789012345678 (только цифры)."
}
if (-not $envValues.DISCORD_GUILD_ID) {
  $envValues.DISCORD_GUILD_ID = Ask-Value "ID Discord-сервера" "" '^[0-9]{17,22}$' "В Discord включи режим разработчика, нажми правой кнопкой на значок сервера -> Копировать ID. Пример: 123456789012345678."
}
if (-not $envValues.POSTGRES_PASSWORD -or $envValues.POSTGRES_PASSWORD -eq "dsbot_password") {
  $envValues.POSTGRES_PASSWORD = Ask-Secret "Новый пароль базы данных (минимум 16 символов)" '^[A-Za-z0-9]{16,}$' "Придумай отдельный пароль из латинских букв и цифр. Скрипт сам впишет его в DATABASE_URL. Ввод скрыт."
  $envValues.DATABASE_URL = "postgresql://$($envValues.POSTGRES_USER):$($envValues.POSTGRES_PASSWORD)@postgres:5432/$($envValues.POSTGRES_DB)?schema=public"
}
if (-not $envValues.PANEL_PASSWORD -or $envValues.PANEL_PASSWORD -eq "admin") {
  $envValues.PANEL_PASSWORD = Ask-Secret "Новый пароль для входа в веб-панель (минимум 12 символов)" '^[A-Za-z0-9]{12,}$' "Придумай пароль из латинских букв и цифр. Это пароль панели, не пароль SSH. Ввод скрыт."
}
if (-not $envValues.PANEL_API_SECRET -or $envValues.PANEL_API_SECRET -eq "change-me") {
  $random = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($random) } finally { $rng.Dispose() }
  $envValues.PANEL_API_SECRET = [BitConverter]::ToString($random).Replace("-", "").ToLowerInvariant()
  Write-Host "Секрет API панели создан автоматически."
}
$webPort = Ask-Value "Порт веб-панели" $(if ($envValues.WEB_PORT) { $envValues.WEB_PORT } else { "3000" }) '^[0-9]{1,5}$' "Обычно 3000. Адрес после запуска: http://IP_VPS:3000. Порт должен быть открыт в настройках VPS."
if ([int]$webPort -lt 1 -or [int]$webPort -gt 65535) { throw "Порт панели должен быть от 1 до 65535" }
$envValues.WEB_PORT = $webPort

foreach ($name in @("DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID", "POSTGRES_PASSWORD", "PANEL_PASSWORD", "PANEL_API_SECRET", "DATABASE_URL")) {
  if (-not $envValues[$name]) { throw "Не задано $name" }
}
if ($envValues.DATABASE_URL -eq "postgresql://dsbot:dsbot_password@postgres:5432/dsbot?schema=public") { throw "В DATABASE_URL остался стандартный пароль БД" }

$written = @{}
$newLines = foreach ($line in $envLines) {
  if ($line -match '^([A-Z][A-Z0-9_]*)=' -and $envValues.ContainsKey($Matches[1])) {
    $name = $Matches[1]
    $written[$name] = $true
    "$name=$($envValues[$name])"
  } else { $line }
}
foreach ($name in $envValues.Keys) {
  if (-not $written.ContainsKey($name)) { $newLines += "$name=$($envValues[$name])" }
}
$tmpEnv = Join-Path $projectRoot (".env-" + [guid]::NewGuid().ToString("N") + ".tmp")
try {
  [System.IO.File]::WriteAllLines($tmpEnv, [string[]]$newLines, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmpEnv -Destination $envPath -Force
} finally {
  if (Test-Path -LiteralPath $tmpEnv) { Remove-Item -LiteralPath $tmpEnv -Force }
}

$sshOptions = @("-p", [string]$VpsPort)
$scpOptions = @("-P", [string]$VpsPort)
if ($SshKey) {
  $key = (Resolve-Path -LiteralPath $SshKey).Path
  $sshOptions += @("-i", $key)
  $scpOptions += @("-i", $key)
}
$destination = "${VpsUser}@${VpsHost}"
$uploadId = [guid]::NewGuid().ToString("N")
$archiveName = ".dsbot-upload-$uploadId.tar.gz"
$remoteEnv = ".dsbot-env-$uploadId"
$archivePath = Join-Path ([IO.Path]::GetTempPath()) $archiveName

try {
  Write-Host "Упаковываю текущую версию проекта..."
  & tar.exe -czf $archivePath --exclude=.git --exclude=node_modules --exclude='*/node_modules' --exclude=dist --exclude='*/dist' --exclude=.next --exclude='*/.next' --exclude=.env --exclude='.env-*.tmp' --exclude=coverage --exclude='*/coverage' --exclude='*.log' -C $projectRoot .
  if ($LASTEXITCODE -ne 0) { throw "Не удалось упаковать проект" }

  Write-Host "Подключаюсь к $destination. При входе по паролю ssh.exe попросит его здесь."
  & ssh.exe @sshOptions $destination "mkdir -p -- '$VpsPath' && umask 077 && : > '$remoteEnv' && chmod 600 '$remoteEnv'"
  if ($LASTEXITCODE -ne 0) { throw "Не удалось подключиться к VPS или создать папку проекта" }

  Write-Host "Передаю проект и .env на VPS..."
  & scp.exe @scpOptions $archivePath "${destination}:${archiveName}"
  if ($LASTEXITCODE -ne 0) { throw "Не удалось передать проект" }
  & scp.exe @scpOptions $envPath "${destination}:${remoteEnv}"
  if ($LASTEXITCODE -ne 0) { throw "Не удалось передать .env" }

  Write-Host "Запускаю деплой на VPS..."
  $remoteCommand = "tar -xzf '$archiveName' -C '$VpsPath' && mv -f '$remoteEnv' '$VpsPath/.env' && chmod 600 '$VpsPath/.env' && rm -f '$archiveName' && cd '$VpsPath' && bash deploy.sh"
  & ssh.exe @sshOptions -tt $destination $remoteCommand
  if ($LASTEXITCODE -ne 0) { throw "Деплой на VPS завершился с ошибкой. Проверь вывод выше." }

  Write-Host "Готово. Открой http://${VpsHost}:${webPort}/voice-penalty и настрой две роли." -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
}
