import { NextRequest, NextResponse } from "next/server";
import { importResearchBundle } from "@/enrichment";
import type { ResearchBundle } from "@/enrichment";
import { getGraphStore } from "@/load/persist-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, context: RouteContext) {
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
