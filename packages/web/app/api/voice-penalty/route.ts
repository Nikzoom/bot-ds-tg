import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";
import { authCookieName, verify } from "@/lib/auth";

const snowflake = /^\d{17,20}$/;

export async function POST(req: NextRequest) {
  if (!verify(req.cookies.get(authCookieName)?.value)) {
    return NextResponse.json({ error: "Требуется вход в панель" }, { status: 401 });
  }
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !snowflake.test(guildId)) {
    return NextResponse.json({ error: "Укажи DISCORD_GUILD_ID в .env на сервере" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат данных" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Неверный формат данных" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.enabled !== "boolean" || typeof input.firstRoleId !== "string" || typeof input.secondRoleId !== "string" ||
      typeof input.destinationChannelId !== "string" || typeof input.waitMinutes !== "number" ||
      typeof input.repeatExtraMinutes !== "number" || typeof input.suspendMinutes !== "number") {
    return NextResponse.json({ error: "Неверные настройки правила" }, { status: 400 });
  }
  const firstRoleId = input.firstRoleId.trim();
  const secondRoleId = input.secondRoleId.trim();
  const destinationChannelId = input.destinationChannelId.trim();
  if ((firstRoleId && !snowflake.test(firstRoleId)) || (secondRoleId && !snowflake.test(secondRoleId))) {
    return NextResponse.json({ error: "ID роли должен состоять из 17–20 цифр" }, { status: 400 });
  }
  if (input.enabled && (!firstRoleId || !secondRoleId || firstRoleId === secondRoleId)) {
    return NextResponse.json({ error: "Укажи два разных ID ролей" }, { status: 400 });
  }
  if (!Number.isInteger(input.waitMinutes) || input.waitMinutes < 1 || input.waitMinutes > 10080 ||
      !Number.isInteger(input.repeatExtraMinutes) || input.repeatExtraMinutes < 1 || input.repeatExtraMinutes > 10080 ||
      !Number.isInteger(input.suspendMinutes) || input.suspendMinutes < 1 || input.suspendMinutes > 10080) {
    return NextResponse.json({ error: "Время должно быть целым числом от 1 до 10080 минут" }, { status: 400 });
  }
  if ((destinationChannelId && !snowflake.test(destinationChannelId)) || (input.enabled && !destinationChannelId)) {
    return NextResponse.json({ error: "Укажи ID голосового канала из 17–20 цифр" }, { status: 400 });
  }

  const previous = await prisma.voicePenaltyConfig.findUnique({ where: { guildId } });
  const changed = !previous || previous.enabled !== input.enabled ||
    previous.firstRoleId !== (firstRoleId || null) || previous.secondRoleId !== (secondRoleId || null) ||
    previous.waitMinutes !== input.waitMinutes || previous.repeatExtraMinutes !== input.repeatExtraMinutes ||
    previous.suspendMinutes !== input.suspendMinutes ||
    previous.destinationChannelId !== (destinationChannelId || null);
  const data = { enabled: input.enabled, firstRoleId: firstRoleId || null, secondRoleId: secondRoleId || null,
    waitMinutes: input.waitMinutes, repeatExtraMinutes: input.repeatExtraMinutes,
    suspendMinutes: input.suspendMinutes, destinationChannelId: destinationChannelId || null };
  await prisma.$transaction([
    prisma.voicePenaltyConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    }),
    ...(changed ? [prisma.voicePairWindow.updateMany({ where: { guildId, active: true }, data: { active: false } })] : []),
  ]);
  return NextResponse.json({ ok: true });
}
