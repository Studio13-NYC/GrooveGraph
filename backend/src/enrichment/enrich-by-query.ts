/**
 * Orchestrates "enrich by query" when a user searches for an entity not in the graph.
 * Creates a stub, runs LLM-only pipeline, imports bundle, applies as proposed, then the caller resolves and builds the graph.
 */

import type { GraphStore } from "../store/types";
import { createStubEntity } from "../lib/graph-mutations";
import {
  applyReviewSessionAsProposed,
  createReviewSession,
  importResearchBundle,
} from "./review";
import { runLlmOnlyPipeline, useLlmOnlyPipeline } from "./pipelines/llm-only";
import { buildResearchOntologyContext } from "./llm/ontology-context";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Run enrichment for a query that is not in the graph: create stub, run LLM-only pipeline,
 * import bundle, apply as proposed. After this, resolveEntityNode(store, entityType, query) should find the seed.
 */
export async function runEnrichByQuery(
  store: GraphStore,
  entityType: string,
  query: string,
  options?: { proposedBy?: string }
): Promise<void> {
  if (!useLlmOnlyPipeline()) {
    throw new Error("Enrich by query requires ENRICHMENT_PIPELINE=llm-only.");
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error("Query is required.");

  const stubId = `query-${entityType.toLowerCase()}-${slug(trimmedQuery)}`;
  const { id: createdId } = await createStubEntity(store, {
    id: stubId,
    label: entityType,
    name: trimmedQuery,
  });

  const session = await createReviewSession(store, [createdId]);
  const ontology = buildResearchOntologyContext();
  const { bundle } = await runLlmOnlyPipeline(session.id, session.targets, { ontology });
  await importResearchBundle(store, session.id, bundle, "llm-only", undefined, "llm_only");
  await applyReviewSessionAsProposed(store, session.id, { proposedBy: options?.proposedBy });
}
