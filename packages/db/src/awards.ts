import { prisma } from "./client";
import { getLeaderboard, monthRange } from "./leaderboard";

export async function pushBridgeMessage(
  kind: "announce" | "dispute" | "award" | "stats" | "ping",
  payload: object
): Promise<void> {
  await prisma.bridgeMessage.create({ data: { kind, payload } });
}

export async function computeMonthlyAwards(key: string): Promise<string[]> {
  const { from, to } = monthRange(key);
  const leaders = await getLeaderboard(from, to, 3);

  const createdIds: string[] = [];
  const titles = ["🥇 Самое активное", "🥈 Второе место", "🥉 Третье место"];

  for (let i = 0; i < leaders.length; i++) {
    const entry = leaders[i];
    if (entry.score <= 0) continue;
    const award = await prisma.award.create({
      data: {
        month: key,
        category: "most_active",
        userId: entry.userId,
        title: titles[i] ?? `#${i + 1}`,
        description: `${entry.displayName} — ${Math.round(entry.voiceSeconds / 60)} минут в голосе, ${entry.messages} сообщений`,
        points: entry.score,
      },
    });
    createdIds.push(award.id);
  }

  if (leaders[0]) {
    await pushBridgeMessage("award", {
      awardId: createdIds[0] ?? "",
      title: titles[0] ?? "Самое активное",
      userName: leaders[0].displayName,
      points: leaders[0].score,
      month: key,
      category: "most_active",
      discordId: leaders[0].discordId,
    });
  }

  return createdIds;
}
