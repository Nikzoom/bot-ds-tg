import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function GET() {
  const config = await prisma.guildConfig.findFirst();
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, name, discordGuildId, telegramChatId, settings } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (discordGuildId !== undefined) data.discordGuildId = discordGuildId;
  if (telegramChatId !== undefined) data.telegramChatId = telegramChatId;
  if (settings !== undefined) data.settings = settings as object;

  let config;
  if (id) {
    config = await prisma.guildConfig.update({ where: { id }, data });
  } else {
    config = await prisma.guildConfig.create({
      data: { name: name ?? "Community", ...data },
    });
  }
  return NextResponse.json({ config });
}
