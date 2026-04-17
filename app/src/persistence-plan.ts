const ALLOWED_TYPES = new Set(["Artist", "Recording", "Studio", "Equipment", "Person"]);

const LABEL_TO_TYPEDB: Record<string, string> = {
  Artist: "gg-artist",
  Recording: "gg-recording",
  Studio: "gg-studio",
  Equipment: "gg-equipment",
  Person: "gg-person",
};

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "untitled";
}

function dedupeEntities(entities: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  const ranked = [...entities].sort((left, right) => Number(right?.confidence || 0) - Number(left?.confidence || 0));
  for (const entity of ranked) {
    const label = cleanText(entity?.label);
    const name = cleanText(entity?.text || entity?.name || "");
    if (!label || !name || !ALLOWED_TYPES.has(label)) {
      continue;
    }
    const key = `${label}:${normalizeName(name)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entity);
  }
  return out;
}

function exactGraphMatch(graphContext: any, entity: any): any | null {
  const normalized = normalizeName(cleanText(entity?.text || entity?.name || entity?.label || ""));
  const type = cleanText(entity?.label);
  const nodes = Array.isArray(graphContext?.nodes) ? graphContext.nodes : [];
  return nodes.find((node: any) => node.type === type && normalizeName(cleanText(node.label)) === normalized) ?? null;
}

function evidenceSnippets(evidence: any): Array<{ name: string; snippet: string; source: string; source_url?: string }> {
  const orderedSources = ["wikipedia", "musicbrainz", "discogs", "web"];
  const snippets: Array<{ name: string; snippet: string; source: string; source_url?: string }> = [];
  for (const sourceName of orderedSources) {
    const source = evidence?.sources?.[sourceName];
    const sourceSnippets = Array.isArray(source?.snippets) ? source.snippets : [];
    for (const snippet of sourceSnippets.slice(0, 2)) {
      const text = cleanText(snippet.snippet);
      if (!text) {
        continue;
      }
      snippets.push({
        name: cleanText(snippet.name || sourceName),
        snippet: text,
        source: sourceName,
        source_url: cleanText(snippet.source_url || ""),
      });
    }
  }
  return snippets;
}

function chooseAnchor(entities: any[], label: string): any | null {
  return entities.find((entity) => cleanText(entity?.label) === label) ?? null;
}

function relationKey(kind: string, leftRef: string, rightRef: string): string {
  return `${kind}:${leftRef}:${rightRef}`;
}

function addRelation(relations: any[], relation: any): void {
  const key = relationKey(relation.kind, relation.left_ref, relation.right_ref);
  if (relations.some((item) => relationKey(item.kind, item.left_ref, item.right_ref) === key)) {
    return;
  }
  relations.push(relation);
}

function mapExtractRelations(extractBody: any, nodeMap: Map<string, any>): any[] {
  const relations: any[] = [];
  const extractRelations = Array.isArray(extractBody?.relations) ? extractBody.relations : [];

  function lookup(name: string, allowedLabels?: string[]): any | null {
    const normalized = normalizeName(name);
    const candidate = Array.from(nodeMap.values()).find((node) => node.normalized_name === normalized);
    if (!candidate) {
      return null;
    }
    if (allowedLabels && !allowedLabels.includes(candidate.label)) {
      return null;
    }
    return candidate;
  }

  for (const relation of extractRelations) {
    const sourceName = cleanText(relation?.source_entity);
    const targetName = cleanText(relation?.target_entity);
    const source = lookup(sourceName);
    const target = lookup(targetName);
    if (!source || !target) {
      continue;
    }

    const type = cleanText(relation?.type);
    if (type === "recorded_at" && source.label === "Recording" && target.label === "Studio") {
      addRelation(relations, {
        kind: "recording_studio",
        left_ref: source.ref,
        right_ref: target.ref,
        summary: `${source.name} recorded at ${target.name}`,
      });
    }
    if (type === "produced" && source.label === "Person" && target.label === "Recording") {
      addRelation(relations, {
        kind: "person_recording",
        left_ref: source.ref,
        right_ref: target.ref,
        role_name: "producer",
        summary: `${source.name} produced ${target.name}`,
      });
    }
  }

  return relations;
}

export function buildPersistencePlan(runId: string, question: string, extractBody: any, evidence: any, graphContext: any): any {
  const extracted = dedupeEntities(Array.isArray(extractBody?.entities) ? extractBody.entities : []);
  const snippets = evidenceSnippets(evidence);
  const nodePlans: any[] = [];
  const mergeCandidates: any[] = [];
  const rejectedCandidates: any[] = [];
  const unpersistedCandidates: any[] = [];

  for (const entity of extracted) {
    const label = cleanText(entity.label);
    const name = cleanText(entity.text || entity.name || entity.label);
    if (!label || !name || !ALLOWED_TYPES.has(label)) {
      continue;
    }
    const normalizedName = normalizeName(name);
    const graphMatch = exactGraphMatch(graphContext, entity);
    nodePlans.push({
      ref: `${label}:${normalizedName}`,
      name,
      normalized_name: normalizedName,
      typedb_type: LABEL_TO_TYPEDB[label],
      label,
      merge_target_id: graphMatch?.id ?? null,
      graph_status: graphMatch ? "existing" : "draft_added",
      external_source: cleanText(entity?.sources?.[0] || snippets[0]?.source || ""),
      source_url: cleanText(entity?.source_urls?.[0] || snippets[0]?.source_url || ""),
      summary: cleanText(entity?.evidence?.[0] || snippets[0]?.snippet || `Draft ${label} candidate from run ${runId}.`),
      confidence: Number(entity?.confidence || 0),
    });
    if (graphMatch) {
      mergeCandidates.push({
        entity_name: name,
        entity_type: label,
        graph_node_id: graphMatch.id,
      });
    }
  }

  const nodeMap = new Map(nodePlans.map((node) => [node.ref, node]));
  const relations: any[] = [];
  const artist = chooseAnchor(extracted, "Artist");
  const recording = chooseAnchor(extracted, "Recording");
  const recordingRef = recording ? nodeMap.get(`Recording:${normalizeName(cleanText(recording.text || recording.name || ""))}`) : null;
  const artistRef = artist ? nodeMap.get(`Artist:${normalizeName(cleanText(artist.text || artist.name || ""))}`) : null;

  if (artistRef && recordingRef) {
    addRelation(relations, {
      kind: "artist_recording",
      left_ref: artistRef.ref,
      right_ref: recordingRef.ref,
      summary: `${artistRef.name} linked to ${recordingRef.name}`,
    });
  }

  for (const node of nodePlans) {
    if (!recordingRef || node.ref === recordingRef.ref) {
      continue;
    }
    if (node.label === "Studio") {
      addRelation(relations, {
        kind: "recording_studio",
        left_ref: recordingRef.ref,
        right_ref: node.ref,
        summary: `${recordingRef.name} linked to studio ${node.name}`,
      });
    }
    if (node.label === "Equipment") {
      addRelation(relations, {
        kind: "recording_equipment",
        left_ref: recordingRef.ref,
        right_ref: node.ref,
        summary: `${recordingRef.name} linked to equipment ${node.name}`,
      });
    }
  }

  for (const relation of mapExtractRelations(extractBody, nodeMap)) {
    addRelation(relations, relation);
  }

  const persistableNodeRefs = new Set<string>();
  for (const relation of relations) {
    persistableNodeRefs.add(relation.left_ref);
    persistableNodeRefs.add(relation.right_ref);
  }

  const persistedNodes = nodePlans.filter((node) => persistableNodeRefs.has(node.ref));
  for (const node of nodePlans) {
    if (persistableNodeRefs.has(node.ref)) {
      continue;
    }
    unpersistedCandidates.push({
      id: `${runId}:unpersisted:${node.ref}`,
      label: node.name,
      type: node.label,
      status: "candidate_unpersisted",
      metadata_preview: {
        reason: recordingRef ? "not_connected_to_supported_relation" : "recording_anchor_missing",
        confidence: node.confidence,
      },
    });
  }

  for (const entity of Array.isArray(extractBody?.entities) ? extractBody.entities : []) {
    const label = cleanText(entity?.label);
    const name = cleanText(entity?.text || entity?.name || "");
    if (ALLOWED_TYPES.has(label)) {
      continue;
    }
    if (!name) {
      continue;
    }
    rejectedCandidates.push({
      id: `${runId}:rejected:${label}:${normalizeName(name)}`,
      label: name,
      type: label || "Unsupported",
      status: "candidate_rejected",
      metadata_preview: {
        reason: "unsupported_for_reset_schema",
        confidence: Number(entity?.confidence || 0),
      },
    });
  }

  const evidenceRecords = persistedNodes.flatMap((node, index) =>
    snippets.slice(0, 3).map((snippet, snippetIndex) => ({
      id: `${runId}:evidence:${index}:${snippetIndex}`,
      subject_ref: node.ref,
      name: snippet.name || `${snippet.source} evidence`,
      snippet: snippet.snippet,
      source: snippet.source,
      source_url: snippet.source_url || "",
      summary: `${snippet.source} evidence for ${node.name}`,
    })),
  );

  const decision = persistedNodes.length > 0 && relations.length > 0 ? "persist_draft" : "skip_persist";
  const blockedReason = decision === "persist_draft" ? "" : "no_supported_connected_batch";

  return {
    run_id: runId,
    question,
    summary: cleanText(`Prepared draft proposal from ${extracted.length} extracted entities for "${question}".`),
    decision,
    blocked_reason: blockedReason,
    nodes: persistedNodes,
    relations,
    evidence_records: evidenceRecords,
    merge_candidates: mergeCandidates,
    rejected_candidates: rejectedCandidates,
    unpersisted_candidates: unpersistedCandidates,
    extract_summary: {
      entities: extracted.length,
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
