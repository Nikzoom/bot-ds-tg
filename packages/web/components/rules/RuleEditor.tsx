"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FieldDef =
  | { key: string; label: string; type: "text"; placeholder?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] };

const CONDITION_TYPES: Record<string, { label: string; fields: FieldDef[] }> = {
  users_in_voice: {
    label: "Люди вместе в голосовом канале",
    fields: [
      { key: "userIds", label: "Discord ID пользователей (через запятую)", type: "text", placeholder: "123456789, 987654321" },
      {
        key: "operator",
        label: "Условие",
        type: "select",
        options: [
          { value: "all", label: "Все вместе" },
          { value: "at_least", label: "Хотя бы N" },
          { value: "any", label: "Любой из них" },
          { value: "none", label: "Никого нет" },
        ],
      },
      { key: "minCount", label: "N (если «хотя бы N»)", type: "text", placeholder: "3" },
      { key: "channelName", label: "Название канала (опционально)", type: "text" },
    ],
  },
  user_in_voice: {
    label: "Пользователь в голосовом канале",
    fields: [
      { key: "userIds", label: "Discord ID (через запятую)", type: "text" },
      {
        key: "operator",
        label: "Условие",
        type: "select",
        options: [
          { value: "all", label: "Все в голосе" },
          { value: "any", label: "Хотя бы один" },
          { value: "none", label: "Никого нет" },
        ],
      },
    ],
  },
  user_playing: {
    label: "Пользователь играет в игру",
    fields: [
      { key: "userIds", label: "Discord ID (через запятую)", type: "text" },
      { key: "gameName", label: "Название игры", type: "text", placeholder: "Valorant" },
      {
        key: "operator",
        label: "Условие",
        type: "select",
        options: [
          { value: "all", label: "Все играют" },
          { value: "any", label: "Хотя бы один" },
        ],
      },
    ],
  },
  message_contains: {
    label: "Сообщение содержит текст",
    fields: [
      { key: "keywords", label: "Ключевые слова (через запятую)", type: "text", placeholder: "сбор, го, идём" },
      {
        key: "operator",
        label: "Условие",
        type: "select",
        options: [
          { value: "any", label: "Хотя бы одно слово" },
          { value: "all", label: "Все слова" },
        ],
      },
    ],
  },
  message_in_channel: {
    label: "Сообщение в канале",
    fields: [
      { key: "channelId", label: "ID канала", type: "text" },
      { key: "channelName", label: "Или имя канала", type: "text" },
    ],
  },
};

const ACTION_TYPES: Record<string, { label: string; fields: FieldDef[] }> = {
  announce_discord: {
    label: "Сообщение в Discord",
    fields: [
      { key: "channelId", label: "ID канала Discord", type: "text" },
      { key: "content", label: "Текст (можно {users}, {game})", type: "textarea", placeholder: "Сбор: {users} в голосе!" },
      { key: "color", label: "Цвет embed (hex, опционально)", type: "text", placeholder: "5865F2" },
    ],
  },
  announce_telegram: {
    label: "Сообщение в Telegram",
    fields: [
      { key: "content", label: "Текст (можно {users}, {game})", type: "textarea", placeholder: "Игроки {users} сейчас играют!" },
    ],
  },
  assign_game_tag: {
    label: "Пометить как игру",
    fields: [{ key: "gameTag", label: "Название игры (тег)", type: "text", placeholder: "Valorant" }],
  },
};

function emptyCondition(type: string): Record<string, unknown> {
  const obj: Record<string, unknown> = { type };
  for (const f of CONDITION_TYPES[type]?.fields ?? []) {
    if (f.key === "operator") obj[f.key] = f.type === "select" ? "all" : "";
    else obj[f.key] = "";
  }
  return obj;
}

function emptyAction(type: string): Record<string, unknown> {
  const obj: Record<string, unknown> = { type };
  for (const f of ACTION_TYPES[type]?.fields ?? []) {
    obj[f.key] = "";
  }
  return obj;
}

function toList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function normalizeCondition(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: c.type };
  if (c.type === "users_in_voice" || c.type === "user_in_voice" || c.type === "user_playing") {
    out.userIds = toList(String(c.userIds ?? ""));
    out.operator = c.operator;
    if (c.type === "users_in_voice") {
      if (c.operator === "at_least" && c.minCount) out.minCount = Number(c.minCount);
      if (c.channelName) out.channelName = String(c.channelName);
    }
    if (c.type === "user_playing") out.gameName = String(c.gameName ?? "");
  }
  if (c.type === "message_contains") {
    out.keywords = toList(String(c.keywords ?? ""));
    out.operator = c.operator;
  }
  if (c.type === "message_in_channel") {
    if (c.channelId) out.channelId = String(c.channelId);
    if (c.channelName) out.channelName = String(c.channelName);
  }
  return out;
}

function normalizeAction(a: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: a.type };
  if (a.type === "announce_discord") {
    out.channelId = String(a.channelId ?? "");
    out.content = String(a.content ?? "");
    if (a.color) out.color = String(a.color);
    out.embed = true;
  }
  if (a.type === "announce_telegram") {
    out.content = String(a.content ?? "");
  }
  if (a.type === "assign_game_tag") {
    out.gameTag = String(a.gameTag ?? "");
  }
  return out;
}

export default function RuleEditor() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("voice");
  const [conditions, setConditions] = useState<Record<string, unknown>[]>([
    emptyCondition("users_in_voice"),
  ]);
  const [actions, setActions] = useState<Record<string, unknown>[]>([emptyAction("announce_telegram")]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateCondition(idx: number, patch: Record<string, unknown>) {
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function updateAction(idx: number, patch: Record<string, unknown>) {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          trigger,
          conditions: conditions.map(normalizeCondition),
          actions: actions.map(normalizeAction),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Ошибка сохранения");
      } else {
        setName("");
        setDescription("");
        setConditions([emptyCondition("users_in_voice")]);
        setActions([emptyAction("announce_telegram")]);
        router.refresh();
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h2>➕ Новое правило</h2>
      <div className="field">
        <label>Название</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Тройка в Valorant" />
      </div>
      <div className="field">
        <label>Описание (опционально)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label>Триггер</label>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
          <option value="voice">Голосовой канал</option>
          <option value="message">Сообщение</option>
          <option value="presence">Присутствие (игра)</option>
        </select>
      </div>

      <div className="divider" />

      <div className="between">
        <h2 style={{ margin: 0 }}>Условия (все должны выполняться)</h2>
        <button
          className="btn btn-sm"
          onClick={() => setConditions((p) => [...p, emptyCondition("users_in_voice")])}
        >
          + Условие
        </button>
      </div>
      {conditions.map((c, i) => (
        <div key={i} className="card" style={{ marginTop: 14, background: "var(--bg-soft)" }}>
          <div className="between">
            <select
              value={String(c.type)}
              style={{ width: "auto" }}
              onChange={(e) => setConditions((p) => p.map((x, j) => (j === i ? emptyCondition(e.target.value) : x)))}
            >
              {Object.entries(CONDITION_TYPES).map(([v, d]) => (
                <option key={v} value={v}>{d.label}</option>
              ))}
            </select>
            <button className="btn btn-sm btn-danger" onClick={() => setConditions((p) => p.filter((_, j) => j !== i))}>
              Удалить
            </button>
          </div>
          {CONDITION_TYPES[String(c.type)]?.fields.map((f) => (
            <div className="field" key={f.key} style={{ marginBottom: 10 }}>
              <label>{f.label}</label>
              {f.type === "select" ? (
                <select
                  value={String(c[f.key] ?? "")}
                  onChange={(e) => updateCondition(i, { [f.key]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={String(c[f.key] ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => updateCondition(i, { [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="divider" />

      <div className="between">
        <h2 style={{ margin: 0 }}>Действия</h2>
        <button
          className="btn btn-sm"
          onClick={() => setActions((p) => [...p, emptyAction("announce_telegram")])}
        >
          + Действие
        </button>
      </div>
      {actions.map((a, i) => (
        <div key={i} className="card" style={{ marginTop: 14, background: "var(--bg-soft)" }}>
          <div className="between">
            <select
              value={String(a.type)}
              style={{ width: "auto" }}
              onChange={(e) => setActions((p) => p.map((x, j) => (j === i ? emptyAction(e.target.value) : x)))}
            >
              {Object.entries(ACTION_TYPES).map(([v, d]) => (
                <option key={v} value={v}>{d.label}</option>
              ))}
            </select>
            <button className="btn btn-sm btn-danger" onClick={() => setActions((p) => p.filter((_, j) => j !== i))}>
              Удалить
            </button>
          </div>
          {ACTION_TYPES[String(a.type)]?.fields.map((f) =>
            f.type === "textarea" ? (
              <div className="field" key={f.key} style={{ marginBottom: 10 }}>
                <label>{f.label}</label>
                <textarea
                  rows={2}
                  value={String(a[f.key] ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => updateAction(i, { [f.key]: e.target.value })}
                />
              </div>
            ) : (
              <div className="field" key={f.key} style={{ marginBottom: 10 }}>
                <label>{f.label}</label>
                <input
                  value={String(a[f.key] ?? "")}
                  placeholder={"placeholder" in f ? f.placeholder : undefined}
                  onChange={(e) => updateAction(i, { [f.key]: e.target.value })}
                />
              </div>
            )
          )}
        </div>
      ))}

      {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
      <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
        {saving ? "Сохраняем…" : "Сохранить правило"}
      </button>
    </div>
  );
}
