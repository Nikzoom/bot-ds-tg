import { NextRequest, NextResponse } from "next/server";
import { checkPassword, sign, authCookieName, sessionTtlMs } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieName, sign("session"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionTtlMs / 1000,
  });
  return res;
}
