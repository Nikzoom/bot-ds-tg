"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  config: {
    id: string;
    name: string;
    discordGuildId: string | null;
    telegramChatId: string | null;
    settings: { scoreVoicePerMinute?: number; scoreMessage?: number };
  } | null;
}

export default function SettingsForm({ config }: Props) {
  const router = useRouter();
  const [name, setName] = useState(config?.name ?? "Community");
  const [discordGuildId, setDiscordGuildId] = useState(config?.discordGuildId ?? "");
  const [telegramChatId, setTelegramChatId] = useState(config?.telegramChatId ?? "");
  const [voiceWeight, setVoiceWeight] = useState(
    String(config?.settings?.scoreVoicePerMinute ?? 1)
  );
  const [messageWeight, setMessageWeight] = useState(
    String(config?.settings?.scoreMessage ?? 0.2)
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: config?.id,
        name,
        discordGuildId: discordGuildId || null,
        telegramChatId: telegramChatId || null,
        settings: {
          scoreVoicePerMinute: Number(voiceWeight),
          scoreMessage: Number(messageWeight),
        },
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2>Конфигурация сообщества</h2>
      <div className="field">
        <label>Название</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Discord Guild ID</label>
        <input value={discordGuildId} onChange={(e) => setDiscordGuildId(e.target.value)} placeholder="123456789012345678" />
      </div>
      <div className="field">
        <label>Telegram Chat ID</label>
        <input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="-1001234567890" />
      </div>

      <div className="divider" />

      <h2>Формула очков активности</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Очки = (минуты в голосе × вес) + (сообщения × вес)
      </p>
      <div className="gap">
        <div className="field" style={{ flex: 1 }}>
          <label>Вес минуты в голосе</label>
          <input value={voiceWeight} onChange={(e) => setVoiceWeight(e.target.value)} type="number" step="0.1" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Вес сообщения</label>
          <input value={messageWeight} onChange={(e) => setMessageWeight(e.target.value)} type="number" step="0.1" />
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}
