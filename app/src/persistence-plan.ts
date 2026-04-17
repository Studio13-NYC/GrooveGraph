const ALLOWED_TYPES = new Set(["Artist", "Recording", "Studio", "Equipment", "Person"]);

const LABEL_TO_TYPEDB: Record<string, string> = {
  Artist: "gg-artist",
  Recording: "gg-recording",
  Studio: "gg-studio",
  Equipment: "gg-equipment",
  Person: "gg-person",
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "untitled";
}

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sourceSnippetsForEntity(evidence: any): Array<{ name: string; snippet: string; source: string; source_url?: string }> {
  const orderedSources = ["wikipedia", "musicbrainz"];
  const snippets: Array<{ name: string; snippet: string; source: string; source_url?: string }> = [];
  for (const sourceName of orderedSources) {
    const source = evidence?.sources?.[sourceName];
    const sourceSnippets = Array.isArray(source?.snippets) ? source.snippets : [];
    for (const snippet of sourceSnippets.slice(0, 2)) {
      snippets.push({
        name: cleanText(snippet.name || sourceName),
        snippet: cleanText(snippet.snippet || ""),
        source: sourceName,
        source_url: cleanText(snippet.source_url || ""),
      });
    }
  }
  return snippets.filter((snippet) => snippet.snippet);
}

function exactGraphMatch(graphContext: any, entity: any): any | null {
  const normalized = normalizeName(cleanText(entity?.text || entity?.name || entity?.label || ""));
  const type = cleanText(entity?.label);
  const nodes = Array.isArray(graphContext?.nodes) ? graphContext.nodes : [];
  return nodes.find((node: any) => node.type === type && normalizeName(cleanText(node.label)) === normalized) ?? null;
}

function dedupeEntities(entities: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const entity of entities) {
    const label = cleanText(entity?.label);
    const name = cleanText(entity?.text || entity?.name || "");
    const key = `${label}:${normalizeName(name)}`;
    if (!label || !name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entity);
  }
  return out;
}

export function buildPersistencePlan(runId: string, question: string, review: any, extractBody: any, evidence: any, graphContext: any): any {
  const acceptedRaw = Array.isArray(review?.accepted_entities) ? review.accepted_entities : [];
  const rejectedRaw = Array.isArray(review?.rejected_entities) ? review.rejected_entities : [];
  const accepted = dedupeEntities(acceptedRaw).filter((entity) => ALLOWED_TYPES.has(cleanText(entity?.label)));
  const rejected = dedupeEntities(rejectedRaw);
  const sourceSnippets = sourceSnippetsForEntity(evidence);

  const nodePlans: any[] = [];
  const mergeCandidates: any[] = [];
  const rejectedCandidates = rejected.map((entity: any, index: number) => ({
    id: `${runId}:rejected:${index}`,
    label: cleanText(entity?.text || entity?.name || entity?.label || `Rejected ${index + 1}`),
    type: cleanText(entity?.label || "candidate-untyped"),
    status: "candidate_rejected",
    metadata_preview: {
      confidence: entity?.confidence ?? null,
      reason: "review_rejected",
    },
  }));
  const unpersistedCandidates: any[] = [];

  for (const entity of accepted) {
    const label = cleanText(entity.label);
    const name = cleanText(entity.text || entity.name || entity.label);
    const normalizedName = normalizeName(name);
    const graphMatch = exactGraphMatch(graphContext, entity);
    const ref = `${label}:${normalizedName}`;
    const nodePlan = {
      ref,
      name,
      normalized_name: normalizedName,
      typedb_type: LABEL_TO_TYPEDB[label],
      label,
      external_source: sourceSnippets[0]?.source || "",
      source_url: sourceSnippets[0]?.source_url || "",
      summary: sourceSnippets[0]?.snippet || `Accepted ${label} candidate from run ${runId}.`,
      merge_target_id: graphMatch?.id ?? null,
      graph_status: graphMatch ? "existing" : "draft_added",
    };
    nodePlans.push(nodePlan);
    if (graphMatch) {
      mergeCandidates.push({
        entity_name: name,
        entity_type: label,
        graph_node_id: graphMatch.id,
      });
    }
  }

  const recording = nodePlans.find((node) => node.label === "Recording") ?? null;
  const artist = nodePlans.find((node) => node.label === "Artist") ?? null;
  const relations: any[] = [];

  if (artist && recording) {
    relations.push({
      kind: "artist_recording",
      left_ref: artist.ref,
      right_ref: recording.ref,
      summary: `${artist.name} linked to ${recording.name}`,
    });
  }

  for (const node of nodePlans) {
    if (!recording || node.ref === recording.ref) {
      continue;
    }
    if (node.label === "Studio") {
      relations.push({
        kind: "recording_studio",
        left_ref: recording.ref,
        right_ref: node.ref,
        summary: `${recording.name} linked to studio ${node.name}`,
      });
      continue;
    }
    if (node.label === "Equipment") {
      relations.push({
        kind: "recording_equipment",
        left_ref: recording.ref,
        right_ref: node.ref,
        summary: `${recording.name} linked to equipment ${node.name}`,
      });
      continue;
    }
    if (node.label === "Person") {
      unpersistedCandidates.push({
        id: `${runId}:unpersisted:${node.ref}`,
        label: node.name,
        type: node.label,
        status: "candidate_unpersisted",
        metadata_preview: {
          reason: "person_role_missing",
        },
      });
    }
  }

  const persistableNodeRefs = new Set<string>();
  for (const relation of relations) {
    persistableNodeRefs.add(relation.left_ref);
    persistableNodeRefs.add(relation.right_ref);
  }

  const persistedNodes = nodePlans.filter((node) => persistableNodeRefs.has(node.ref));
  const blockedNodes = nodePlans.filter((node) => !persistableNodeRefs.has(node.ref));
  for (const node of blockedNodes) {
    unpersistedCandidates.push({
      id: `${runId}:unpersisted:${node.ref}`,
      label: node.name,
      type: node.label,
      status: "candidate_unpersisted",
      metadata_preview: {
        reason: recording ? "not_connected_to_supported_relation" : "recording_anchor_missing",
      },
    });
  }

  const evidenceRecords = persistedNodes.flatMap((node, index) => {
    const snippets = sourceSnippets.slice(0, 2);
    return snippets.map((snippet, snippetIndex) => ({
      id: `${runId}:evidence:${index}:${snippetIndex}`,
      subject_ref: node.ref,
      name: snippet.name || `${snippet.source} evidence`,
      snippet: snippet.snippet,
      source: snippet.source,
      source_url: snippet.source_url || "",
      summary: `${snippet.source} evidence for ${node.name}`,
    }));
  });

  const extractEntities = Array.isArray(extractBody?.entities) ? extractBody.entities : [];
  const reviewDecision = cleanText(review?.persistence_decision || "blocked_review");
  const hasSupportedGraphBatch = persistedNodes.length > 0 && relations.length > 0;
  const decision = reviewDecision === "persist_draft" && hasSupportedGraphBatch ? "persist_draft" : "skip_persist";
  const blockedReason =
    reviewDecision === "blocked_review"
      ? "review_blocked"
      : !hasSupportedGraphBatch
        ? "no_supported_connected_batch"
        : "";

  return {
    run_id: runId,
    question,
    summary: cleanText(review?.summary || `Run ${runId}`),
    decision,
    blocked_reason: blockedReason,
    nodes: persistedNodes,
    relations,
    evidence_records: evidenceRecords,
    merge_candidates: mergeCandidates,
    rejected_candidates: rejectedCandidates,
    unpersisted_candidates: unpersistedCandidates,
    extract_summary: {
      entities: extractEntities.length,
      properties: Array.isArray(extractBody?.properties) ? extractBody.properties.length : 0,
      relations: Array.isArray(extractBody?.relations) ? extractBody.relations.length : 0,
    },
    persistence_summary: {
      merged_entities: mergeCandidates.length,
      draft_entities: persistedNodes.filter((node) => !node.merge_target_id).length,
      draft_edges: relations.length,
      rejected_candidates: rejectedCandidates.length,
      unpersisted_candidates: unpersistedCandidates.length,
    },
  };
}
