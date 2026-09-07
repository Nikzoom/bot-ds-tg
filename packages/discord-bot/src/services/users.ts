import prisma, { User } from "@dsbot/db";

export async function upsertDiscordUser(
  discordId: string,
  displayName: string,
  avatarUrl?: string
): Promise<User> {
  return prisma.user.upsert({
    where: { discordId },
    create: { discordId, displayName, avatarUrl },
    update: { displayName, avatarUrl },
  });
}

export async function findUserByDiscordId(discordId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { discordId } });
}
