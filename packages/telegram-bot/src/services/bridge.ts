import { InlineKeyboard } from "grammy";
import prisma from "@dsbot/db";
import {
  BridgePayload,
  BridgePayloadAnnounce,
  BridgePayloadAward,
  BridgePayloadDispute,
  BridgePayloadPing,
  monthLabelRu,
} from "@dsbot/shared";
import type { Bot } from "grammy";
import { config } from "../config";
import { getActiveChatIds } from "./chats";
import { getLinkedTelegramIds, resolveTelegramIdByDiscordKey } from "./links";

export async function startBridgePoller(bot: Bot): Promise<void> {
  const tick = async () => {
    try {
      const messages = await prisma.bridgeMessage.findMany({
        where: { processed: false },
        orderBy: { createdAt: "asc" },
        take: 20,
      });

      for (const msg of messages) {
        try {
          await deliver(bot, msg.kind, msg.payload as unknown as BridgePayload);
          await prisma.bridgeMessage.update({
            where: { id: msg.id },
            data: { processed: true, processedAt: new Date() },
          });
        } catch (err) {
          console.error(`Failed to deliver bridge message ${msg.id}:`, err);
        }
      }
    } catch (err) {
      console.error("Bridge poller error:", err);
    }
  };

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

async function safeSend(bot: Bot, chatId: string, text: string, extra?: object): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, text, extra as never);
  } catch (err) {
    // 403 = user hasn't started the bot yet; just log and skip
    console.error(`Cannot DM ${chatId}:`, (err as Error).message);
  }
}

async function deliver(bot: Bot, kind: string, payload: BridgePayload): Promise<void> {
  switch (kind) {
    case "ping": {
      // Pings go to the group
      const p = payload as BridgePayloadPing;
      const target = formatMention(p.telegramMention, p.discordName);
      const text =
        `🔔 ${target}, тебя пинганули в Discord!\n` +
        `📢 От: ${p.mentionerName}\n` +
        `📁 Канал: ${p.channelName}`;
      for (const chatId of groupChats()) {
        await safeSend(bot, chatId, text, { parse_mode: "Markdown" });
      }
      break;
    }

    case "announce": {
      // Announcements go to each linked user's DM
      const p = payload as BridgePayloadAnnounce;
      for (const chatId of await getLinkedTelegramIds()) {
        await safeSend(bot, chatId, `📣 ${p.content}`);
      }
      break;
    }

    case "award": {
      // Award goes to the winner's DM
      const p = payload as BridgePayloadAward;
      const telegramId = p.discordId ? await resolveTelegramIdByDiscordKey(p.discordId) : null;
      if (!telegramId) return;
      const text =
        `🏆 *Награда месяца* — ${monthLabelRu(p.month)}\n\n` +
        `${p.title}\n👤 ${p.userName}\n⭐ ${p.points.toFixed(1)} очков`;
      await safeSend(bot, telegramId, text, { parse_mode: "Markdown" });
      break;
    }

    case "dispute": {
      // Dispute goes to each linked user's DM with voting buttons
      const p = payload as BridgePayloadDispute;
      const keyboard = new InlineKeyboard();
      p.options.forEach((_, i) => {
        keyboard.text(`${i + 1}`, `dispute_vote:${p.disputeId}:${i}`);
      });
      const text =
        `⚖️ *Новый спор:* ${p.title}\n\n` +
        (p.description ? `${p.description}\n\n` : "") +
        p.options.map((o, i) => `${i + 1}. ${o}`).join("\n") +
        `\n\nГолосуй кнопками ниже 👇`;
      for (const chatId of await getLinkedTelegramIds()) {
        await safeSend(bot, chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
      }
      break;
    }

    default:
      console.warn(`Unknown bridge kind: ${kind}`);
  }
}

function groupChats(): string[] {
  const chats = getActiveChatIds();
  if (config.chatId && !chats.includes(config.chatId)) {
    chats.push(config.chatId);
  }
  return chats;
}

/** Build a Telegram mention string from the configured value. */
function formatMention(telegramMention: string | null, discordName: string): string {
  if (!telegramMention) return `@${discordName}`;
  return telegramMention.startsWith("@") ? telegramMention : `@${telegramMention}`;
}
