export type ExplorationViewMode = "graph" | "query";

export type GraphNodePayload = {
  id: string;
  label: string;
  name: string;
  biography?: string;
  country?: string;
  active_years?: string;
  enrichment_source?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

export type GraphLinkPayload = {
  source: string;
  target: string;
  type: string;
};

export type RelatedEntityPreview = {
  id: string;
  label: string;
  name: string;
  relationshipType: string;
  direction: "inbound" | "outbound";
};

export type CountSummary = {
  key: string;
  count: number;
};

export type PropertyFact = {
  key: string;
  label: string;
  value: string;
};

export type QueryResultPayload = {
  id: string;
  entityType: string;
  name: string;
  query: string;
  summary: string;
  sourceBadges: string[];
  relatedEntityCounts: CountSummary[];
  relationshipCounts: CountSummary[];
  relatedItems: RelatedEntityPreview[];
  propertyFacts: PropertyFact[];
};

export type GraphPayload = {
  nodes: GraphNodePayload[];
  links: GraphLinkPayload[];
  focusNodeId?: string;
};
