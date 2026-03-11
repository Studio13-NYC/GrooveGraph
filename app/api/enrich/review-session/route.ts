import { NextRequest, NextResponse } from "next/server";
import { buildResearchPacket, startAutomatedReviewSession } from "@/enrichment";
import type { ReviewTargetEntity } from "@/enrichment/types";
import { createStubEntity } from "@/lib/graph-mutations";
import { getGraphStore } from "@/load/persist-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetIds = Array.isArray(body?.targetIds)
      ? body.targetIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
      : [];
    const requestedTargets: Array<{ id: string; label: string; name: string }> = Array.isArray(body?.targets)
      ? body.targets
          .map((value: unknown): { id: string; label: string; name: string } | null => {
            if (!value || typeof value !== "object") return null;
            const target = value as Partial<ReviewTargetEntity>;
            const id = String(target.id ?? "").trim();
            const label = String(target.label ?? "").trim();
            const name = String(target.name ?? "").trim();
            if (!label || !name) return null;
            return { id, label, name };
          })
          .filter(
            (
              item: { id: string; label: string; name: string } | null
            ): item is { id: string; label: string; name: string } => item !== null
          )
      : [];

    if (targetIds.length === 0 && requestedTargets.length === 0) {
      return NextResponse.json({ error: "Select at least one target entity." }, { status: 400 });
    }

    const store = await getGraphStore();
    const resolvedTargetIds = [...targetIds];
    for (const target of requestedTargets) {
      if (target.id && !target.id.startsWith("draft:")) {
        resolvedTargetIds.push(target.id);
        continue;
      }
      const created = await createStubEntity(store, {
        label: target.label,
        name: target.name,
      });
      resolvedTargetIds.push(created.id);
    }
    const session = await startAutomatedReviewSession(store, resolvedTargetIds);

    return NextResponse.json({
      status: "ok",
      session,
      researchPacket: buildResearchPacket(session),
    });
  } catch (error) {
    console.error("create-review-session", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create review session" },
      { status: 500 }
    );
  }
}
