import { Message } from "discord.js";
import prisma from "@dsbot/db";
import { pushBridgeMessage } from "./bridge";

/** Cooldown per mentioned user (ms) to avoid ping spam. */
const COOLDOWN_MS = 60_000;
const lastPing = new Map<string, number>();

export async function resolveMention(discordId: string, username: string, displayName: string): Promise<string | null> {
  const maps = await prisma.mentionMap.findMany();
  const key = username.toLowerCase();
  const nick = (displayName || username).toLowerCase();
  const hit = maps.find(
    (m) =>
      m.discordKey.toLowerCase() === key ||
      m.discordKey.toLowerCase() === nick ||
      m.discordKey === discordId
  );
  return hit?.telegramMention ?? null;
}

/** Forward a ping to Telegram when the mentioned user is offline in Discord. */
export async function onPingBridge(message: Message): Promise<void> {
  if (!message.guild || !message.mentions?.members?.size) return;

  const channelName = ("name" in message.channel && message.channel.name) || "неизвестный канал";
  const mentionerName = message.author.displayName ?? message.author.username;

  for (const member of message.mentions.members.values()) {
    if (member.user.bot) continue;
    if (member.id === message.author.id) continue;
    if (member.presence?.status !== "offline") continue;

    const now = Date.now();
    const last = lastPing.get(member.id) ?? 0;
    if (now - last < COOLDOWN_MS) continue;
    lastPing.set(member.id, now);

    const telegramMention = await resolveMention(
      member.id,
      member.user.username,
      member.displayName ?? member.user.username
    );

    await pushBridgeMessage("ping", {
      discordName: member.displayName ?? member.user.username,
      channelName,
      mentionerName,
      telegramMention,
    });
  }
}
