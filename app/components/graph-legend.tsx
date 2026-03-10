"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  ENTITY_LABELS,
  RELATIONSHIP_TYPES,
  getEntityDisplayName,
  getLinkColor,
  getNodeColor,
} from "../lib/graph-viz";

export function GraphLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span>Legend: entity and relationship types</span>
      </button>
      {open && (
        <div className="grid gap-6 border-t border-[hsl(var(--border))] p-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 font-medium text-[hsl(var(--foreground))]">Entities (nodes)</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {ENTITY_LABELS.map((label) => (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getNodeColor(label) }}
                    aria-hidden
                  />
                  <span className="text-xs">{getEntityDisplayName(label)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-medium text-[hsl(var(--foreground))]">Relationships (edges)</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {RELATIONSHIP_TYPES.map((type) => (
                <li key={type} className="flex items-center gap-1.5">
                  <span
                    className="h-0.5 w-3 shrink-0 rounded"
                    style={{ backgroundColor: getLinkColor(type) }}
                    aria-hidden
                  />
                  <span className="text-xs">{type.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
