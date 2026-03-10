"use client";

import { Loader2, Search } from "lucide-react";
import {
  ENTITY_LABELS,
  getEntityDisplayName,
  getEntitySearchPlaceholder,
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
};

export function EntitySearchControls({
  entityType,
  query,
  onEntityTypeChange,
  onQueryChange,
  onSubmit,
  loading = false,
  buttonLabel = "Explore",
}: EntitySearchControlsProps) {
  return (
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
          placeholder={getEntitySearchPlaceholder(entityType)}
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
  );
}
