import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: params.id },
    include: { votes: true },
  });
  if (!dispute) return NextResponse.json({ error: "Не найден" }, { status: 404 });

  const options = dispute.options as string[];
  const counts = new Array<number>(options.length).fill(0);
  for (const v of dispute.votes) counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
  const winner = counts.indexOf(Math.max(...counts));

  const updated = await prisma.dispute.update({
    where: { id: params.id },
    data: { status: "settled", winnerOptionIndex: winner, closedAt: new Date() },
  });

  return NextResponse.json({ dispute: updated });
}
