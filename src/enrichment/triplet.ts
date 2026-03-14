/**
 * Triplet specification for conjunction exploration: subject —[relationship]—> object.
 * Simple format: subjectType:subjectName RELATIONSHIP objectType:objectName
 * Example: artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar
 */

import { ENTITY_LABELS, isEntityLabel } from "../lib/entity-config";
import { RELATIONSHIP_TYPES, isRelationshipType } from "../lib/relationship-config";

export interface TripletEntity {
  label: string;
  name: string;
}

export interface TripletSpec {
  subject: TripletEntity;
  relationship: string;
  object: TripletEntity;
}

const LABELS_LOWER = new Set(ENTITY_LABELS.map((l) => l.toLowerCase()));
const REL_TYPES_UPPER = new Set(RELATIONSHIP_TYPES);

/** Normalize "any" placeholder: blank, "any", or "*" (case-insensitive) become "any". */
export function normalizeAnyPlaceholder(name: string): string {
  const t = name.trim();
  if (!t || t.toLowerCase() === "any" || t === "*") return "any";
  return t.replace(/_/g, " ");
}

/** True when name is the "any" placeholder (after normalization). */
export function isAnyPlaceholder(name: string): boolean {
  return normalizeAnyPlaceholder(name) === "any";
}

function normalizeLabel(value: string): string | null {
  const lower = value.trim().toLowerCase();
  const found = ENTITY_LABELS.find((l) => l.toLowerCase() === lower);
  return found ?? null;
}

function normalizeRelationship(value: string): string | null {
  const upper = value.trim().toUpperCase().replace(/-/g, "_");
  return RELATIONSHIP_TYPES.includes(upper as (typeof RELATIONSHIP_TYPES)[number]) ? upper : null;
}

/**
 * Parse a triplet string: subjectType:subjectName RELATIONSHIP objectType:objectName
 * Types are case-insensitive; relationship must be a valid RELATIONSHIP_TYPE (e.g. PLAYED_INSTRUMENT).
 * Subject and object names may contain spaces (e.g. artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar).
 */
export function parseTripletSpec(spec: string): TripletSpec | null {
  const s = spec.trim();
  if (!s) return null;

  const parts = s.split(/\s+/);
  if (parts.length < 3) return null;

  const relIndex = parts.findIndex((p) => normalizeRelationship(p) !== null);
  if (relIndex < 0) return null;

  const subjectSpec = parts.slice(0, relIndex).join(" ");
  const relationship = normalizeRelationship(parts[relIndex]!);
  const objectSpec = parts.slice(relIndex + 1).join(" ");
  if (!subjectSpec || !relationship || !objectSpec) return null;

  const subjectColon = subjectSpec.indexOf(":");
  const objectColon = objectSpec.indexOf(":");
  if (subjectColon <= 0 || objectColon <= 0) return null;

  const subjectLabel = normalizeLabel(subjectSpec.slice(0, subjectColon));
  const subjectName = normalizeAnyPlaceholder(subjectSpec.slice(subjectColon + 1));
  const objectLabel = normalizeLabel(objectSpec.slice(0, objectColon));
  const objectName = normalizeAnyPlaceholder(objectSpec.slice(objectColon + 1));

  if (!subjectLabel || !subjectName || !objectLabel || !objectName) return null;

  return {
    subject: { label: subjectLabel, name: subjectName },
    relationship,
    object: { label: objectLabel, name: objectName },
  };
}

/**
 * Format a triplet for display, e.g. "Artist: Paul Weller — PLAYED_INSTRUMENT — Instrument: guitar"
 */
export function formatTripletSpec(triplet: TripletSpec): string {
  return `${triplet.subject.label}: ${triplet.subject.name} — ${triplet.relationship} — ${triplet.object.label}: ${triplet.object.name}`;
}

/**
 * Example specs for UI placeholder or help.
 */
export const TRIPLET_EXAMPLES = [
  "artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar",
  "album:any CONTAINS track:any",
  "artist:Adrian Belew MEMBER_OF artist:King Crimson",
  "artist:David Bowie COLLABORATED_WITH person:Brian Eno",
  "artist:The Who PART_OF_GENRE genre:rock",
] as const;

/**
 * Parse scope string to { label, name } for scoped triplet expansion.
 * Accepts "Paul Weller" (defaults to Artist) or "artist:Paul Weller".
 */
export function parseScopeSpec(scope: string): { label: string; name: string } | null {
  const s = scope.trim();
  if (!s) return null;
  const colon = s.indexOf(":");
  if (colon <= 0) {
    const label = normalizeLabel("Artist");
    const name = s.replace(/_/g, " ").trim();
    if (!label || !name) return null;
    return { label: label, name };
  }
  const label = normalizeLabel(s.slice(0, colon));
  const name = s.slice(colon + 1).trim().replace(/_/g, " ");
  if (!label || !name) return null;
  return { label, name };
}

export function isTripletSpec(value: unknown): value is TripletSpec {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  const sub = t.subject;
  const obj = t.object;
  if (!sub || typeof sub !== "object" || !obj || typeof obj !== "object") return false;
  const s = sub as Record<string, unknown>;
  const o = obj as Record<string, unknown>;
  return (
    typeof s.label === "string" &&
    typeof s.name === "string" &&
    typeof t.relationship === "string" &&
    typeof o.label === "string" &&
    typeof o.name === "string" &&
    isEntityLabel(s.label) &&
    isEntityLabel(o.label) &&
    isRelationshipType(t.relationship as string)
  );
}
