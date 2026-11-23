import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "session";

function secret() {
  return process.env.SESSION_SECRET || "local-dev-session-secret";
}

export function signSession(userId: string) {
  const body = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string | undefined) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    userId?: string;
    exp?: number;
  };
  if (!data.userId || !data.exp || data.exp < Date.now()) return null;
  return data.userId;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function sessionUserId() {
  const jar = await cookies();
  return readSession(jar.get(COOKIE)?.value);
}
