"use client";

import { Loader2, Search } from "lucide-react";
import {
  ENTITY_LABELS,
  getEntityDisplayName,
  type EntityLabel,
} from "@/lib/entity-config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type EntitySearchControlsProps = {
  entityType: EntityLabel;
  query: string;
  onEntityTypeChange: (value: EntityLabel) => void;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  buttonLabel?: string;
  /** When true, show scope/filter field (e.g. for triplet with "any"). */
  showScope?: boolean;
  scope?: string;
  onScopeChange?: (value: string) => void;
};

const QUERY_PLACEHOLDER = "Artist, album, or triplet (e.g. Album:any CONTAINS Track:any)";
const SCOPE_PLACEHOLDER = "Scope (e.g. Artist:Paul Weller)";

export function EntitySearchControls({
  entityType,
  query,
  onEntityTypeChange,
  onQueryChange,
  onSubmit,
  loading = false,
  buttonLabel = "Explore",
  showScope = false,
  scope = "",
  onScopeChange,
}: EntitySearchControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={entityType}
          onChange={(event) => onEntityTypeChange(event.target.value as EntityLabel)}
          className="flex h-10 min-w-[11rem] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Entity type"
        >
          {ENTITY_LABELS.map((label) => (
            <option key={label} value={label}>
              {getEntityDisplayName(label)}
            </option>
          ))}
        </select>
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder={QUERY_PLACEHOLDER}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSubmit()}
            className="w-full sm:max-w-md"
          />
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {loading ? "Loading..." : buttonLabel}
          </Button>
        </div>
      </div>
      {showScope && onScopeChange && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-[hsl(var(--muted-foreground))] whitespace-nowrap">Scope / filter</label>
          <Input
            placeholder={SCOPE_PLACEHOLDER}
            value={scope}
            onChange={(event) => onScopeChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSubmit()}
            className="max-w-xs"
          />
        </div>
      )}
    </div>
  );
}
