import prisma from "@dsbot/db";

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/^@/, "");
}

/** Upsert the TG user and auto-fill the numeric id on any matching MentionMap (by @username). */
export async function captureUser(
  telegramId: string,
  username: string | null,
  displayName: string
): Promise<void> {
  await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, displayName },
    update: { displayName },
  });

  if (!username) return;
  const key = normalizeUsername(username);
  const maps = await prisma.mentionMap.findMany();
  for (const m of maps) {
    if (normalizeUsername(m.telegramMention) === key && m.telegramId !== telegramId) {
      await prisma.mentionMap.update({ where: { id: m.id }, data: { telegramId } });
    }
  }
}

/** Find the MentionMap whose telegramMention matches a Telegram username. */
export async function resolveLinkByUsername(username: string) {
  const key = normalizeUsername(username);
  if (!key) return null;
  const maps = await prisma.mentionMap.findMany();
  return maps.find((m) => normalizeUsername(m.telegramMention) === key) ?? null;
}

/** Resolve a discord key (id or display name) to the linked Discord User. */
export async function findDiscordUser(discordKey: string) {
  return (
    (await prisma.user.findUnique({ where: { discordId: discordKey } })) ??
    (await prisma.user.findFirst({
      where: { displayName: { equals: discordKey, mode: "insensitive" } },
    }))
  );
}

/** Discord key -> numeric telegram id (for DMs). */
export async function resolveTelegramIdByDiscordKey(discordKey: string): Promise<string | null> {
  const m = await prisma.mentionMap.findUnique({ where: { discordKey } });
  return m?.telegramId ?? null;
}

/** All linked users who have /start'ed the bot (numeric telegram ids). */
export async function getLinkedTelegramIds(): Promise<string[]> {
  const maps = await prisma.mentionMap.findMany({ where: { telegramId: { not: null } } });
  return maps.map((m) => m.telegramId as string);
}
