import {
  loadOntologySchema,
  type OntologyEntitySchema,
  type OntologyRelationshipSchema,
  type OntologySchema,
} from "./schema";

export interface OntologyRuntime {
  schema: OntologySchema;
  entityLabels: string[];
  relationshipTypes: string[];
  getEntity(label: string): OntologyEntitySchema | null;
  getRelationship(type: string): OntologyRelationshipSchema | null;
  resolveEntityLabel(input: string): string | null;
  resolveRelationshipType(input: string): string | null;
  getAllowedOutgoingRelationshipTypes(label: string): string[];
  getAllowedIncomingRelationshipTypes(label: string): string[];
}

interface RuntimeIndex {
  entityByLabel: Map<string, OntologyEntitySchema>;
  relationshipByType: Map<string, OntologyRelationshipSchema>;
  normalizedEntityLookup: Map<string, string>;
  normalizedRelationshipLookup: Map<string, string>;
}

let cachedRuntime: OntologyRuntime | null = null;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function pushLookup(lookup: Map<string, string>, key: string, canonical: string): void {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  if (!lookup.has(normalized)) {
    lookup.set(normalized, canonical);
  }
}

function buildRuntimeIndex(schema: OntologySchema): RuntimeIndex {
  const entityByLabel = new Map<string, OntologyEntitySchema>();
  const relationshipByType = new Map<string, OntologyRelationshipSchema>();
  const normalizedEntityLookup = new Map<string, string>();
  const normalizedRelationshipLookup = new Map<string, string>();

  for (const [label, entity] of Object.entries(schema.entities)) {
    entityByLabel.set(label, entity);
    pushLookup(normalizedEntityLookup, label, label);
    for (const synonym of entity.synonyms ?? []) {
      pushLookup(normalizedEntityLookup, synonym, label);
    }
  }

  for (const [synonym, label] of Object.entries(schema.labelSynonyms ?? {})) {
    if (entityByLabel.has(label)) {
      pushLookup(normalizedEntityLookup, synonym, label);
    }
  }

  for (const relationship of schema.relationships) {
    relationshipByType.set(relationship.type, relationship);
    pushLookup(normalizedRelationshipLookup, relationship.type, relationship.type);
    for (const synonym of [...(relationship.synonyms ?? []), ...(relationship.aliases ?? [])]) {
      pushLookup(normalizedRelationshipLookup, synonym, relationship.type);
    }
  }

  return {
    entityByLabel,
    relationshipByType,
    normalizedEntityLookup,
    normalizedRelationshipLookup,
  };
}

function createRuntime(schema: OntologySchema): OntologyRuntime {
  const index = buildRuntimeIndex(schema);

  const resolveEntityLabel = (input: string): string | null => {
    const normalized = normalizeKey(input);
    if (!normalized) return null;
    return index.normalizedEntityLookup.get(normalized) ?? null;
  };

  const resolveRelationshipType = (input: string): string | null => {
    const normalized = normalizeKey(input);
    if (!normalized) return null;
    return index.normalizedRelationshipLookup.get(normalized) ?? null;
  };

  const getEntity = (label: string): OntologyEntitySchema | null => {
    const canonical = resolveEntityLabel(label);
    if (!canonical) return null;
    return index.entityByLabel.get(canonical) ?? null;
  };

  const getRelationship = (type: string): OntologyRelationshipSchema | null => {
    const canonical = resolveRelationshipType(type);
    if (!canonical) return null;
    return index.relationshipByType.get(canonical) ?? null;
  };

  const getAllowedOutgoingRelationshipTypes = (label: string): string[] => {
    const canonicalLabel = resolveEntityLabel(label);
    if (!canonicalLabel) return [];
    return schema.relationships
      .filter((relationship) => relationship.subjectLabels.includes(canonicalLabel))
      .map((relationship) => relationship.type);
  };

  const getAllowedIncomingRelationshipTypes = (label: string): string[] => {
    const canonicalLabel = resolveEntityLabel(label);
    if (!canonicalLabel) return [];
    return schema.relationships
      .filter((relationship) => relationship.objectLabels.includes(canonicalLabel))
      .map((relationship) => relationship.type);
  };

  return {
    schema,
    entityLabels: [...index.entityByLabel.keys()],
    relationshipTypes: [...index.relationshipByType.keys()],
    getEntity,
    getRelationship,
    resolveEntityLabel,
    resolveRelationshipType,
    getAllowedOutgoingRelationshipTypes,
    getAllowedIncomingRelationshipTypes,
  };
}

export function loadOntologyRuntime(options?: { forceReload?: boolean }): OntologyRuntime {
  if (cachedRuntime && !options?.forceReload) {
    return cachedRuntime;
  }

  const schema = loadOntologySchema(options);
  cachedRuntime = createRuntime(schema);
  return cachedRuntime;
}
