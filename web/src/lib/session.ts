// The shared-password session: a cookie holding an expiry and an HMAC of it,
// signed with SESSION_SECRET. Every page and every action checks it.
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "hb_session";
const MAX_AGE_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string): boolean {
  // Compare fixed-length digests so neither length nor content leaks through timing.
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

export function passwordMatches(entered: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD is not set");
  return safeEqual(entered, expected);
}

export async function startSession(): Promise<void> {
  const expires = Date.now() + MAX_AGE_DAYS * 24 * 3600 * 1000;
  const payload = String(expires);
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 3600,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function hasSession(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  return Number(payload) > Date.now();
}

/** For pages and server actions: send anyone without a session to the login screen. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}
