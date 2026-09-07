import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  token: required("TELEGRAM_BOT_TOKEN"),
  // Optional: a hardcoded chat id as a fallback delivery target.
  chatId: process.env.TELEGRAM_CHAT_ID || "",
  // Password required to activate the bot in a group.
  joinPassword: process.env.TELEGRAM_JOIN_PASSWORD || process.env.PANEL_PASSWORD || "admin",
  pollIntervalMs: Number(process.env.BRIDGE_POLL_INTERVAL_MS || 3000),
};
