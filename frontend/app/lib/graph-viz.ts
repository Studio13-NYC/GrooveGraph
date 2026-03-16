/**
 * Graph visualization: colors and legend for all domain model entity and relationship types.
 * Aligns with docs/DOMAIN_MODEL.md (17 node labels, 26 edge types).
 */

export {
  ENTITY_LABELS,
  getEntityDisplayName,
  type EntityLabel,
} from "@/lib/entity-config";
export { RELATIONSHIP_TYPES, type RelationshipType } from "@/lib/relationship-config";

/** HSL colors for each entity label. Saturation/lightness tuned for contrast on card background. */
const NODE_COLORS: Record<string, string> = {
  Artist: "hsl(262, 80%, 50%)",
  Album: "hsl(142, 70%, 40%)",
  Track: "hsl(210, 70%, 45%)",
  Instrument: "hsl(28, 85%, 48%)",
  Equipment: "hsl(25, 45%, 38%)",
  Studio: "hsl(172, 65%, 38%)",
  Person: "hsl(243, 65%, 52%)",
  Credit: "hsl(215, 20%, 45%)",
  Label: "hsl(158, 55%, 35%)",
  Performance: "hsl(330, 65%, 50%)",
  Effect: "hsl(192, 75%, 42%)",
  Genre: "hsl(280, 60%, 50%)",
  Playlist: "hsl(85, 55%, 42%)",
  Venue: "hsl(38, 75%, 45%)",
  SongWork: "hsl(200, 70%, 48%)",
  Session: "hsl(215, 25%, 50%)",
  Release: "hsl(310, 60%, 48%)",
};

/** Link colors by relationship type (grouped by semantics for readability). */
const LINK_COLOR_GROUP: Record<string, string> = {
  PERFORMED_BY: "hsl(262, 55%, 55%)",
  FEATURES: "hsl(262, 55%, 55%)",
  PLAYED_ON: "hsl(262, 55%, 55%)",
  PLAYED_INSTRUMENT: "hsl(262, 55%, 55%)",
  PARTICIPATED_IN: "hsl(262, 55%, 55%)",
  MEMBER_OF: "hsl(262, 55%, 55%)",
  RELEASED_ON: "hsl(142, 45%, 45%)",
  CONTAINS: "hsl(142, 45%, 45%)",
  RELEASED_BY: "hsl(142, 45%, 45%)",
  ISSUED_BY_LABEL: "hsl(142, 45%, 45%)",
  WRITTEN_BY: "hsl(28, 60%, 48%)",
  PRODUCED_BY: "hsl(28, 60%, 48%)",
  MASTERED_BY: "hsl(28, 60%, 48%)",
  ENGINEERED_BY: "hsl(28, 60%, 48%)",
  CREDITS_PERSON: "hsl(28, 60%, 48%)",
  RECORDED_AT: "hsl(172, 50%, 45%)",
  RECORDED_IN_SESSION: "hsl(172, 50%, 45%)",
  USED_EQUIPMENT: "hsl(25, 40%, 48%)",
  PERFORMED_AT: "hsl(330, 50%, 52%)",
  PART_OF_GENRE: "hsl(280, 50%, 55%)",
  USES_EFFECT: "hsl(192, 55%, 50%)",
  COLLABORATED_WITH: "hsl(200, 55%, 52%)",
  INFLUENCED_BY: "hsl(200, 55%, 52%)",
  COVERS: "hsl(310, 50%, 52%)",
  REMIXES: "hsl(310, 50%, 52%)",
  HAS_VERSION: "hsl(310, 50%, 52%)",
};

const DEFAULT_NODE_COLOR = "hsl(0, 0%, 50%)";
const DEFAULT_LINK_COLOR = "hsl(0, 0%, 55%)";

export function getNodeColor(label: string): string {
  return NODE_COLORS[label] ?? DEFAULT_NODE_COLOR;
}

export function getLinkColor(type: string): string {
  if (typeof type !== "string") return DEFAULT_LINK_COLOR;
  return LINK_COLOR_GROUP[type] ?? DEFAULT_LINK_COLOR;
}

