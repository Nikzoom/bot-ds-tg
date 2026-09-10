"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Дашборд", icon: "◈" },
  { href: "/rules", label: "Правила", icon: "⚙" },
  { href: "/disputes", label: "Споры", icon: "⚖" },
  { href: "/mentions", label: "Привязка аккаунтов", icon: "🔔" },
  { href: "/leaderboard", label: "Топ активности", icon: "▥" },
  { href: "/awards", label: "Награды", icon: "★" },
  { href: "/settings", label: "Настройки", icon: "☰" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-mark">C</div>
        <div>Community Control</div>
      </div>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item ${pathname === item.href ? "active" : ""}`}
        >
          <span className="icon">{item.icon}</span>
          {item.label}
        </Link>
      ))}
      <div style={{ marginTop: "auto", paddingTop: 20 }}>
        <a className="nav-item" href="/api/auth/logout">
          <span className="icon">⏻</span> Выйти
        </a>
      </div>
    </aside>
  );
}
