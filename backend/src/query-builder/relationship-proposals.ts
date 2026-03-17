import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { QueryDirection } from "./types";

export type RelationshipProposalStatus = "proposed" | "accepted";

export interface RelationshipProposal {
  id: string;
  createdAt: string;
  updatedAt: string;
  relationshipType: string;
  sourcePhrase?: string;
  recommendedType?: string;
  aliasCandidates?: string[];
  direction: QueryDirection;
  fromLabel: string;
  toLabel: string;
  status: RelationshipProposalStatus;
  approvedAt?: string;
}

function getProposalFilePath(): string {
  return path.join(process.cwd(), "data", "query-builder-insights", "relationship-proposals.json");
}

function ensureProposalDirectory(): void {
  const filePath = getProposalFilePath();
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sameProposal(a: Omit<RelationshipProposal, "id" | "createdAt" | "updatedAt" | "status">, b: RelationshipProposal): boolean {
  return (
    a.relationshipType === b.relationshipType &&
    a.direction === b.direction &&
    a.fromLabel === b.fromLabel &&
    a.toLabel === b.toLabel
  );
}

export function loadRelationshipProposals(): RelationshipProposal[] {
  const filePath = getProposalFilePath();
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RelationshipProposal => {
      return Boolean(item && typeof item === "object" && typeof (item as RelationshipProposal).id === "string");
    });
  } catch {
    return [];
  }
}

function saveRelationshipProposals(items: RelationshipProposal[]): void {
  ensureProposalDirectory();
  writeFileSync(getProposalFilePath(), JSON.stringify(items, null, 2), "utf8");
}

export function upsertRelationshipProposal(input: {
  relationshipType: string;
  sourcePhrase?: string;
  recommendedType?: string;
  aliasCandidates?: string[];
  direction: QueryDirection;
  fromLabel: string;
  toLabel: string;
}): RelationshipProposal {
  const current = loadRelationshipProposals();
  const existing = current.find((item) => sameProposal(input, item));
  if (existing) {
    const updated: RelationshipProposal = {
      ...existing,
      sourcePhrase: input.sourcePhrase ?? existing.sourcePhrase,
      recommendedType: input.recommendedType ?? existing.recommendedType,
      aliasCandidates: Array.from(new Set([...(existing.aliasCandidates ?? []), ...(input.aliasCandidates ?? [])])),
      updatedAt: new Date().toISOString(),
    };
    const next = current.map((item) => (item.id === updated.id ? updated : item));
    saveRelationshipProposals(next);
    return updated;
  }

  const created: RelationshipProposal = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relationshipType: input.relationshipType,
    sourcePhrase: input.sourcePhrase,
    recommendedType: input.recommendedType,
    aliasCandidates: input.aliasCandidates ? Array.from(new Set(input.aliasCandidates)) : undefined,
    direction: input.direction,
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
    status: "proposed",
  };
  saveRelationshipProposals([created, ...current].slice(0, 2000));
  return created;
}

export function getRelationshipProposalById(id: string): RelationshipProposal | null {
  return loadRelationshipProposals().find((item) => item.id === id) ?? null;
}

export function markRelationshipProposalAccepted(id: string): RelationshipProposal | null {
  const current = loadRelationshipProposals();
  const target = current.find((item) => item.id === id);
  if (!target) return null;
  const updated: RelationshipProposal = {
    ...target,
    status: "accepted",
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveRelationshipProposals(current.map((item) => (item.id === id ? updated : item)));
  return updated;
}
