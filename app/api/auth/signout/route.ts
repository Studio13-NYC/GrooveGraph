import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";

/**
 * POST /api/auth/signout — clears auth cookie.
 * Returns { redirectUrl: "/" } for client redirect.
 */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true, redirectUrl: "/" });
}
