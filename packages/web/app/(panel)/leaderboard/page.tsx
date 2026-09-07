import { getLeaderboard, monthRange } from "@dsbot/db";
import { monthKey, monthLabelRu, formatDuration } from "@dsbot/shared";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const key = monthKey();
  const { from, to } = monthRange(key);
  const leaders = await getLeaderboard(from, to, 25);

  return (
    <>
      <h1>Топ активности</h1>
      <p className="subtitle">Рейтинг за {monthLabelRu(key)}. Очки = минуты в голосе + сообщения × 0.2.</p>

      {leaders.length === 0 ? (
        <div className="empty">Пока нет данных за этот месяц.</div>
      ) : (
        <>
          {leaders.length >= 3 && (
            <div className="card">
              <div className="podium">
                {[leaders[1], leaders[0], leaders[2]].map((l, idx) => {
                  const realRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                  const medal = ["🥈", "🥇", "🥉"][idx];
                  return (
                    <div key={l.userId} className={`place rank-${realRank}`}>
                      <div className="avatar" style={{ width: 56, height: 56, fontSize: 20, margin: "0 auto" }}>
                        {l.avatarUrl ? <img src={l.avatarUrl} alt="" /> : l.displayName[0]}
                      </div>
                      <div style={{ fontWeight: 650, marginTop: 8 }}>{l.displayName}</div>
                      <div className="bar" style={{ margin: "10px auto 0" }}>
                        <div style={{ fontSize: 20 }}>{medal}</div>
                        <div style={{ fontSize: 14 }}>{l.score.toFixed(1)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="spacer" />

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Участник</th>
                  <th>Голос</th>
                  <th>Сообщения</th>
                  <th>Очки</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l, i) => (
                  <tr key={l.userId}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="row">
                        <div className="avatar">
                          {l.avatarUrl ? <img src={l.avatarUrl} alt="" /> : l.displayName[0]}
                        </div>
                        <span>{l.displayName}</span>
                      </div>
                    </td>
                    <td>{formatDuration(l.voiceSeconds)}</td>
                    <td>{l.messages}</td>
                    <td>
                      <span className="pill" style={{ background: "var(--grad)", color: "#0a0a12" }}>
                        {l.score.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
