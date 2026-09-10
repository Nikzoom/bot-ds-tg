import prisma from "@dsbot/db";

/** Add (or subtract) points for a Discord user and record it in the ledger. */
export async function addPointsByDiscordId(
  discordId: string,
  amount: number,
  reason: string
): Promise<void> {
  const user = await prisma.user.upsert({
    where: { discordId },
    create: { discordId, displayName: discordId },
    update: {},
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { points: { increment: amount } },
  });
  await prisma.pointLog.create({ data: { userId: user.id, amount, reason } });
}

export async function getPointsByDiscordId(discordId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { discordId } });
  return user?.points ?? 0;
}
