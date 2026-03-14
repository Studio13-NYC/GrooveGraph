import {
  ENTITY_LABELS,
  getEntityDescriptionNoun,
  getEntityDisplayName,
  getEntityDisplayPropertyKeys,
} from "../../lib/entity-config";
import {
  RELATIONSHIP_TYPES,
  getRelationshipDescription,
  type RelationshipType,
} from "../../lib/relationship-config";
import type { ResearchOntologyContext } from "../types";

export const SYNTHETIC_ENTITY_LABELS = ["EntityType"];
export const SYNTHETIC_RELATIONSHIP_TYPES = ["IS_A", "RELATED_TYPE"];
export const ENRICHMENT_PROMPT_VERSION = "2026-03-11.1";

export function buildResearchOntologyContext(): ResearchOntologyContext {
  return {
    allowedEntityLabels: [...ENTITY_LABELS],
    allowedRelationshipTypes: [...RELATIONSHIP_TYPES],
    syntheticLabels: [...SYNTHETIC_ENTITY_LABELS],
    syntheticRelationshipTypes: [...SYNTHETIC_RELATIONSHIP_TYPES],
    dualIdentityRules: [
      {
        labels: ["Artist", "Person"],
        note: "If a real-world human is an artist, treat Artist and Person as the same identity. Match or create a single dual-labeled node instead of split duplicates.",
      },
    ],
    entityDefinitions: ENTITY_LABELS.map((label) => ({
      label,
      displayName: getEntityDisplayName(label),
      descriptionNoun: getEntityDescriptionNoun(label),
      displayPropertyKeys: getEntityDisplayPropertyKeys(label),
    })),
    relationshipDefinitions: RELATIONSHIP_TYPES.map((type) => ({
      type,
      description: getRelationshipDescription(type as RelationshipType),
    })),
  };
}
