import { loadOntologySchema } from "../../ontology";
import type { ResearchOntologyContext } from "../types";

export const SYNTHETIC_ENTITY_LABELS = ["EntityType"];
export const SYNTHETIC_RELATIONSHIP_TYPES = ["IS_A", "RELATED_TYPE"];
export const ENRICHMENT_PROMPT_VERSION = "2026-03-11.1";

function formatDescriptionNoun(label: string): string {
  return label.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function buildResearchOntologyContext(): ResearchOntologyContext {
  const schema = loadOntologySchema();
  const entityLabels = Object.keys(schema.entities);
  const relationshipTypes = schema.relationships.map((relationship) => relationship.type);

  return {
    allowedEntityLabels: entityLabels,
    allowedRelationshipTypes: relationshipTypes,
    syntheticLabels: [...SYNTHETIC_ENTITY_LABELS],
    syntheticRelationshipTypes: [...SYNTHETIC_RELATIONSHIP_TYPES],
    dualIdentityRules:
      schema.identityRules?.map((rule) => ({ labels: rule.labels, note: rule.note })) ?? [],
    entityDefinitions: entityLabels.map((label) => {
      const entity = schema.entities[label];
      return {
        label,
        displayName: entity.displayName ?? label,
        descriptionNoun: entity.descriptionNoun ?? formatDescriptionNoun(label),
        displayPropertyKeys: entity.displayPropertyKeys ?? ["name", "title", "venue"],
      };
    }),
    relationshipDefinitions: schema.relationships.map((relationship) => ({
      type: relationship.type,
      description: relationship.description ?? "",
    })),
  };
}
