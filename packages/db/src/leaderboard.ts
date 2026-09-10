import { prisma } from "./client";

export interface LeaderboardEntry {
  userId: string;
  discordId: string | null;
  displayName: string;
  avatarUrl: string | null;
  voiceSeconds: number;
  messages: number;
  games: Record<string, number>;
  score: number;
}

let weightsCache: { voice: number; message: number; at: number } | null = null;

/** Score weights from GuildConfig, cached for 60s to avoid DB hits per message. */
export async function getScoreWeights(): Promise<{ voice: number; message: number }> {
  const now = Date.now();
  if (weightsCache && now - weightsCache.at < 60_000) {
    return { voice: weightsCache.voice, message: weightsCache.message };
  }
  const cfg = await prisma.guildConfig.findFirst();
  const s = (cfg?.settings ?? {}) as { scoreVoicePerMinute?: number; scoreMessage?: number };
  const w = {
    voice: Number(s.scoreVoicePerMinute ?? 1),
    message: Number(s.scoreMessage ?? 0.2),
  };
  weightsCache = { ...w, at: now };
  return w;
}

export async function computeScore(input: {
  voiceSeconds: number;
  messages: number;
}): Promise<number> {
  const w = await getScoreWeights();
  return (input.voiceSeconds / 60) * w.voice + input.messages * w.message;
}

export function monthRange(key: string): { from: Date; to: Date } {
  const [year, month] = key.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

export async function getLeaderboard(
  from: Date,
  to: Date,
  limit = 10
): Promise<LeaderboardEntry[]> {
  const rows = await prisma.dailyStat.groupBy({
    by: ["userId"],
    where: { date: { gte: from, lt: to } },
    _sum: { voiceSeconds: true, messages: true, score: true },
    orderBy: { _sum: { score: "desc" } },
    take: limit,
  });

  const userIds = rows.map((r) => r.userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    const u = userMap.get(row.userId);
    if (!u) continue;
    const games = await aggregateGames(row.userId, from, to);
    entries.push({
      userId: row.userId,
      discordId: u.discordId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      voiceSeconds: row._sum.voiceSeconds ?? 0,
      messages: row._sum.messages ?? 0,
      games,
      score: row._sum.score ?? 0,
    });
  }
  return entries;
}

async function aggregateGames(
  userId: string,
  from: Date,
  to: Date
): Promise<Record<string, number>> {
  const stats = await prisma.dailyStat.findMany({
    where: { userId, date: { gte: from, lt: to } },
    select: { games: true },
  });
  const result: Record<string, number> = {};
  for (const s of stats) {
    const games = (s.games as Record<string, number>) ?? {};
    for (const [g, secs] of Object.entries(games)) {
      result[g] = (result[g] ?? 0) + secs;
    }
  }
  return result;
}
