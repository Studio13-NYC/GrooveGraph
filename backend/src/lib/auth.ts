/**
 * UI-only admin: hardcoded "nickknyc". No cookies, no tokens.
 * API accepts header X-Admin-User: nickknyc for protected routes.
 */

import { NextResponse } from "next/server";

export const ADMIN_USERNAME = "nickknyc";
const ADMIN_HEADER = "X-Admin-User";

export type AuthSession = {
  user: string;
  admin: boolean;
};

/** Session from request: only checks X-Admin-User header. Returns user session (admin: false) when header missing. */
export function getAuthSessionFromRequest(request: Request): AuthSession {
  const user = request.headers.get(ADMIN_HEADER)?.trim();
  if (user === ADMIN_USERNAME) return { user: ADMIN_USERNAME, admin: true };
  return { user: "", admin: false };
}

export function isAdmin(session: AuthSession | null): boolean {
  return session?.admin === true && session?.user === ADMIN_USERNAME;
}

/** For API routes: returns 401 if not admin, otherwise null. */
export function requireAdminResponseFromRequest(request: Request): NextResponse | null {
  const session = getAuthSessionFromRequest(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export { ADMIN_HEADER };
