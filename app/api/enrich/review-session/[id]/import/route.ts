import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { importResearchBundle } from "@/enrichment";
import type { ResearchBundle } from "@/enrichment";
import { requireAdminResponse } from "@/lib/auth";
import { getGraphStore } from "@/load/persist-graph";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;
export function generateStaticParams() {
  return [];
}

type RouteContext = { params: { id: string } };

export async function POST(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const unauth = requireAdminResponse(cookieStore);
  if (unauth) return unauth;
  try {
    const body = await request.json();
    const bundle = body?.bundle as ResearchBundle | undefined;
    if (!bundle) {
      return NextResponse.json({ error: "Missing research bundle." }, { status: 400 });
    }
    const store = await getGraphStore();
    const session = await importResearchBundle(store, context.params.id, bundle);
    return NextResponse.json({ status: "ok", session });
  } catch (error) {
    console.error("import-review-bundle", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import research bundle" },
      { status: 500 }
    );
  }
}
