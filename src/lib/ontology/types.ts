/**
 * Types for the formal ontology schema (data/ontology/schema.json).
 */

export interface OntologyPropertyDef {
  key: string;
  description?: string;
}

export interface OntologyEntityDef {
  descriptionNoun: string;
  displayPropertyKeys?: string[];
  synonyms?: string[];
  allowedRelationshipsAsSubject?: string[];
  contextMessage?: string;
}

export interface OntologyRelationshipDef {
  type: string;
  description: string;
  subjectLabels?: string[];
  objectLabels?: string[];
  synonyms?: string[];
  contextMessage?: string;
}

export interface OntologyIdentityRule {
  labels: string[];
  note: string;
}

export interface OntologySchema {
  name: string;
  version: string;
  description?: string;
  entities: Record<string, OntologyEntityDef>;
  relationships: OntologyRelationshipDef[];
  identityRules?: OntologyIdentityRule[];
  labelSynonyms?: Record<string, string>;
}
