import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.PANEL_API_SECRET || process.env.PANEL_PASSWORD || "change-me";
const COOKIE_NAME = "dsbot_auth";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sign(value: string): string {
  const hmac = createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${hmac}`;
}

export function verify(cookie: string | undefined): boolean {
  if (!cookie) return false;
  const [value, sig] = cookie.split(".");
  if (!value || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(value).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.PANEL_PASSWORD || "admin";
  return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
}

export const authCookieName = COOKIE_NAME;
export const sessionTtlMs = SESSION_TTL_MS;
