import prisma from "@dsbot/db";

/** In-memory set of activated group chat ids (string). */
const activeChats = new Set<string>();

export async function loadActiveChats(): Promise<void> {
  const chats = await prisma.telegramChat.findMany({ where: { active: true } });
  for (const c of chats) activeChats.add(c.chatId);
}

export function isActive(chatId: string | number): boolean {
  return activeChats.has(String(chatId));
}

export function getActiveChatIds(): string[] {
  return [...activeChats];
}

export async function registerChat(chatId: string, title?: string): Promise<void> {
  await prisma.telegramChat.upsert({
    where: { chatId },
    create: { chatId, title, active: false },
    update: { title },
  });
}

export async function activateChat(chatId: string): Promise<void> {
  activeChats.add(chatId);
  await prisma.telegramChat.update({
    where: { chatId },
    data: { active: true, activatedAt: new Date() },
  });
}

export async function deactivateChat(chatId: string): Promise<void> {
  activeChats.delete(chatId);
  await prisma.telegramChat.updateMany({
    where: { chatId },
    data: { active: false },
  });
}

export async function isChatRegistered(chatId: string): Promise<boolean> {
  const c = await prisma.telegramChat.findUnique({ where: { chatId } });
  return !!c;
}
