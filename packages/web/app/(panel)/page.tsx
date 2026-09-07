import prisma, { getLeaderboard, monthRange } from "@dsbot/db";
import { monthKey, monthLabelRu, formatDuration } from "@dsbot/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const key = monthKey();
  const { from, to } = monthRange(key);

  const totals = await prisma.dailyStat.aggregate({
    where: { date: { gte: from, lt: to } },
    _sum: { voiceSeconds: true, messages: true, score: true },
    _count: true,
  });

  const activeUsers = await prisma.dailyStat.count({
    where: { date: { gte: from, lt: to }, score: { gt: 0 } },
  });

  const leaders = await getLeaderboard(from, to, 3);

  const rulesCount = await prisma.rule.count({ where: { enabled: true } });
  const openDisputes = await prisma.dispute.count({ where: { status: "open" } });

  const voiceSeconds = totals._sum.voiceSeconds ?? 0;
  const messages = totals._sum.messages ?? 0;

  return (
    <>
      <h1>Дашборд</h1>
      <p className="subtitle">Обзор активности сообщества за {monthLabelRu(key)}</p>

      <div className="grid grid-3">
        <div className="card stat-card">
          <div className="card-label">Время в голосе</div>
          <div className="card-value">{formatDuration(voiceSeconds)}</div>
          <div className="card-delta muted">суммарно за месяц</div>
        </div>
        <div className="card stat-card">
          <div className="card-label">Сообщений</div>
          <div className="card-value">{messages}</div>
          <div className="card-delta muted">в Discord и Telegram</div>
        </div>
        <div className="card stat-card">
          <div className="card-label">Активных участников</div>
          <div className="card-value">{activeUsers}</div>
          <div className="card-delta muted">с ненулевой активностью</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="grid grid-2">
        <div className="card">
          <div className="between">
            <h2 style={{ margin: 0 }}>🏆 Лидеры месяца</h2>
            <Link href="/leaderboard" className="btn btn-sm">
              Весь топ →
            </Link>
          </div>
          <div className="spacer" />
          {leaders.length === 0 ? (
            <div className="empty">Пока нет данных</div>
          ) : (
            leaders.map((l, i) => (
              <div
                key={l.userId}
                className="row"
                style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
              >
                <div className="avatar">
                  {l.avatarUrl ? <img src={l.avatarUrl} alt="" /> : l.displayName[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{l.displayName}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {formatDuration(l.voiceSeconds)} · {l.messages} сообщений
                  </div>
                </div>
                <span className="pill" style={{ background: "var(--grad)", color: "#0a0a12" }}>
                  {["🥇", "🥈", "🥉"][i]} {l.score.toFixed(1)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: 0 }}>Система</h2>
          <div className="spacer" />
          <div className="row" style={{ padding: "10px 0" }}>
            <div style={{ flex: 1 }}>Активные правила</div>
            <Link href="/rules" className="pill green">
              {rulesCount}
            </Link>
          </div>
          <div className="row" style={{ padding: "10px 0" }}>
            <div style={{ flex: 1 }}>Открытые споры</div>
            <Link href="/disputes" className="pill pink">
              {openDisputes}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
