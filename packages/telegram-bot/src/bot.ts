import { Bot } from "grammy";
import prisma from "@dsbot/db";
import { monthRange } from "@dsbot/db";
import { config } from "./config";
import { startBridgePoller } from "./services/bridge";
import { upsertTelegramUser } from "./services/users";
import { activateChat, deactivateChat, isActive, loadActiveChats, registerChat } from "./services/chats";
import { captureUser, findDiscordUser, resolveLinkByUsername } from "./services/links";
import { formatDuration, monthKey, monthLabelRu } from "@dsbot/shared";

export const bot = new Bot(config.token);

function isPrivate(ctx: { chat?: { type?: string } }): boolean {
  return ctx.chat?.type === "private";
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------
bot.command("start", async (ctx) => {
  if (!isPrivate(ctx)) return;
  await ctx.reply(
    "👋 Привет! Я бот сообщества.\n\n" +
      "Команды (пиши сюда, в личку):\n" +
      "/stats — твоя статистика из Discord за месяц\n" +
      "/leaderboard — топ активных\n" +
      "/rules — активные правила\n\n" +
      "Уведомления о спорах и наградах тоже приходят сюда."
  );
});

// ---------------------------------------------------------------------------
// /stats — pulls data from the Discord database via the username link
// ---------------------------------------------------------------------------
bot.command("stats", async (ctx) => {
  if (!isPrivate(ctx)) return;
  const tgUser = ctx.from;
  if (!tgUser) return;

  const link = await resolveLinkByUsername(tgUser.username ?? "");
  if (!link) {
    await ctx.reply(
      "🔒 Ты не привязан. Попроси админа добавить в панели «Привязка аккаунтов» твой Discord ID → Telegram @username."
    );
    return;
  }

  const discordUser = await findDiscordUser(link.discordKey);
  if (!discordUser) {
    await ctx.reply("⚠️ Discord-аккаунт ещё не встречался в базе (не писал и не был в голосе).");
    return;
  }

  const { from, to } = monthRange(monthKey());
  const agg = await prisma.dailyStat.aggregate({
    where: { userId: discordUser.id, date: { gte: from, lt: to } },
    _sum: { voiceSeconds: true, messages: true, score: true },
  });

  const voice = agg._sum.voiceSeconds ?? 0;
  const messages = agg._sum.messages ?? 0;
  const score = agg._sum.score ?? 0;

  await ctx.reply(
    `📊 *${discordUser.displayName}* — ${monthLabelRu(monthKey())}\n\n` +
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
  if (!isPrivate(ctx)) return;

  try {
    const { from, to } = monthRange(monthKey());
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
  } catch (err) {
    console.error("leaderboard error:", err);
    await ctx.reply(`⚠️ Ошибка: ${(err as Error).message}`).catch(() => null);
  }
});

// ---------------------------------------------------------------------------
// /rules
// ---------------------------------------------------------------------------
bot.command("rules", async (ctx) => {
  if (!isPrivate(ctx)) return;
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
// Dispute voting callback (works in DM)
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
// Capture the user id/username on every message (for DM resolution)
// ---------------------------------------------------------------------------
bot.on("message", async (ctx) => {
  const u = ctx.from;
  if (!u) return;
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  await captureUser(String(u.id), u.username ?? null, name);
});

// ---------------------------------------------------------------------------
// Bot added / removed from a group
// ---------------------------------------------------------------------------
bot.on("my_chat_member", async (ctx) => {
  const update = ctx.update.my_chat_member;
  const chat = update.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") return;

  const chatId = String(chat.id);
  const newStatus = update.new_chat_member.status;
  const oldStatus = update.old_chat_member.status;

  if (newStatus === "left" || newStatus === "kicked") {
    await deactivateChat(chatId);
    return;
  }

  if (oldStatus === "left" || oldStatus === "kicked") {
    await registerChat(chatId, chat.title);
    // Инструкция уходит в ЛС тому, кто добавил бота
    await ctx.api.sendMessage(
      update.from.id,
      `🔐 Бот добавлен в группу «${chat.title}»!\n\n` +
        "Для активации напиши пароль доступа (TELEGRAM_JOIN_PASSWORD) прямо в эту группу."
    );
  }
});

// ---------------------------------------------------------------------------
// Group password activation (bot never writes to the group)
// ---------------------------------------------------------------------------
bot.on("message:text", async (ctx) => {
  const chat = ctx.chat;
  const chatType = chat?.type;
  const isGroup = chatType === "group" || chatType === "supergroup";
  if (!isGroup) return;

  const chatId = String(chat.id);
  const text = ctx.message.text.trim();

  if (!isActive(chatId)) {
    if (text === config.joinPassword) {
      await activateChat(chatId);
      await ctx.api.sendMessage(
        ctx.from.id,
        "✅ Группа активирована! Пинги из Discord будут приходить сюда."
      );
    }
  }
});

export async function start(): Promise<void> {
  bot.catch((err) => {
    console.error("⚠️ TG bot error:", err.error ?? err);
  });
  await loadActiveChats();
  await startBridgePoller(bot);
  console.log("✅ Telegram bot started (polling)...");
  await bot.start();
}
