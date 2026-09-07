import { Bot, InlineKeyboard } from "grammy";
import prisma, { computeScore } from "@dsbot/db";
import { config } from "./config";
import { startBridgePoller } from "./services/bridge";
import { upsertTelegramUser } from "./services/users";
import { formatDuration, monthKey, monthLabelRu } from "@dsbot/shared";

export const bot = new Bot(config.token);

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------
bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Привет! Я бот сообщества.\n\n" +
      "Команды:\n" +
      "/stats — твоя статистика за месяц\n" +
      "/leaderboard — топ активных\n" +
      "/rules — активные правила\n\n" +
      "Споры, награды и анонсы из Discord приходят прямо сюда."
  );
});

// ---------------------------------------------------------------------------
// /stats
// ---------------------------------------------------------------------------
bot.command("stats", async (ctx) => {
  const tgUser = ctx.from;
  if (!tgUser) return;
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
  const user = await upsertTelegramUser(String(tgUser.id), name);

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const agg = await prisma.dailyStat.aggregate({
    where: { userId: user.id, date: { gte: from, lt: to } },
    _sum: { voiceSeconds: true, messages: true, score: true },
  });

  const voice = agg._sum.voiceSeconds ?? 0;
  const messages = agg._sum.messages ?? 0;
  const score = agg._sum.score ?? 0;

  await ctx.reply(
    `📊 *${name}* — ${monthLabelRu(monthKey())}\n\n` +
      `🎙️ В голосе: ${formatDuration(voice)}\n` +
      `💬 Сообщений: ${messages}\n` +
      `⭐ Очков: ${score.toFixed(1)}`,
    { parse_mode: "Markdown" }
  );
});

// ---------------------------------------------------------------------------
// /leaderboard
// ---------------------------------------------------------------------------
bot.command("leaderboard", async (ctx) => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rows = await prisma.dailyStat.groupBy({
    by: ["userId"],
    where: { date: { gte: from, lt: to } },
    _sum: { score: true, voiceSeconds: true, messages: true },
    orderBy: { _sum: { score: "desc" } },
    take: 10,
  });

  if (rows.length === 0) {
    await ctx.reply("Пока нет данных за этот месяц.");
    return;
  }

  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } });
  const map = new Map(users.map((u) => [u.id, u]));
  const medals = ["🥇", "🥈", "🥉"];

  const lines = rows
    .map((r, i) => {
      const u = map.get(r.userId);
      const medal = medals[i] ?? `${i + 1}.`;
      return `${medal} ${u?.displayName ?? "?"} — ${(r._sum.score ?? 0).toFixed(1)} очков`;
    })
    .join("\n");

  await ctx.reply(`🏆 *Топ активных — ${monthLabelRu(monthKey())}*\n\n${lines}`, {
    parse_mode: "Markdown",
  });
});

// ---------------------------------------------------------------------------
// /rules
// ---------------------------------------------------------------------------
bot.command("rules", async (ctx) => {
  const rules = await prisma.rule.findMany({ where: { enabled: true } });
  if (rules.length === 0) {
    await ctx.reply("Активных правил нет.");
    return;
  }
  await ctx.reply(
    `📜 *Правила*\n\n` + rules.map((r) => `• ${r.name}`).join("\n"),
    { parse_mode: "Markdown" }
  );
});

// ---------------------------------------------------------------------------
// Dispute voting callback
// ---------------------------------------------------------------------------
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("dispute_vote:")) return;

  const [, disputeId, optionIndexStr] = data.split(":");
  const optionIndex = Number(optionIndexStr);
  const tgUser = ctx.callbackQuery.from;
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
  const user = await upsertTelegramUser(String(tgUser.id), name);

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute || dispute.status !== "open") {
    await ctx.answerCallbackQuery({ text: "Спор закрыт.", show_alert: true });
    return;
  }

  await prisma.disputeVote.upsert({
    where: { disputeId_userId: { disputeId, userId: user.id } },
    create: { disputeId, userId: user.id, optionIndex },
    update: { optionIndex },
  });

  await ctx.answerCallbackQuery({ text: `✅ Голос принят: вариант #${optionIndex + 1}` });
});

// ---------------------------------------------------------------------------
// Message activity tracking (group chat)
// ---------------------------------------------------------------------------
bot.on("message:text", async (ctx) => {
  const tgUser = ctx.from;
  if (!tgUser) return;
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
  const user = await upsertTelegramUser(String(tgUser.id), name);

  const day = new Date();
  const utcDay = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const existing = await prisma.dailyStat.findUnique({
    where: { userId_date: { userId: user.id, date: utcDay } },
  });
  const messages = (existing?.messages ?? 0) + 1;
  const score = await computeScore({
    voiceSeconds: existing?.voiceSeconds ?? 0,
    messages,
  });
  await prisma.dailyStat.upsert({
    where: { userId_date: { userId: user.id, date: utcDay } },
    create: { userId: user.id, date: utcDay, messages, score },
    update: { messages, score },
  });
});

export async function start(): Promise<void> {
  await startBridgePoller(bot);
  console.log("✅ Telegram bot started (polling)...");
  await bot.start();
}
