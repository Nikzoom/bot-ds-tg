import { NextRequest, NextResponse } from "next/server";
import { computeMonthlyAwards } from "@dsbot/db";
import { monthKey } from "@dsbot/shared";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const key = String(body.month ?? monthKey());
  const ids = await computeMonthlyAwards(key);
  return NextResponse.json({ ok: true, awardIds: ids });
}
