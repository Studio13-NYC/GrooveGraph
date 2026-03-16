/**
 * Schema and prompt for the LLM-only enrichment pipeline.
 * Presents the model with entity/relationship JSON formats and clear usage context.
 */

import type { TripletSpec } from "../triplet";
import type { ResearchOntologyContext, ReviewTargetEntity } from "../types";
import { buildResearchOntologyContext } from "../llm/ontology-context";

const PROMPT_VERSION = "2026-03-12.0";

const LLM_PROVENANCE = {
  source_id: "gpt-5.4",
  source_name: "GPT-5.4",
  source_type: "api" as const,
  url: "https://openai.com/gpt-5.4",
  retrieved_at: new Date().toISOString(),
  confidence: "high" as const,
};

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
Return a single JSON object with these top-level keys:
- sessionId (string): must match the sessionId in the request
- generatedAt (string): ISO 8601 timestamp
- summary (string): one sentence describing what you proposed
- targets (array): copy of the targets from the request
- propertyChanges (array): updates to existing target nodes
- nodeCandidates (array): new or related entities to add
- edgeCandidates (array): relationships between entities
- metadata (object): { "generator": "llm", "provider": "OpenAI", "model": "gpt-5.4", "promptVersion": "${PROMPT_VERSION}" }

### propertyChanges (each item)
- candidateId (string): unique id, e.g. "prop-{targetId}-{key}"
- targetId (string): id of the target entity being updated
- key (string): property name, e.g. biography, country, active_years
- value (string or array): the new value
- confidence: "high" | "medium" | "low"
- provenance (array): at least one item with source_id, source_name, source_type, url, retrieved_at, confidence. For this pipeline use: source_id "gpt-5.4", source_name "GPT-5.4", source_type "api", url "https://openai.com/gpt-5.4"

### nodeCandidates (each item)
- candidateId (string): unique id, e.g. "node-{slug}"
- label (string): primary label from the entity list above
- labels (array): include both if human artist, e.g. ["Artist", "Person"]
- name (string): display name
- canonicalKey (string): lowercase slug, e.g. "artist:king-crimson"
- properties (object): e.g. { "name": "King Crimson" }
- confidence: "high" | "medium" | "low"
- provenance (array): same shape as above
- matchStatus: "create_new" or "matched_existing"
- reviewStatus: "pending"

### edgeCandidates (each item)
- candidateId (string): unique id, e.g. "edge-{type}-{from}-{to}"
- type (string): one of the relationship types above
- fromRef (object): { "kind": "target"|"candidate"|"existing", "id": "<targetId or candidateId>" }
- toRef (object): same shape
- confidence: "high" | "medium" | "low"
- provenance (array): same shape as above
- matchStatus: "create_new"
- reviewStatus: "pending"

Rules:
- For the same human who is an artist, use labels ["Artist", "Person"] and a single node (dual identity).
- fromRef/toRef: use kind "target" and the target id when the endpoint is one of the enrichment targets; use kind "candidate" and the candidateId when linking to a node you are proposing in nodeCandidates.
- Do not use synthetic types: no IS_A, RELATED_TYPE, or EntityType.
- Prefer high confidence; use medium/low only when uncertain. Omit speculative candidates if evidence is weak.
`;
}

export function buildLlmOnlyPrompt(
  sessionId: string,
  targets: ReviewTargetEntity[],
  ontology?: ResearchOntologyContext,
  triplet?: TripletSpec
): { system: string; user: string } {
  const ontologyContext = ontology ?? buildResearchOntologyContext();
  const schemaBlock = buildSchemaBlock(ontologyContext);

  const system = [
    "You are an expert music-knowledge researcher. Your task is to propose enrichment data for a property graph that represents music entities and their relationships.",
    "The graph is used to: connect artists, bands, albums, tracks, producers, and collaborators; support search and discovery; and power recommendations and lineage.",
    "You will receive one or more target entities (e.g. an artist name) to enrich. Propose:",
    "1. Property changes: factual properties for the target(s), e.g. biography, country, active_years.",
    "2. Node candidates: related entities that should exist in the graph (bands they were in, people they collaborated with, genres, labels, or relationship-specific entities when a triplet context is given).",
    "3. Edge candidates: relationships between the target(s) and those nodes (MEMBER_OF, COLLABORATED_WITH, PRODUCED_BY, PART_OF_GENRE, PLAYED_INSTRUMENT, etc.).",
    "Return only valid JSON. No markdown, no commentary outside the JSON object.",
    schemaBlock,
  ].join("\n\n");

  const instructions: string[] = [
    "Enrich the following target(s) using your knowledge of music history, bands, and collaborations.",
    "Include bands they have been in (MEMBER_OF), producers or artists they have worked with (COLLABORATED_WITH or PRODUCED_BY), and genres (PART_OF_GENRE) where relevant.",
  ];

  if (triplet) {
    const sub = `${triplet.subject.label}: ${triplet.subject.name}`;
    const obj = `${triplet.object.label}: ${triplet.object.name}`;
    instructions.push(
      `CRITICAL — Triplet context: (${sub}) —[${triplet.relationship}]—> (${obj}). You MUST propose node candidates of type ${triplet.object.label} that the subject is linked to by this relationship (e.g. specific ${triplet.object.label}s such as named guitars, studios, or people), and edge candidates of type ${triplet.relationship} from the subject target to each such node. Example: for Artist: Paul Weller and Instrument: guitar, propose Instrument nodes (e.g. Fender Telecaster, Rickenbacker 330) and PLAYED_INSTRUMENT edges from Paul Weller to each.`
    );
  }

  instructions.push(
    "Use only the entity labels and relationship types defined in the schema. Every candidate must include a provenance array with source_id 'gpt-5.4', source_name 'GPT-5.4', source_type 'api', url 'https://openai.com/gpt-5.4', retrieved_at (ISO string), and confidence."
  );

  const userPayload = {
    sessionId,
    generatedAt: new Date().toISOString(),
    targets,
    ...(triplet && {
      tripletContext: {
        subject: triplet.subject,
        relationship: triplet.relationship,
        object: triplet.object,
      },
    }),
    instructions,
  };

  return {
    system,
    user: JSON.stringify(userPayload, null, 2),
  };
}

export function getLlmOnlyProvenance(): typeof LLM_PROVENANCE {
  return { ...LLM_PROVENANCE, retrieved_at: new Date().toISOString() };
}

export { PROMPT_VERSION as LLM_ONLY_PROMPT_VERSION };
