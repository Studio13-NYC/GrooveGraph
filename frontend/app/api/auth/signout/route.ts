import { NextResponse } from "next/server";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";

/** POST /api/auth/signout — optional; UI clears sessionStorage only. */
export async function POST() {
  return NextResponse.json({ ok: true, redirectUrl: "/" });
}
