import { InlineKeyboard } from "grammy";
import prisma from "@dsbot/db";
import {
  BridgePayload,
  BridgePayloadAnnounce,
  BridgePayloadAward,
  BridgePayloadDispute,
  monthLabelRu,
} from "@dsbot/shared";
import type { Bot } from "grammy";
import { config } from "../config";
import { getActiveChatIds } from "./chats";

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
          await deliver(bot, msg.kind, msg.payload as unknown as BridgePayload, msg.id);
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

/** Resolve the list of target chats (activated groups + optional env fallback). */
function targetChats(): string[] {
  const chats = getActiveChatIds();
  if (config.chatId && !chats.includes(config.chatId)) {
    chats.push(config.chatId);
  }
  return chats;
}

async function deliver(
  bot: Bot,
  kind: string,
  payload: BridgePayload,
  messageId: string
): Promise<void> {
  const chatIds = targetChats();
  if (chatIds.length === 0) {
    console.warn("No active Telegram chats to deliver to. Add the bot to a group and enter the join password.");
    return;
  }

  for (const chatId of chatIds) {
    try {
      await deliverToChat(bot, chatId, kind, payload);
    } catch (err) {
      console.error(`Failed to deliver to chat ${chatId}:`, err);
    }
  }
}

async function deliverToChat(
  bot: Bot,
  chatId: string,
  kind: string,
  payload: BridgePayload
): Promise<void> {
  switch (kind) {
    case "announce": {
      const p = payload as BridgePayloadAnnounce;
      await bot.api.sendMessage(chatId, `📣 ${p.content}`);
      break;
    }

    case "award": {
      const p = payload as BridgePayloadAward;
      await bot.api.sendMessage(
        chatId,
        `🏆 *Награда месяца* — ${monthLabelRu(p.month)}\n\n` +
          `${p.title}\n👤 ${p.userName}\n⭐ ${p.points.toFixed(1)} очков`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "dispute": {
      const p = payload as BridgePayloadDispute;
      const keyboard = new InlineKeyboard();
      p.options.forEach((_, i) => {
        keyboard.text(`${i + 1}`, `dispute_vote:${p.disputeId}:${i}`);
      });
      const sent = await bot.api.sendMessage(
        chatId,
        `⚖️ *Новый спор:* ${p.title}\n\n` +
          (p.description ? `${p.description}\n\n` : "") +
          p.options.map((o, i) => `${i + 1}. ${o}`).join("\n") +
          `\n\nГолосуй кнопками ниже 👇`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
      await prisma.dispute.update({
        where: { id: p.disputeId },
        data: { telegramMessageId: String(sent.message_id) },
      });
      break;
    }

    default:
      console.warn(`Unknown bridge kind: ${kind}`);
  }
}
