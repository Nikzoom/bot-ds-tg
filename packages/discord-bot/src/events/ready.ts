import { Client } from "discord.js";
import cron from "node-cron";
import { registerCommands } from "../commands";
import { computeMonthlyAwards } from "../services/awards";
import { RulesEngine } from "../services/rulesEngine";
import { config } from "../config";
import { monthKey } from "@dsbot/shared";

export async function onReady(client: Client, engine: RulesEngine): Promise<void> {
  console.log(`✅ Discord bot logged in as ${client.user?.tag}`);

  await registerCommands(client);

  // Periodically re-evaluate voice rules (e.g. "3 people in VC => Valorant")
  setInterval(() => engine.evaluateVoiceRules().catch(console.error), config.rulesEvalIntervalMs);

  // Monthly awards: run on the last day of the month at 23:00
  cron.schedule("0 23 28-31 * *", async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (tomorrow.getMonth() === now.getMonth()) return; // only on the actual last day
    console.log("🏆 Computing monthly awards...");
    await computeMonthlyAwards(monthKey()).catch(console.error);
  });
}
