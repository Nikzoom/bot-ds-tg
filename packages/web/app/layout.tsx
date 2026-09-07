import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Community Control",
  description: "Панель управления сообществом — Discord + Telegram",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
