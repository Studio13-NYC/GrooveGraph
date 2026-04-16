export type ExtractOptions = {
  use_aliases?: boolean;
  use_model?: boolean;
};

export type EntityTypePayload = {
  name: string;
  aliases?: string[];
};

export type KnownEntityPayload = {
  label: string;
  /** Canonical surface form */
  canonical?: string;
  /** Handoff / Python alias for `canonical` */
  canonical_text?: string;
  aliases?: string[];
};

export type EntitySchemaPayload = {
  /** String ids and/or `{ name, aliases }` objects (matches Python BeforeValidator). */
  entityTypes?: (string | EntityTypePayload)[];
  knownEntities?: KnownEntityPayload[];
};

export type ExtractRequest = {
  text: string;
  labels?: string[];
  options?: ExtractOptions;
  /** Runtime known entities + aliases (JSON key `schema` on the wire). */
  schema?: EntitySchemaPayload;
};

export type EntityCandidate = {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence: number;
};

export type ExtractResponse = {
  entities: EntityCandidate[];
};

export type HealthResponse = {
  ok: boolean;
};
