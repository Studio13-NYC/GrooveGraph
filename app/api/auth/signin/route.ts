import { NextRequest, NextResponse } from "next/server";
import { ADMIN_USERNAME } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";

/** POST /api/auth/signin — optional; UI does client-only login with hardcoded nickknyc. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    if (username !== ADMIN_USERNAME) {
      return NextResponse.json({ error: "Invalid admin username" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, redirectUrl: "/" });
  } catch {
    return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });
  }
}
