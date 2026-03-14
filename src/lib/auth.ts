/**
 * Cookie-based auth: single admin "nickknyc", passwordless.
 * Cookie is signed with AUTH_COOKIE_SECRET so it cannot be forged.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const COOKIE_NAME = "gg_admin";
const ADMIN_USERNAME = "nickknyc";

export type AuthSession = {
  user: string;
  admin: boolean;
};

function getSecret(): string | null {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret || secret.length < 16) return null;
  return secret;
}

function sign(value: string): string {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_COOKIE_SECRET must be set (e.g. in .env.local, 16+ chars)");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createAuthCookie(): string {
  const payload: AuthSession = { user: ADMIN_USERNAME, admin: true };
  const value = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(value);
  return `${value}.${signature}`;
}

export function verifyAuthCookie(cookieValue: string | undefined): AuthSession | null {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [value, sig] = cookieValue.split(".");
  if (!value || !sig) return null;
  try {
    if (!getSecret()) return null;
    const expectedSig = sign(value);
    if (expectedSig.length !== sig.length || !timingSafeEqual(Buffer.from(expectedSig, "utf8"), Buffer.from(sig, "utf8"))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AuthSession;
    if (payload.user !== ADMIN_USERNAME || payload.admin !== true) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAuthSession(cookies: { get: (name: string) => { value: string } | undefined }): AuthSession | null {
  const cookie = cookies.get(COOKIE_NAME);
  return verifyAuthCookie(cookie?.value);
}

export function isAdmin(session: AuthSession | null): boolean {
  return session?.admin === true && session?.user === ADMIN_USERNAME;
}

/** For API routes: returns 401 response if not admin, otherwise null (proceed). */
export function requireAdminResponse(cookieStore: { get: (name: string) => { value: string } | undefined }): NextResponse | null {
  const session = getAuthSession(cookieStore);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export { COOKIE_NAME, ADMIN_USERNAME };
