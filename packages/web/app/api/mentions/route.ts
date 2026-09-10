import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function GET() {
  const mentions = await prisma.mentionMap.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ mentions });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { discordKey, telegramMention } = body;

  if (!discordKey || !telegramMention) {
    return NextResponse.json({ error: "Заполни оба поля" }, { status: 400 });
  }

  const mention = await prisma.mentionMap.create({
    data: { discordKey: discordKey.trim(), telegramMention: telegramMention.trim() },
  });

  return NextResponse.json({ mention }, { status: 201 });
}
