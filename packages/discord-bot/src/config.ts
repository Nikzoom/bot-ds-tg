import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  guildId: process.env.DISCORD_GUILD_ID || "",
  rulesEvalIntervalMs: Number(process.env.RULES_EVAL_INTERVAL_MS || 30000),
  panelApiSecret: process.env.PANEL_API_SECRET || "change-me",
};
