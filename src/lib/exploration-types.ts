export type GraphNodeKind = "focus" | "type_hub" | "entity";

export type ExplorationViewMode = "graph" | "query";

export type GraphNodePayload = {
  id: string;
  label: string;
  name: string;
  labels?: string[];
  nodeKind?: GraphNodeKind;
  entityLabel?: string;
  groupKey?: string;
  relatedCount?: number;
  hiddenByDefault?: boolean;
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
  groupKey?: string;
  hiddenByDefault?: boolean;
  relationshipCount?: number;
  isSynthetic?: boolean;
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
  labels: string[];
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
