"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Mention {
  id: string;
  discordKey: string;
  telegramMention: string;
}

export default function MentionManager({ mentions }: { mentions: Mention[] }) {
  const router = useRouter();
  const [discordKey, setDiscordKey] = useState("");
  const [telegramMention, setTelegramMention] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!discordKey.trim() || !telegramMention.trim()) return;
    setSaving(true);
    await fetch("/api/mentions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordKey, telegramMention }),
    });
    setSaving(false);
    setDiscordKey("");
    setTelegramMention("");
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/mentions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <h2>➕ Добавить привязку</h2>
        <div className="gap" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Discord ID (или ник)</label>
            <input
              value={discordKey}
              onChange={(e) => setDiscordKey(e.target.value)}
              placeholder="например: 1051574928270430298"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Telegram @username</label>
            <input
              value={telegramMention}
              onChange={(e) => setTelegramMention(e.target.value)}
              placeholder="@nikita"
            />
          </div>
          <button className="btn btn-primary" onClick={add} disabled={saving} style={{ marginBottom: 16 }}>
            Добавить
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Telegram указывается как @username. Числовой ID бот подставит сам, когда участник напишет ему /start в личку (нужно для доставки уведомлений в ЛС).
        </p>
      </div>

      <div className="spacer" />

      <div className="card">
        {mentions.length === 0 ? (
          <div className="empty">Привязок пока нет.</div>
        ) : (
          mentions.map((m, i) => (
            <div
              key={m.id}
              className="row"
              style={{
                padding: "14px 0",
                borderBottom: i === mentions.length - 1 ? "none" : "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{m.discordKey}</span>
                <span className="muted" style={{ margin: "0 8px" }}>→</span>
                <span className="code">{m.telegramMention}</span>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => remove(m.id)}>
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
