"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError("Неверный пароль");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: 34 }}>
        <div className="logo" style={{ justifyContent: "center", padding: "0 0 8px" }}>
          <div className="logo-mark">C</div>
        </div>
        <h1 style={{ textAlign: "center", fontSize: 22 }}>Community Control</h1>
        <p className="subtitle" style={{ textAlign: "center" }}>
          Вход в панель управления
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
            />
          </div>
          {error && (
            <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
          )}
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
