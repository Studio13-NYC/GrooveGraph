import { NextRequest, NextResponse } from "next/server";

/** Origins allowed to call the API (e.g. SWA UI at groovegraph.s13.nyc). */
const CORS_ORIGINS = [
  "https://groovegraph.s13.nyc",
  "https://jolly-coast-00d3fab0f.6.azurestaticapps.net",
  "https://as-groovegraph-api.azurewebsites.net",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return CORS_ORIGINS.some((allowed) => origin === allowed);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin);
  console.log("[cors]", { pathname, method: request.method, origin: origin ?? "(none)", allowed });
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed && origin) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
