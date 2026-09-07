import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  token: required("TELEGRAM_BOT_TOKEN"),
  chatId: process.env.TELEGRAM_CHAT_ID || "",
  pollIntervalMs: Number(process.env.BRIDGE_POLL_INTERVAL_MS || 3000),
};
