import prisma from "@dsbot/db";
import VoicePenaltyForm from "@/components/VoicePenaltyForm";

export const dynamic = "force-dynamic";

export default async function VoicePenaltyPage() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const [saved, windows, suspensions] = guildId
    ? await Promise.all([
        prisma.voicePenaltyConfig.findUnique({ where: { guildId } }),
        prisma.voicePairWindow.findMany({ where: { guildId, active: true }, orderBy: { startedAt: "asc" }, take: 20 }),
        prisma.roleSuspension.findMany({ where: { guildId }, orderBy: { expiresAt: "asc" }, take: 20 }),
      ])
    : [null, [], []];
  const fallback = (process.env.VALORANT_ROLE_IDS ?? "").split(",").map((id) => id.trim());
  const initialConfig = saved ?? (fallback.length === 2 && fallback.every(Boolean)
    ? { enabled: true, firstRoleId: fallback[0], secondRoleId: fallback[1], waitMinutes: 90, repeatExtraMinutes: 20, suspendMinutes: 20, destinationChannelId: null }
    : null);

  return (
    <>
      <h1>Valorant и голосовой канал</h1>
      <p className="subtitle">Выбери роли, посмотри активные пары и узнай, какие ID нужны для настройки.</p>
      <a className="btn btn-sm" href="/voice-penalty" style={{ marginBottom: 18 }}>Обновить состояние</a>
      <VoicePenaltyForm guildId={guildId} config={initialConfig} />

      <div className="spacer" />
      <div className="grid grid-2">
        <div className="card">
          <h2>Пары в голосовых каналах</h2>
          {windows.length === 0 ? <p className="muted">Сейчас нет отслеживаемых пар.</p> : windows.map((window) => (
            <div className="row" key={window.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div><code>{window.firstUserId}</code> и <code>{window.secondUserId}</code></div>
                <div className="muted" style={{ fontSize: 12 }}>Канал {window.channelId} · с {window.startedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</div>
              </div>
              <span className={`pill ${window.repeatCount > 0 ? "pink" : "dim"}`}>
                {window.repeatCount > 0 ? `Повторный отсчёт · ${window.repeatCount} наказаний` : "Первый отсчёт"}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Ожидают возврата роли</h2>
          {suspensions.length === 0 ? <p className="muted">Нет ролей, ожидающих возврата.</p> : suspensions.map((item) => (
            <div className="row" key={item.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div>Участник <code>{item.userId}</code></div>
                <div className="muted" style={{ fontSize: 12 }}>Роль {item.roleId}</div>
              </div>
              <span className="pill green">до {item.expiresAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ maxWidth: 900 }}>
        <h2>Как найти ID и заполнить настройки</h2>
        <ol style={{ lineHeight: 1.8, paddingLeft: 22 }}>
          <li>В Discord открой <strong>Настройки пользователя → Расширенные → Режим разработчика</strong> и включи его. <a href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID" target="_blank" rel="noreferrer">Инструкция Discord ↗</a></li>
          <li>Для <strong>ID сервера</strong> щёлкни правой кнопкой по значку сервера и выбери <strong>Копировать ID сервера</strong>. Впиши его в <code>DISCORD_GUILD_ID</code> файла <code>.env</code> на ПК до деплоя.</li>
          <li>Для <strong>ID роли</strong> открой <strong>Настройки сервера → Роли</strong>, нажми правой кнопкой на нужной роли и выбери <strong>Копировать ID роли</strong>. Два ID вставь в поля выше и сохрани.</li>
          <li>Для <strong>ID голосового канала</strong> нажми правой кнопкой на канал назначения и выбери <strong>Копировать ID канала</strong>. Боту нужны доступ к каналу и право <strong>Перемещать участников</strong>.</li>
          <li>Роль бота в списке ролей поставь <strong>выше обеих выбранных ролей</strong>. У бота должно быть право <strong>Управлять ролями</strong>. <a href="https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions" target="_blank" rel="noreferrer">Права ролей ↗</a></li>
          <li>В <strong>Discord Developer Portal → Applications</strong> выбери приложение. В разделе <strong>General Information</strong> скопируй <strong>Application ID</strong> в <code>DISCORD_CLIENT_ID</code>; в разделе <strong>Bot</strong> скопируй токен в <code>DISCORD_TOKEN</code> и включи <strong>Presence Intent</strong>.</li>
          <li>Пароли <code>POSTGRES_PASSWORD</code>, <code>DATABASE_URL</code>, <code>PANEL_PASSWORD</code> и <code>PANEL_API_SECRET</code> заполни в локальном <code>.env</code>. Пароль БД в <code>DATABASE_URL</code> должен совпадать с <code>POSTGRES_PASSWORD</code>.</li>
          <li>Для деплоя с ПК нужны адрес VPS, имя SSH-пользователя и путь к SSH-ключу. Их вводят при запуске <code>deploy-from-pc.ps1</code>; это данные твоего VPS-провайдера, в панель их сохранять не нужно.</li>
        </ol>
        <p className="muted" style={{ marginBottom: 0 }}>Токен Discord и пароли вводятся только в <code>.env</code>. В панели сохраняются ID ролей, канал, время и переключатель правила.</p>
      </div>
    </>
  );
}
