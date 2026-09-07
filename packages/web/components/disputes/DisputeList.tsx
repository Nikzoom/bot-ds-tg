"use client";

import { useRouter } from "next/navigation";

interface Vote {
  optionIndex: number;
}
interface Dispute {
  id: string;
  title: string;
  description: string | null;
  status: string;
  options: string[];
  winnerOptionIndex: number | null;
  votes: Vote[];
  createdAt: string;
}

const statusLabel: Record<string, string> = {
  open: "Открыт",
  settled: "Завершён",
  closed: "Закрыт",
};

export default function DisputeList({ disputes }: { disputes: Dispute[] }) {
  const router = useRouter();

  async function settle(id: string) {
    if (!confirm("Завершить спор и подвести итоги?")) return;
    await fetch(`/api/disputes/${id}/settle`, { method: "POST" });
    router.refresh();
  }

  if (disputes.length === 0) {
    return <div className="empty">Споров пока нет.</div>;
  }

  return (
    <div className="card">
      {disputes.map((d, i) => {
        const counts = new Array<number>(d.options.length).fill(0);
        for (const v of d.votes) counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
        const total = counts.reduce((a, b) => a + b, 0);
        const open = d.status === "open";

        return (
          <div
            key={d.id}
            style={{
              padding: "16px 0",
              borderBottom: i === disputes.length - 1 ? "none" : "1px solid var(--border)",
            }}
          >
            <div className="between">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 650 }}>{d.title}</span>
                <span className={`pill ${open ? "green" : "dim"}`}>{statusLabel[d.status] ?? d.status}</span>
              </div>
              <span className="code">{d.id.slice(0, 8)}</span>
            </div>

            <div style={{ margin: "12px 0" }}>
              {d.options.map((opt, oi) => {
                const pct = total === 0 ? 0 : Math.round((counts[oi] / total) * 100);
                const winner = d.winnerOptionIndex === oi;
                return (
                  <div key={oi} style={{ marginBottom: 8 }}>
                    <div className="between" style={{ fontSize: 13 }}>
                      <span>
                        {oi + 1}. {opt} {winner ? "🏆" : ""}
                      </span>
                      <span className="muted">{counts[oi]} голосов · {pct}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 4,
                        background: "var(--bg-soft)",
                        marginTop: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: winner ? "var(--grad)" : "var(--accent)",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {open && (
              <button className="btn btn-sm" onClick={() => settle(d.id)}>
                Завершить спор
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
