/**
 * Load the formal ontology schema for use by the app and LLM.
 * Reads from data/ontology/schema.json (canonical source).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OntologySchema } from "./types";

const ONTOLOGY_PATH = join(process.cwd(), "data", "ontology", "schema.json");

let cached: OntologySchema | null = null;

/**
 * Load and parse the ontology schema. Cached after first read.
 */
export function loadOntologySchema(): OntologySchema {
  if (cached) return cached;
  const raw = readFileSync(ONTOLOGY_PATH, "utf-8");
  cached = JSON.parse(raw) as OntologySchema;
  return cached;
}

/**
 * Reset cache (e.g. in tests or after schema hot-reload).
 */
export function clearOntologyCache(): void {
  cached = null;
}

/**
 * Entity labels in schema order (for prompts and validation).
 */
export function getOntologyEntityLabels(schema?: OntologySchema): string[] {
  const s = schema ?? loadOntologySchema();
  return Object.keys(s.entities);
}

/**
 * Relationship types in schema order.
 */
export function getOntologyRelationshipTypes(schema?: OntologySchema): string[] {
  const s = schema ?? loadOntologySchema();
  return s.relationships.map((r) => r.type);
}

/**
 * Resolve a label synonym (e.g. "song" -> "Track") using schema.labelSynonyms.
 */
export function resolveLabelSynonym(label: string, schema?: OntologySchema): string | null {
  const s = schema ?? loadOntologySchema();
  const lower = label.trim().toLowerCase();
  const resolved = s.labelSynonyms?.[lower];
  if (resolved && Object.prototype.hasOwnProperty.call(s.entities, resolved)) return resolved;
  if (Object.prototype.hasOwnProperty.call(s.entities, label)) return label;
  const entityLabel = Object.keys(s.entities).find((e) => e.toLowerCase() === lower);
  return entityLabel ?? null;
}

/**
 * Check if an entity can be the subject of a relationship (ontology-driven).
 */
export function canSubjectHaveRelationshipOntology(
  subjectLabel: string,
  relationshipType: string,
  schema?: OntologySchema
): boolean {
  const s = schema ?? loadOntologySchema();
  const entity = s.entities[subjectLabel];
  if (!entity?.allowedRelationshipsAsSubject) return false;
  return entity.allowedRelationshipsAsSubject.includes(relationshipType);
}

/**
 * Check if an entity can be the object of a relationship (ontology-driven).
 */
export function canObjectHaveRelationshipOntology(
  objectLabel: string,
  relationshipType: string,
  schema?: OntologySchema
): boolean {
  const s = schema ?? loadOntologySchema();
  const rel = s.relationships.find((r) => r.type === relationshipType);
  if (!rel?.objectLabels) return false;
  return rel.objectLabels.includes(objectLabel);
}

/**
 * Serialize the schema for inclusion in LLM prompts (search and enrichment).
 * Returns a concise text summary of entities, relationships, and rules.
 */
export function ontologySchemaForLlm(schema?: OntologySchema): string {
  const s = schema ?? loadOntologySchema();
  const lines: string[] = [
    `# ${s.name} (version ${s.version})`,
    s.description ?? "",
    "",
    "## Entity labels (use only these)",
  ];
  for (const [label, def] of Object.entries(s.entities)) {
    const props = def.displayPropertyKeys?.length
      ? `; display: ${def.displayPropertyKeys.join(", ")}`
      : "";
    const syn = def.synonyms?.length ? `; synonyms: ${def.synonyms.join(", ")}` : "";
    lines.push(`- ${label}: ${def.descriptionNoun}${props}${syn}`);
    if (def.allowedRelationshipsAsSubject?.length) {
      lines.push(`  outbound: ${def.allowedRelationshipsAsSubject.join(", ")}`);
    }
  }
  lines.push("", "## Relationship types (use only these)");
  for (const r of s.relationships) {
    const sub = r.subjectLabels?.length ? r.subjectLabels.join(", ") : "any";
    const obj = r.objectLabels?.length ? r.objectLabels.join(", ") : "any";
    lines.push(`- ${r.type}: ${r.description} (subject: ${sub} → object: ${obj})`);
    if (r.synonyms?.length) lines.push(`  synonyms: ${r.synonyms.join(", ")}`);
  }
  if (s.identityRules?.length) {
    lines.push("", "## Identity rules");
    for (const rule of s.identityRules) {
      lines.push(`- ${rule.labels.join(" + ")}: ${rule.note}`);
    }
  }
  if (s.labelSynonyms && Object.keys(s.labelSynonyms).length > 0) {
    lines.push("", "## Label synonyms (map to canonical label)");
    for (const [alias, canonical] of Object.entries(s.labelSynonyms)) {
      lines.push(`- ${alias} → ${canonical}`);
    }
  }
  return lines.join("\n");
}

/**
 * Build per-entity and per-relationship context messages for the LLM system prompt.
 * Only includes entities/relationships that have a contextMessage. Use this to add
 * richer guidance (when to use, examples, pitfalls) to the system message.
 */
export function ontologyContextMessagesForLlm(schema?: OntologySchema): string {
  const s = schema ?? loadOntologySchema();
  const lines: string[] = [];

  const entityMessages = Object.entries(s.entities)
    .filter(([, def]) => def.contextMessage?.trim())
    .map(([label, def]) => `### ${label}\n${def.contextMessage!.trim()}`);
  if (entityMessages.length > 0) {
    lines.push("## Entity context (use these for node candidates)", "", ...entityMessages, "");
  }

  const relMessages = s.relationships
    .filter((r) => r.contextMessage?.trim())
    .map((r) => `### ${r.type}\n${r.contextMessage!.trim()}`);
  if (relMessages.length > 0) {
    lines.push("## Relationship context (use these for edge candidates)", "", ...relMessages, "");
  }

  return lines.length > 0 ? lines.join("\n") : "";
}
