import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuthCookie, COOKIE_NAME, ADMIN_USERNAME } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";

/**
 * POST /api/auth/signin
 * Body: { username: string } (form or JSON)
 * If username === "nickknyc", sets signed cookie and returns redirect URL.
 */
export async function POST(request: NextRequest) {
  try {
    let username: string;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      username = String(body?.username ?? "").trim();
    } else {
      const form = await request.formData();
      username = String(form.get("username") ?? "").trim();
    }

    if (username !== ADMIN_USERNAME) {
      return NextResponse.json(
        { error: "Invalid admin username", redirectUrl: "/login" },
        { status: 401 }
      );
    }

    const value = createAuthCookie();
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return NextResponse.json({ ok: true, redirectUrl: "/" });
  } catch (e) {
    console.error("signin", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sign-in failed" },
      { status: 500 }
    );
  }
}
