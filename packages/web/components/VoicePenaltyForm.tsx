"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  guildId: string;
  config: { enabled: boolean; firstRoleId: string | null; secondRoleId: string | null; waitMinutes: number; repeatExtraMinutes: number; suspendMinutes: number; destinationChannelId: string | null } | null;
}

export default function VoicePenaltyForm({ guildId, config }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [firstRoleId, setFirstRoleId] = useState(config?.firstRoleId ?? "");
  const [secondRoleId, setSecondRoleId] = useState(config?.secondRoleId ?? "");
  const [waitMinutes, setWaitMinutes] = useState(String(config?.waitMinutes ?? 90));
  const [repeatExtraMinutes, setRepeatExtraMinutes] = useState(String(config?.repeatExtraMinutes ?? 20));
  const [suspendMinutes, setSuspendMinutes] = useState(String(config?.suspendMinutes ?? 20));
  const [destinationChannelId, setDestinationChannelId] = useState(config?.destinationChannelId ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function save() {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/voice-penalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, firstRoleId, secondRoleId, waitMinutes: Number(waitMinutes), repeatExtraMinutes: Number(repeatExtraMinutes), suspendMinutes: Number(suspendMinutes), destinationChannelId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить настройки");
      setNotice("Настройки сохранены. Бот применит их в течение 15 секунд.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h2>Правило Valorant</h2>
      <p className="muted">Если пара находится в одном голосовом канале заданное время и хотя бы у одного отображается Valorant, бот снимет роли и перенесёт обоих в выбранный канал. Если они уже там, останутся на месте. После первого наказания повторный отсчёт будет длиннее; выход или смена канала сбросит его к первому.</p>
      <p className="muted">Сервер Discord: <code>{guildId || "DISCORD_GUILD_ID пока не задан"}</code></p>
      <label className="row" style={{ gap: 10, marginBottom: 18 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 18 }} />
        <span>Правило включено</span>
      </label>
      <div className="field">
        <label htmlFor="firstRoleId">ID первой роли</label>
        <input id="firstRoleId" inputMode="numeric" value={firstRoleId} onChange={(e) => setFirstRoleId(e.target.value)} placeholder="123456789012345678" />
      </div>
      <div className="field">
        <label htmlFor="secondRoleId">ID второй роли</label>
        <input id="secondRoleId" inputMode="numeric" value={secondRoleId} onChange={(e) => setSecondRoleId(e.target.value)} placeholder="123456789012345679" />
      </div>
      <div className="field">
        <label htmlFor="waitMinutes">Время пары в голосовом канале, минут</label>
        <input id="waitMinutes" type="number" min="1" max="10080" step="1" value={waitMinutes} onChange={(e) => setWaitMinutes(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="repeatExtraMinutes">Дополнительное время после первого наказания, минут</label>
        <input id="repeatExtraMinutes" type="number" min="1" max="10080" step="1" value={repeatExtraMinutes} onChange={(e) => setRepeatExtraMinutes(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="suspendMinutes">Время без ролей, минут</label>
        <input id="suspendMinutes" type="number" min="1" max="10080" step="1" value={suspendMinutes} onChange={(e) => setSuspendMinutes(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="destinationChannelId">ID голосового канала для переноса</label>
        <input id="destinationChannelId" inputMode="numeric" value={destinationChannelId} onChange={(e) => setDestinationChannelId(e.target.value)} placeholder="123456789012345680" />
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving || !guildId}>
        {saving ? "Сохраняем…" : "Сохранить правило"}
      </button>
      {notice && <p role="status" style={{ marginBottom: 0 }}>{notice}</p>}
    </div>
  );
}
