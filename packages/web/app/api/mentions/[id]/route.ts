import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { discordKey, telegramMention } = body;
  const data: Record<string, unknown> = {};
  if (discordKey !== undefined) data.discordKey = discordKey.trim();
  if (telegramMention !== undefined) data.telegramMention = telegramMention.trim();
  const mention = await prisma.mentionMap.update({ where: { id: params.id }, data });
  return NextResponse.json({ mention });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.mentionMap.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
