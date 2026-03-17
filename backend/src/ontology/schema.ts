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
  aliases?: string[];
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

function ensureEntityProperty(
  entity: OntologyEntitySchema,
  property: OntologyPropertySchema
): OntologyEntitySchema {
  const properties = [...(entity.properties ?? [])];
  const hasProperty = properties.some((entry) => entry.key === property.key);
  if (!hasProperty) properties.push(property);
  return {
    ...entity,
    properties,
  };
}

function enrichOntologySchema(schema: OntologySchema): OntologySchema {
  const nextEntities: Record<string, OntologyEntitySchema> = {};
  for (const [label, entity] of Object.entries(schema.entities)) {
    let nextEntity: OntologyEntitySchema = {
      ...entity,
      displayPropertyKeys: [...new Set([...(entity.displayPropertyKeys ?? []), "aliases"])],
    };
    nextEntity = ensureEntityProperty(nextEntity, {
      key: "aliases",
      type: "array",
      required: false,
      description: "Alternative names, stage names, and known aliases.",
    });
    if (label === "Person") {
      nextEntity = ensureEntityProperty(nextEntity, {
        key: "roles",
        type: "array",
        required: false,
        description: "One or more roles such as artist, producer, engineer, songwriter.",
      });
      nextEntity.displayPropertyKeys = [...new Set([...(nextEntity.displayPropertyKeys ?? []), "roles"])];
    }
    nextEntities[label] = nextEntity;
  }
  return {
    ...schema,
    entities: nextEntities,
  };
}

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
  cachedOntology = enrichOntologySchema(ensureOntologySchema(parsed));
  return cachedOntology;
}
