"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RunAwards() {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    if (!confirm("Посчитать награды за текущий месяц?")) return;
    setRunning(true);
    await fetch("/api/awards/run", { method: "POST" });
    setRunning(false);
    router.refresh();
  }

  return (
    <button className="btn btn-primary" onClick={run} disabled={running}>
      {running ? "Считаем…" : "★ Посчитать награды месяца"}
    </button>
  );
}
