import prisma, { Dispute } from "@dsbot/db";
import { pushBridgeMessage } from "./bridge";

export async function createDispute(
  title: string,
  description: string | null,
  options: string[],
  createdBy: string,
  endsInMinutes = 60
): Promise<Dispute> {
  const dispute = await prisma.dispute.create({
    data: {
      title,
      description,
      options,
      createdBy,
      endsAt: new Date(Date.now() + endsInMinutes * 60_000),
    },
  });

  await pushBridgeMessage("dispute", {
    disputeId: dispute.id,
    title: dispute.title,
    description: dispute.description ?? undefined,
    options: options,
  });

  return dispute;
}

export async function vote(disputeId: string, userId: string, optionIndex: number): Promise<Dispute> {
  await prisma.disputeVote.upsert({
    where: { disputeId_userId: { disputeId, userId } },
    create: { disputeId, userId, optionIndex },
    update: { optionIndex },
  });
  return prisma.dispute.findUniqueOrThrow({ where: { id: disputeId }, include: { votes: true } });
}

export async function settleDispute(disputeId: string): Promise<Dispute | null> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { votes: true },
  });
  if (!dispute || dispute.status !== "open") return null;

  const counts = new Array<number>((dispute.options as string[]).length).fill(0);
  for (const v of dispute.votes) counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
  const winner = counts.indexOf(Math.max(...counts));

  return prisma.dispute.update({
    where: { id: disputeId },
    data: { status: "settled", winnerOptionIndex: winner, closedAt: new Date() },
  });
}

export function formatDisputeResults(
  dispute: Dispute & { votes: { optionIndex: number }[] }
): string {
  const options = dispute.options as string[];
  const counts = new Array<number>(options.length).fill(0);
  for (const v of dispute.votes) counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
  const total = counts.reduce((a, b) => a + b, 0);

  return options
    .map((opt, i) => {
      const pct = total === 0 ? 0 : Math.round((counts[i] / total) * 100);
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      const winner = dispute.winnerOptionIndex === i ? " 🏆" : "";
      return `${opt}: ${counts[i]} голосов (${pct}%)\n${bar}${winner}`;
    })
    .join("\n");
}
