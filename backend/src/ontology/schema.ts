import { readFileSync } from "node:fs";
import path from "node:path";

export interface OntologyPropertySchema {
  key: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface OntologyEntitySchema {
  displayName?: string;
  descriptionNoun?: string;
  description?: string;
  displayPropertyKeys?: string[];
  properties?: OntologyPropertySchema[];
  allowedRelationshipsAsSubject?: string[];
  allowedRelationshipsAsObject?: string[];
  constraints?: Record<string, unknown>;
  synonyms?: string[];
  contextMessage?: string;
}

export interface OntologyRelationshipSchema {
  type: string;
  description?: string;
  subjectLabels: string[];
  objectLabels: string[];
  synonyms?: string[];
  contextMessage?: string;
}

export interface OntologyIdentityRule {
  labels: string[];
  note: string;
}

export interface OntologySchema {
  name?: string;
  version?: string;
  description?: string;
  entities: Record<string, OntologyEntitySchema>;
  relationships: OntologyRelationshipSchema[];
  identityRules?: OntologyIdentityRule[];
  labelSynonyms?: Record<string, string>;
}

let cachedOntology: OntologySchema | null = null;

function ensureOntologySchema(raw: unknown): OntologySchema {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Ontology schema must be an object.");
  }
  const maybeSchema = raw as Partial<OntologySchema>;
  if (!maybeSchema.entities || typeof maybeSchema.entities !== "object") {
    throw new Error("Ontology schema is missing entities.");
  }
  if (!Array.isArray(maybeSchema.relationships)) {
    throw new Error("Ontology schema is missing relationships.");
  }
  return maybeSchema as OntologySchema;
}

export function getOntologySchemaPath(): string {
  return path.join(process.cwd(), "data", "ontology", "schema.json");
}

export function loadOntologySchema(options?: { forceReload?: boolean }): OntologySchema {
  if (cachedOntology && !options?.forceReload) return cachedOntology;
  const schemaPath = getOntologySchemaPath();
  const raw = readFileSync(schemaPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  cachedOntology = ensureOntologySchema(parsed);
  return cachedOntology;
}
