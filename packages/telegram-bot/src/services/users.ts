import prisma, { User } from "@dsbot/db";

export async function upsertTelegramUser(
  telegramId: string,
  displayName: string
): Promise<User> {
  return prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, displayName },
    update: { displayName },
  });
}
