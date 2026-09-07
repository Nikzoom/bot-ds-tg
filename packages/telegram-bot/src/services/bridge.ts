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

async function deliver(
  bot: Bot,
  kind: string,
  payload: BridgePayload,
  messageId: string
): Promise<void> {
  const chatId = config.chatId;
  if (!chatId) {
    console.warn("TELEGRAM_CHAT_ID not set, skipping bridge delivery");
    return;
  }

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
      console.warn(`Unknown bridge kind: ${kind} (msg ${messageId})`);
  }
}
