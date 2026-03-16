/**
 * Schema and prompt for triplet exploration: subject —[relationship]—> object.
 * Asks the LLM to return all information that fits the pattern (e.g. guitars Paul Weller plays).
 * By design, the prompt also invites related context (e.g. albums, bands) that fits the graph
 * schema, so you may see Artist/Album nodeCandidates alongside the primary object type—this is
 * intentional enrichment, not a misconfiguration.
 */

import type { ResearchOntologyContext, ReviewTargetEntity } from "../types";
import type { TripletSpec } from "../triplet";
import { buildResearchOntologyContext } from "../llm/ontology-context";
import {
  getRelationshipDescription,
  type RelationshipType,
} from "../../lib/relationship-config";

const PROMPT_VERSION = "2026-03-14.0";

function buildSchemaBlock(ontology: ResearchOntologyContext): string {
  const entityList = ontology.entityDefinitions
    .map(
      (e) =>
        `  - ${e.label}: ${e.descriptionNoun}; display keys: ${e.displayPropertyKeys.join(", ")}`
    )
    .join("\n");
  const relationshipList = ontology.relationshipDefinitions
    .map((r) => `  - ${r.type}: ${r.description}`)
    .join("\n");

  return `
## Entity labels (use only these)
${entityList}

## Relationship types (use only these)
${relationshipList}

## Output JSON shape
Return a single JSON object with: sessionId, generatedAt, summary, targets (copy from request), propertyChanges, nodeCandidates, edgeCandidates, metadata.
- metadata: { "generator": "llm", "provider": "OpenAI", "model": "gpt-5.4", "promptVersion": "${PROMPT_VERSION}" }
- Every propertyChange, nodeCandidate, and edgeCandidate must include provenance (array with source_id "gpt-5.4", source_name "GPT-5.4", source_type "api", url "https://openai.com/gpt-5.4", retrieved_at, confidence).
- fromRef/toRef: use kind "target" and the target id when the endpoint is the subject or object target; use kind "candidate" for nodes you are proposing.
- Do not use IS_A, RELATED_TYPE, or EntityType.
`;
}

export type TripletPromptScopeOptions = {
  scopeTarget?: ReviewTargetEntity;
  hasAnySubject?: boolean;
  hasAnyObject?: boolean;
};

/**
 * Build prompt for triplet exploration. Targets must be [subjectTarget, objectTarget] with ids
 * that match the stub ids used in the session (e.g. triplet-subject-xxx, triplet-object-xxx).
 * When scopeTarget and hasAnySubject/hasAnyObject are provided, adds instructions for "any" expansion.
 */
export function buildTripletExplorationPrompt(
  sessionId: string,
  triplet: TripletSpec,
  targets: ReviewTargetEntity[],
  ontology?: ResearchOntologyContext,
  scopeOptions?: TripletPromptScopeOptions
): { system: string; user: string } {
  const ontologyContext = ontology ?? buildResearchOntologyContext();
  const schemaBlock = buildSchemaBlock(ontologyContext);
  const relDesc = getRelationshipDescription(triplet.relationship as RelationshipType);
  const hasAnySubject = scopeOptions?.hasAnySubject ?? false;
  const hasAnyObject = scopeOptions?.hasAnyObject ?? false;
  const scopeTarget = scopeOptions?.scopeTarget;

  const system = [
    "You are an expert music-knowledge researcher. Your task is triplet exploration: given a subject entity, a relationship type, and an object entity, return all graph-compatible information that fits that pattern.",
    "Example: (Artist: Paul Weller) —[PLAYED_INSTRUMENT]—> (Instrument: guitar) means 'all information on the guitars that Paul Weller plays'. You would propose: specific instrument nodes (e.g. Fender Telecaster, Rickenbacker 330), properties (model, brand, period used), and PLAYED_INSTRUMENT edges from Paul Weller to each. You may also include recordings or songs where he used them if that fits the graph schema.",
    "Return only valid JSON. No markdown, no commentary outside the JSON object.",
    schemaBlock,
  ].join("\n\n");

  const instructions: string[] = [];
  if (scopeTarget && (hasAnySubject || hasAnyObject)) {
    instructions.push(
      `SCOPED EXPANSION: The scope entity is ${scopeTarget.label}: ${scopeTarget.name} (target id: ${scopeTarget.id}).`,
      hasAnySubject && hasAnyObject
        ? `Subject "${triplet.subject.label}" with name "any" means all entities of that type related to the scope entity. Object "${triplet.object.label}" with name "any" means all entities of that type linked by ${triplet.relationship}. For each ${triplet.subject.label} related to the scope entity, return the ${triplet.subject.label} node and ${triplet.relationship} edges to its ${triplet.object.label} nodes. Use fromRef/toRef with kind "candidate" for ${triplet.subject.label} and ${triplet.object.label} nodes you propose. CRITICAL: Each nodeCandidate must have a unique candidateId (e.g. "${triplet.subject.label.toLowerCase()}-on-sunset" for Album "On Sunset", "${triplet.object.label.toLowerCase()}-mirror-ball" for ${triplet.object.label} "Mirror Ball"). Each edgeCandidate must reference these EXACT candidateIds: fromRef.id must be the candidateId of the ${triplet.subject.label} node, toRef.id must be the candidateId of the ${triplet.object.label} node.`
        : hasAnySubject
          ? `Subject "${triplet.subject.label}" with name "any" means all entities of that type related to the scope entity. For each such ${triplet.subject.label}, return the node and ${triplet.relationship} edges. Use kind "candidate" for proposed nodes. Use candidateId format: label slug + "-" + name slug (e.g. album-on-sunset). Edge fromRef/toRef.id must match node candidateIds exactly.`
          : `Object "${triplet.object.label}" with name "any" means all entities of that type linked via ${triplet.relationship}. Use kind "candidate" for proposed nodes. Use candidateId format: label slug + "-" + name slug. Edge fromRef/toRef.id must match node candidateIds exactly.`
    );
  }
  if (triplet.relationship === "CONTAINS" && triplet.subject.label === "Album" && triplet.object.label === "Track") {
    instructions.push(
      "TASK: Look up the song/track list for each album. For each Album (related to the scope if scope is given), search for that album's track listing and return: (1) the Album as a nodeCandidate, (2) each Track (song) on that album as a nodeCandidate, (3) one CONTAINS edgeCandidate per Track with fromRef = that Album's candidateId and toRef = that Track's candidateId. Every track must belong to an album via a CONTAINS edge; do not return tracks without linking them to an album."
    );
  }
  instructions.push(
    `Explore the conjunction: (${triplet.subject.label}: ${triplet.subject.name}) —[${triplet.relationship}]—> (${triplet.object.label}: ${triplet.object.name}).`,
    `Return all information that fits this pattern. Create nodeCandidates for specific instances (e.g. specific guitar models, albums, bands) and edgeCandidates linking them. Use the subject target id for the subject entity and the object target id for the object entity in fromRef/toRef where appropriate.`
  );
  if (triplet.relationship === "CONTAINS" && triplet.subject.label === "Album" && triplet.object.label === "Track") {
    instructions.push(
      "CRITICAL: Every Track in nodeCandidates MUST have at least one CONTAINS edge from an Album. Add edgeCandidates with type \"CONTAINS\", fromRef: { kind: \"candidate\", id: <album candidateId> }, toRef: { kind: \"candidate\", id: <track candidateId> }. Use the exact candidateIds from your nodeCandidates (e.g. album-wild-wood, track-sunflower)."
    );
  }
  instructions.push(
    "Include property changes, related nodes, and edges. Use only the allowed entity labels and relationship types. Every candidate needs provenance with source_id 'gpt-5.4', source_name 'GPT-5.4', source_type 'api', url 'https://openai.com/gpt-5.4', retrieved_at (ISO), and confidence."
  );

  const userPayload = {
    sessionId,
    generatedAt: new Date().toISOString(),
    triplet: {
      subject: triplet.subject,
      relationship: triplet.relationship,
      relationshipDescription: relDesc,
      object: triplet.object,
    },
    targets,
    instructions,
  };

  return {
    system,
    user: JSON.stringify(userPayload, null, 2),
  };
}

export { PROMPT_VERSION as TRIPLET_EXPLORATION_PROMPT_VERSION };
