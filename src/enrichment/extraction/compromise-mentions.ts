/**
 * Compromise-based mention extraction (Phase 2). Uses compromise NER for
 * people, places, and organizations; maps to ExtractionMention with spans.
 * Use for stronger NER alongside or instead of rule-based mentions.
 */

import nlp from "compromise";
import type { ConfidenceLevel } from "../types";
import type { ExtractionMention } from "../types";
import type { ResearchOntologyContext } from "../types";

const DEFAULT_LABEL = "Artist";

type EntityKind = "Person" | "Place" | "Organization";

/** Map compromise entity kind to ontology label when possible. */
function labelForKind(
  kind: EntityKind,
  ontology: ResearchOntologyContext
): string {
  const allowed = ontology.allowedEntityLabels ?? [];
  if (kind === "Person" && (allowed.includes("Artist") || allowed.includes("Person")))
    return allowed.includes("Person") ? "Person" : "Artist";
  if (kind === "Organization" && allowed.includes("Artist")) return "Artist";
  if (kind === "Place" && allowed.includes("Place")) return "Place";
  return allowed[0] ?? DEFAULT_LABEL;
}

interface CompromiseOffset {
  start: number;
  length?: number;
  end?: number;
}

interface CompromiseJsonItem {
  text: string;
  offset?: CompromiseOffset;
  terms?: Array<{ text: string; offset?: CompromiseOffset }>;
}

/** Compute span from compromise .json() item (offset has start + length). */
function spanFromItem(item: CompromiseJsonItem): { start: number; end: number } {
  const o = item.offset;
  if (o && typeof o.start === "number") {
    const length = o.length ?? item.text?.length ?? 0;
    return { start: o.start, end: o.start + length };
  }
  const firstTerm = item.terms?.[0];
  if (firstTerm?.offset && typeof firstTerm.offset.start === "number") {
    const len = firstTerm.offset.length ?? firstTerm.text?.length ?? 0;
    return { start: firstTerm.offset.start, end: firstTerm.offset.start + len };
  }
  return { start: 0, end: item.text?.length ?? 0 };
}

/**
 * Extract mentions from text using compromise (people, places, organizations).
 * Returns ExtractionMention[] with span and label; relations are not extracted here.
 */
export function extractMentionsWithCompromise(
  text: string,
  ontology: ResearchOntologyContext,
  options?: {
    defaultLabel?: string;
    confidence?: ConfidenceLevel;
    sourceId?: string;
  }
): ExtractionMention[] {
  const confidence = options?.confidence ?? "medium";
  const sourceId = options?.sourceId;
  const doc = nlp(text);
  const mentions: ExtractionMention[] = [];
  let index = 0;

  const addFromView = (
    view: { json: (opts?: { offset?: boolean }) => CompromiseJsonItem[] },
    kind: EntityKind
  ) => {
    try {
      const json = view.json({ offset: true }) as CompromiseJsonItem[];
      if (!Array.isArray(json)) return;
      for (const item of json) {
        const termText = item.text?.trim();
        if (!termText || termText.length < 2) continue;
        const span = spanFromItem(item);
        const label = labelForKind(kind, ontology);
        mentions.push({
          id: `compromise-${index}`,
          text: termText,
          label,
          span,
          sourceId,
          confidence,
        });
        index += 1;
      }
    } catch {
      // ignore parse errors for this view
    }
  };

  addFromView(doc.people(), "Person");
  addFromView(doc.places(), "Place");
  addFromView(doc.organizations(), "Organization");

  return mentions;
}
