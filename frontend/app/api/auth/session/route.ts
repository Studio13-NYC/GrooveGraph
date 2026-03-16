import { NextRequest } from "next/server";
import { getAuthSessionFromRequest, isAdmin } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";

/**
 * GET /api/auth/session
 * Returns current session from cookie or Authorization: Bearer <token>.
 * Bearer token fallback for when cross-origin cookies are blocked (e.g. InPrivate, third-party cookie blocking).
 */
export async function GET(request: NextRequest) {
  const session = getAuthSessionFromRequest(request);
  const admin = isAdmin(session);
  return Response.json({
    admin,
    user: session?.user ?? null,
  });
}
