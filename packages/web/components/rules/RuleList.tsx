"use client";

import { useRouter } from "next/navigation";

interface Rule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: string;
  conditions: unknown;
  actions: unknown;
}

const triggerLabel: Record<string, string> = {
  voice: "Голос",
  message: "Сообщение",
  presence: "Игра",
  cron: "Расписание",
};

export default function RuleList({ rules }: { rules: Rule[] }) {
  const router = useRouter();

  async function toggle(rule: Rule) {
    await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Удалить правило?")) return;
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (rules.length === 0) {
    return <div className="empty">Правил пока нет. Создай первое ниже.</div>;
  }

  return (
    <div className="card">
      {rules.map((rule, i) => {
        const conds = (rule.conditions as unknown[]).length;
        const acts = (rule.actions as unknown[]).length;
        return (
          <div
            key={rule.id}
            className="row"
            style={{
              padding: "14px 0",
              borderBottom: i === rules.length - 1 ? "none" : "1px solid var(--border)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{rule.name}</span>
                <span className="badge">{triggerLabel[rule.trigger] ?? rule.trigger}</span>
              </div>
              {rule.description && (
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                  {rule.description}
                </div>
              )}
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                {conds} условий · {acts} действий
              </div>
            </div>
            <div className={`toggle ${rule.enabled ? "on" : ""}`} onClick={() => toggle(rule)} />
            <button className="btn btn-sm btn-danger" onClick={() => remove(rule.id)}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
