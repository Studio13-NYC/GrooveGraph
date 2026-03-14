import type { ResearchEvidenceRecord, ResearchEvidenceTarget, ResearchPacket } from "../types";

function summarizeEvidenceRecord(record: ResearchEvidenceRecord) {
  return {
    evidenceId: record.evidenceId,
    source: {
      id: record.source_id,
      name: record.source_name,
      type: record.source_type,
      url: record.url,
      retrievedAt: record.retrieved_at,
      excerpt: record.excerpt ?? null,
    },
    confidence: record.confidence,
    properties: record.properties,
    relatedNodes: record.relatedNodes ?? [],
    relatedEdges: record.relatedEdges ?? [],
  };
}

function summarizeTarget(target: ResearchEvidenceTarget) {
  return {
    target: target.target,
    evidenceCount: target.records.length,
    evidence: target.records.map(summarizeEvidenceRecord),
  };
}

export function buildEnrichmentLlmPrompt(packet: ResearchPacket): { system: string; user: string } {
  const system = [
    "You are an expert music-knowledge graph researcher and editor.",
    "Your job is to read all provided evidence together, reconcile conflicts, and propose only source-backed graph changes.",
    "Return JSON only. Do not wrap the response in markdown.",
    "Use only the allowed entity labels and relationship types from the ontology context.",
    "Never emit synthetic graph constructs such as EntityType, IS_A, or RELATED_TYPE.",
    "Treat Artist and Person as one identity for the same human. If a human artist is involved, preserve the dual identity by using labels ['Artist', 'Person'] on node candidates while choosing one primary label in the label field.",
    "Every property, node, and edge candidate must include provenance. Add evidence arrays and short justification text whenever possible.",
    "Prefer omission over speculation. If evidence is weak or conflicting, leave the candidate out or explain the uncertainty in notes.",
  ].join("\n");

  const userPayload = {
    sessionId: packet.sessionId,
    instructions: packet.instructions,
    ontology: packet.ontology,
    sourcePlan: packet.sourcePlan ?? null,
    targets: packet.targets,
    evidence: packet.evidence.map(summarizeTarget),
    outputRequirements: {
      sessionIdMustMatch: packet.sessionId,
      topLevelKeys: [
        "sessionId",
        "generatedAt",
        "summary",
        "targets",
        "propertyChanges",
        "nodeCandidates",
        "edgeCandidates",
        "metadata",
      ],
      propertyChangeRequirements: [
        "candidateId",
        "targetId",
        "key",
        "value",
        "confidence",
        "provenance",
      ],
      nodeCandidateRequirements: [
        "candidateId",
        "label",
        "labels",
        "name",
        "canonicalKey",
        "properties",
        "confidence",
        "provenance",
      ],
      edgeCandidateRequirements: [
        "candidateId",
        "type",
        "fromRef",
        "toRef",
        "confidence",
        "provenance",
      ],
      metadataDefaults: {
        generator: "llm",
      },
    },
  };

  return {
    system,
    user: JSON.stringify(userPayload),
  };
}
