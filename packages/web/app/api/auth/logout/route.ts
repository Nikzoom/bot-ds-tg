import { NextRequest, NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set(authCookieName, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
