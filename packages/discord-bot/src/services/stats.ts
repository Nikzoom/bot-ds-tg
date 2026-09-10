import prisma, { VoiceSession, computeScore } from "@dsbot/db";

/** In-memory map of currently active voice sessions keyed by userId. */
const activeSessions = new Map<string, VoiceSession>();

/**
 * Close sessions that were left open by a previous crash/restart so time
 * doesn't get double-counted when we backfill on the next start.
 */
export async function closeOrphanSessions(): Promise<number> {
  const orphans = await prisma.voiceSession.findMany({ where: { leftAt: null } });
  const now = new Date();
  for (const s of orphans) {
    const durationSeconds = Math.max(1, Math.round((now.getTime() - s.joinedAt.getTime()) / 1000));
    await prisma.voiceSession.update({
      where: { id: s.id },
      data: { leftAt: now, durationSeconds },
    });
    await addToDailyStat(s.userId, s.joinedAt, {
      voiceSeconds: durationSeconds,
      games: gameDurationMap(s.gameTag, s.gameTagStartedAt, s.joinedAt, now),
    });
  }
  return orphans.length;
}

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
    games: gameDurationMap(session.gameTag, session.gameTagStartedAt, session.joinedAt, leftAt),
  });
}

export async function setSessionGameTag(userId: string, gameTag: string): Promise<void> {
  const session = activeSessions.get(userId);
  if (!session) return;
  // Idempotent: only (re)start the timer when the tag actually changes
  if (session.gameTag === gameTag) return;
  const now = new Date();
  await prisma.voiceSession.update({
    where: { id: session.id },
    data: { gameTag, gameTagStartedAt: now },
  });
  session.gameTag = gameTag;
  session.gameTagStartedAt = now;
}

/**
 * Build the games map for a finished session: game time counts only from the
 * moment the tag was assigned (gameTagStartedAt), not the whole session.
 */
function gameDurationMap(
  gameTag: string | null | undefined,
  gameTagStartedAt: Date | null | undefined,
  joinedAt: Date,
  endAt: Date
): Record<string, number> {
  if (!gameTag) return {};
  const start = gameTagStartedAt ?? joinedAt;
  const seconds = Math.max(1, Math.round((endAt.getTime() - start.getTime()) / 1000));
  return { [gameTag]: seconds };
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
