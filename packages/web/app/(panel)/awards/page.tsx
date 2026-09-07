import prisma from "@dsbot/db";
import { monthLabelRu } from "@dsbot/shared";
import RunAwards from "@/components/awards/RunAwards";

export const dynamic = "force-dynamic";

export default async function AwardsPage() {
  const awards = await prisma.award.findMany({
    orderBy: [{ month: "desc" }, { points: "desc" }],
    include: { user: true },
    take: 50,
  });

  const months = [...new Set(awards.map((a) => a.month))];

  return (
    <>
      <div className="between">
        <div>
          <h1>Награды</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            Награды за самых активных участников по итогам месяца.
          </p>
        </div>
        <RunAwards />
      </div>

      <div className="spacer" />

      {awards.length === 0 ? (
        <div className="empty">Наград пока нет. Запусти подсчёт в конце месяца.</div>
      ) : (
        months.map((month) => (
          <div key={month} style={{ marginBottom: 28 }}>
            <h2 style={{ color: "var(--gold)" }}>🏆 {monthLabelRu(month)}</h2>
            <div className="grid grid-3">
              {awards
                .filter((a) => a.month === month)
                .map((a) => (
                  <div key={a.id} className="card stat-card">
                    <div className="card-label">{a.title}</div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
                        {a.user.avatarUrl ? (
                          <img src={a.user.avatarUrl} alt="" />
                        ) : (
                          a.user.displayName[0]
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 650 }}>{a.user.displayName}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {a.description}
                        </div>
                      </div>
                    </div>
                    <div className="card-delta">
                      <span className="pill" style={{ background: "var(--grad)", color: "#0a0a12" }}>
                        ⭐ {a.points.toFixed(1)} очков
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
