import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function GET() {
  const rules = await prisma.rule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    description,
    enabled = true,
    trigger,
    conditions,
    actions,
    priority = 0,
    cooldownSeconds = null,
    fireOnce = false,
  } = body;

  if (!name || !trigger || !Array.isArray(conditions) || !Array.isArray(actions)) {
    return NextResponse.json({ error: "Неполные данные правила" }, { status: 400 });
  }

  const rule = await prisma.rule.create({
    data: {
      name,
      description: description ?? null,
      enabled,
      trigger,
      conditions: conditions as object,
      actions: actions as object,
      priority,
      cooldownSeconds: cooldownSeconds ? Number(cooldownSeconds) : null,
      fireOnce: Boolean(fireOnce),
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
