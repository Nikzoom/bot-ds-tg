import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { name, description, enabled, trigger, conditions, actions, priority, cooldownSeconds, fireOnce, resetFired } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (enabled !== undefined) data.enabled = enabled;
  if (trigger !== undefined) data.trigger = trigger;
  if (conditions !== undefined) data.conditions = conditions as object;
  if (actions !== undefined) data.actions = actions as object;
  if (priority !== undefined) data.priority = priority;
  if (cooldownSeconds !== undefined) data.cooldownSeconds = cooldownSeconds ? Number(cooldownSeconds) : null;
  if (fireOnce !== undefined) data.fireOnce = Boolean(fireOnce);
  if (resetFired) data.lastFiredAt = null;

  const rule = await prisma.rule.update({ where: { id: params.id }, data });
  return NextResponse.json({ rule });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.rule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
