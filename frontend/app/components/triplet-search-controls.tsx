"use client";

import { Loader2, Search } from "lucide-react";
import {
  ENTITY_LABELS,
  getEntityDisplayName,
  type EntityLabel,
} from "@/lib/entity-config";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/lib/relationship-config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type TripletFormState = {
  subjectLabel: EntityLabel;
  subjectName: string;
  relationship: RelationshipType;
  objectLabel: EntityLabel;
  objectName: string;
  scopeLabel: EntityLabel;
  scopeName: string;
};

type TripletSearchControlsProps = {
  state: TripletFormState;
  onStateChange: (state: TripletFormState) => void;
  onSubmit: () => void;
  loading?: boolean;
  buttonLabel?: string;
};

const SUBJECT_PLACEHOLDER = "e.g. any, Paul Weller";
const OBJECT_PLACEHOLDER = "e.g. any, guitar";
const SCOPE_PLACEHOLDER = "e.g. Paul Weller";

export function TripletSearchControls({
  state,
  onStateChange,
  onSubmit,
  loading = false,
  buttonLabel = "Search",
}: TripletSearchControlsProps) {
  const update = (patch: Partial<TripletFormState>) => {
    onStateChange({ ...state, ...patch });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Subject
        </span>
        <select
          value={state.subjectLabel}
          onChange={(e) => update({ subjectLabel: e.target.value as EntityLabel })}
          className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Subject entity type"
        >
          {ENTITY_LABELS.map((label) => (
            <option key={label} value={label}>
              {getEntityDisplayName(label)}
            </option>
          ))}
        </select>
        <Input
          placeholder={SUBJECT_PLACEHOLDER}
          value={state.subjectName}
          onChange={(e) => update({ subjectName: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          className="h-9 w-48 min-w-0"
          aria-label={SUBJECT_PLACEHOLDER}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Relationship
        </span>
        <select
          value={state.relationship}
          onChange={(e) => update({ relationship: e.target.value as RelationshipType })}
          className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Relationship type"
        >
          {RELATIONSHIP_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Object
        </span>
        <select
          value={state.objectLabel}
          onChange={(e) => update({ objectLabel: e.target.value as EntityLabel })}
          className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Object entity type"
        >
          {ENTITY_LABELS.map((label) => (
            <option key={label} value={label}>
              {getEntityDisplayName(label)}
            </option>
          ))}
        </select>
        <Input
          placeholder={OBJECT_PLACEHOLDER}
          value={state.objectName}
          onChange={(e) => update({ objectName: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          className="h-9 w-48 min-w-0"
          aria-label={OBJECT_PLACEHOLDER}
        />
        <Button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="h-9"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          {loading ? "Loading..." : buttonLabel}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="scope-name-input"
          className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))] cursor-default"
        >
          Scope (optional)
        </label>
        <select
          value={state.scopeLabel}
          onChange={(e) => update({ scopeLabel: e.target.value as EntityLabel })}
          className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Scope entity type"
        >
          {ENTITY_LABELS.map((label) => (
            <option key={label} value={label}>
              {getEntityDisplayName(label)}
            </option>
          ))}
        </select>
        <Input
          id="scope-name-input"
          placeholder={SCOPE_PLACEHOLDER}
          value={state.scopeName}
          onChange={(e) => update({ scopeName: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          className="h-9 w-48 min-w-0"
          aria-label={SCOPE_PLACEHOLDER}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
