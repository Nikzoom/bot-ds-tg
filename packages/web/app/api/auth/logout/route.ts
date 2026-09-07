import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

export async function GET() {
  const res = NextResponse.redirect(new URL("/login", process.env.WEB_BASE_URL || "http://localhost:3000"));
  res.cookies.set(authCookieName, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
