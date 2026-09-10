import { Client } from "discord.js";
import cron from "node-cron";
import { registerCommands } from "../commands";
import { computeMonthlyAwards } from "../services/awards";
import { RulesEngine } from "../services/rulesEngine";
import { config } from "../config";
import { monthKey } from "@dsbot/shared";
import { upsertDiscordUser } from "../services/users";
import { startVoiceSession, closeOrphanSessions } from "../services/stats";

export async function onReady(client: Client, engine: RulesEngine): Promise<void> {
  console.log(`✅ Discord bot logged in as ${client.user?.tag}`);

  await registerCommands(client);

  const closed = await closeOrphanSessions();
  if (closed > 0) console.log(`♻️ Закрыл незавершённых голосовых сессий: ${closed}`);

  await logGuilds(client);
  await backfillVoiceSessions(client);

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

async function logGuilds(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    console.log(
      `📡 Сервер: "${guild.name}" (${guild.id}) — участников: ${guild.memberCount}, ` +
        `каналов в кэше: ${guild.channels.cache.size}, в голосе сейчас: ${guild.voiceStates.cache.size}`
    );
  }
}

/** Count members who were already sitting in voice when the bot started. */
async function backfillVoiceSessions(client: Client): Promise<void> {
  let count = 0;
  for (const guild of client.guilds.cache.values()) {
    for (const vs of guild.voiceStates.cache.values()) {
      if (!vs.channelId || vs.member?.user.bot) continue;
      const member = vs.member;
      if (!member) continue;
      const dbUser = await upsertDiscordUser(
        member.id,
        member.displayName,
        member.user.displayAvatarURL()
      );
      await startVoiceSession(
        dbUser.id,
        guild.id,
        vs.channelId,
        vs.channel?.name ?? undefined
      );
      count++;
    }
  }
  if (count > 0) console.log(`🎙️ Подхватил уже сидящих в голосе: ${count}`);
}
