"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisputeCreate() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        options: options.split(",").map((s) => s.trim()).filter(Boolean),
        endsInMinutes: Number(minutes),
      }),
    });
    setSaving(false);
    setTitle("");
    setOptions("");
    router.refresh();
  }

  return (
    <div className="card">
      <h2>⚖️ Новый спор</h2>
      <div className="field">
        <label>Тема</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Кто MVP месяца?" />
      </div>
      <div className="field">
        <label>Варианты (через запятую)</label>
        <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Игрок А, Игрок Б, Игрок В" />
      </div>
      <div className="field">
        <label>Длительность (минут)</label>
        <input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" />
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim() || !options.trim()}>
        {saving ? "Создаём…" : "Создать спор"}
      </button>
    </div>
  );
}
