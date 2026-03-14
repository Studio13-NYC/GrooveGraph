export const RELATIONSHIP_TYPES = [
  "PERFORMED_BY",
  "WRITTEN_BY",
  "PRODUCED_BY",
  "RELEASED_ON",
  "RECORDED_AT",
  "RECORDED_IN_SESSION",
  "USED_EQUIPMENT",
  "PLAYED_INSTRUMENT",
  "RELEASED_BY",
  "ISSUED_BY_LABEL",
  "FEATURES",
  "MASTERED_BY",
  "ENGINEERED_BY",
  "PLAYED_ON",
  "MEMBER_OF",
  "CONTAINS",
  "COLLABORATED_WITH",
  "INFLUENCED_BY",
  "COVERS",
  "REMIXES",
  "CREDITS_PERSON",
  "HAS_VERSION",
  "PART_OF_GENRE",
  "PERFORMED_AT",
  "PARTICIPATED_IN",
  "USES_EFFECT",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

const RELATIONSHIP_DESCRIPTIONS: Record<RelationshipType, string> = {
  PERFORMED_BY: "A recorded track or work is performed by an artist or person.",
  WRITTEN_BY: "A work or recording is written by a person.",
  PRODUCED_BY: "A recording or release is produced by a person.",
  RELEASED_ON: "A track appears on an album or release.",
  RECORDED_AT: "A recording took place at a studio.",
  RECORDED_IN_SESSION: "A recording is part of a recording session.",
  USED_EQUIPMENT: "A studio, session, recording, or person used a piece of equipment.",
  PLAYED_INSTRUMENT: "A person or artist played an instrument.",
  RELEASED_BY: "A release or album was released by a label.",
  ISSUED_BY_LABEL: "A work or release was issued by a label.",
  FEATURES: "A recording or release features another artist or person.",
  MASTERED_BY: "A recording or release was mastered by a person.",
  ENGINEERED_BY: "A recording or release was engineered by a person.",
  PLAYED_ON: "A person or artist performed on a track, album, or release.",
  MEMBER_OF: "A person or artist is or was a member of a group.",
  CONTAINS: "A collection or release contains another work or recording.",
  COLLABORATED_WITH: "Two artists or people collaborated.",
  INFLUENCED_BY: "An entity was influenced by another entity.",
  COVERS: "One recording is a cover of another work or recording.",
  REMIXES: "One recording remixes another recording.",
  CREDITS_PERSON: "A credit entity refers to a person.",
  HAS_VERSION: "A work has a version, variant, or derivative recording.",
  PART_OF_GENRE: "An entity belongs to a genre.",
  PERFORMED_AT: "A performance took place at a venue.",
  PARTICIPATED_IN: "A person or artist participated in a performance or session.",
  USES_EFFECT: "A performer or recording uses an effect.",
};

export function isRelationshipType(value: string): value is RelationshipType {
  return RELATIONSHIP_TYPES.includes(value as RelationshipType);
}

export function getRelationshipDescription(type: RelationshipType): string {
  return RELATIONSHIP_DESCRIPTIONS[type];
}
