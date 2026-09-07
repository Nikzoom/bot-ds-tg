import prisma, { VoiceSession, computeScore } from "@dsbot/db";

/** In-memory map of currently active voice sessions keyed by userId. */
const activeSessions = new Map<string, VoiceSession>();

export async function startVoiceSession(
  userId: string,
  guildId: string,
  channelId: string,
  channelName?: string
): Promise<void> {
  if (activeSessions.has(userId)) return;
  const session = await prisma.voiceSession.create({
    data: { userId, guildId, channelId, channelName, joinedAt: new Date() },
  });
  activeSessions.set(userId, session);
}

export async function endVoiceSession(userId: string): Promise<void> {
  const session = activeSessions.get(userId);
  if (!session) return;
  activeSessions.delete(userId);
  const leftAt = new Date();
  const durationSeconds = Math.max(
    1,
    Math.round((leftAt.getTime() - session.joinedAt.getTime()) / 1000)
  );
  await prisma.voiceSession.update({
    where: { id: session.id },
    data: { leftAt, durationSeconds },
  });
  await addToDailyStat(userId, session.joinedAt, {
    voiceSeconds: durationSeconds,
    games: session.gameTag ? { [session.gameTag]: durationSeconds } : {},
  });
}

export async function setSessionGameTag(userId: string, gameTag: string): Promise<void> {
  const session = activeSessions.get(userId);
  if (!session) return;
  await prisma.voiceSession.update({
    where: { id: session.id },
    data: { gameTag },
  });
}

export function getActiveSession(userId: string): VoiceSession | undefined {
  return activeSessions.get(userId);
}

export async function recordMessage(
  userId: string,
  guildId: string,
  channelId: string
): Promise<void> {
  await prisma.messageEvent.create({ data: { userId, guildId, channelId } });
  await addToDailyStat(userId, new Date(), { messages: 1 });
}

interface DailyIncrement {
  voiceSeconds?: number;
  messages?: number;
  games?: Record<string, number>;
}

export async function addToDailyStat(
  userId: string,
  date: Date,
  inc: DailyIncrement
): Promise<void> {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const existing = await prisma.dailyStat.findUnique({
    where: { userId_date: { userId, date: day } },
  });

  const games = (existing?.games as Record<string, number>) ?? {};
  if (inc.games) {
    for (const [game, secs] of Object.entries(inc.games)) {
      games[game] = (games[game] ?? 0) + secs;
    }
  }

  const voiceSeconds = (existing?.voiceSeconds ?? 0) + (inc.voiceSeconds ?? 0);
  const messages = (existing?.messages ?? 0) + (inc.messages ?? 0);
  const score = await computeScore({ voiceSeconds, messages });

  await prisma.dailyStat.upsert({
    where: { userId_date: { userId, date: day } },
    create: { userId, date: day, voiceSeconds, messages, games, score },
    update: { voiceSeconds, messages, games, score },
  });
}
