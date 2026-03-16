I can do the **spec and implementation plan now**, but this is **not yet a true code review** because I only have the ontology docs and schema, not the TypeScript UI codebase itself.

What I *can* review is the **schema as the foundation for a query-builder module**.

## Executive assessment

Your ontology is a strong base for a schema-driven query builder because it already includes the exact primitives needed to drive progressive, valid-only choices:

* per-entity outbound/inbound relationship permissions via `allowedRelationshipsAsSubject` and `allowedRelationshipsAsObject` 
* per-relationship endpoint constraints via `subjectLabels` and `objectLabels` 
* friendly UI metadata like `displayName`, `synonyms`, `description`, and `displayPropertyKeys` 
* identity normalization rules such as `Artist + Person` dual-label handling 
* alias normalization through `labelSynonyms` 

That means you do **not** need to hardcode most query-builder behavior into UI logic. The UI module should be a **runtime interpreter of the ontology**, not a manually curated form system.

---

# Review of the current ontology for query-builder use

## What is already good

### 1. The schema is already query-builder-oriented

The schema is not just descriptive; it is operational. The docs explicitly say it is used for validation and enforcing which relationship types can connect which entity types. 

That is exactly what a dynamic query builder needs.

### 2. Entity metadata is good enough for user-facing labels

Each entity includes:

* `displayName`
* `descriptionNoun`
* `description`
* `displayPropertyKeys`
* `properties`
* `synonyms` 

That is enough to support:

* friendly labels in menus
* help text/tooltips
* “best label” rendering for node pills
* property picker defaults per entity type

### 3. Relationship constraints are explicit

Relationships define `subjectLabels` and `objectLabels`, which makes relevance filtering deterministic. For example:

* `CONTAINS`: subject = `Album | Playlist | Release`, object = `Track | SongWork`
* `PERFORMED_BY`: subject = `Track | SongWork`, object = `Artist`
* `PART_OF_GENRE`: subject = `Artist | Track | SongWork`, object = `Genre` 

This is the core of your “only show valid next choices” requirement.

### 4. There is clear support for canonicalization

`labelSynonyms` and per-entity `synonyms` mean the builder can support search terms like “band” and still map them to `Artist`. 

That is useful for a type-ahead UX.

---

## Gaps and issues to address before UI modularization

### 1. Directionality is not enough by itself

You have:

* allowed outgoing relationship types
* allowed incoming relationship types
* valid subject/object labels

But for a polished builder, you also need a richer **UI-facing relationship definition** layer.

Add fields like:

```ts
uiLabelForward
uiLabelReverse
category
strength
examplePhrases
defaultDirection
searchable
```

Example:

```json
{
  "type": "PERFORMED_BY",
  "uiLabelForward": "performed by",
  "uiLabelReverse": "performed",
  "category": "credits",
  "defaultDirection": "outbound",
  "searchable": true
}
```

Without this, the builder may be valid but still feel technical.

### 2. Property metadata is too thin for advanced filtering

Properties currently have `key`, `type`, `required`, and optional `description`. 

For a serious query builder, add:

```ts
filterOperators
uiControl
enumValues
suggestFromIndex
sortable
defaultVisible
format
placeholder
```

Example:

```json
{ 
  "key": "release_date",
  "type": "date",
  "filterOperators": ["=", "before", "after", "between"],
  "uiControl": "dateRange",
  "sortable": true
}
```

### 3. Ambiguity around dual labels needs explicit UI handling

The ontology has an identity rule saying `Artist` and `Person` may be the same real-world node. 

That is valuable, but the builder must define how this behaves in the UI:

* show as one selectable “Artist / Person” entity?
* show canonical type plus badge?
* allow both in query state?
* how should chips render when a returned node has multiple labels?

This must be specified or your UI logic will drift.

### 4. `allowedRelationshipsAsSubject` duplicates information already in `relationships`

You have both:

* entity-level allowed relationship lists
* relationship-level endpoint definitions

That is convenient for performance, but it creates drift risk.

Recommendation:

* treat `relationships[].subjectLabels/objectLabels` as canonical
* derive entity allowed lists at build/load time
* or validate both structures against each other in CI

### 5. No explicit query-builder grammar yet

You need to define whether the builder supports:

* linear paths only
* branching patterns
* multiple root clauses
* OR groups
* negation
* aggregation
* existential clauses
* nested filters

Without that, “query builder” stays underspecified.

---

# Recommended product shape

Build this as a **headless TypeScript query-builder engine + React UI layer**.

## Architecture

### Layer 1 — Ontology adapter

Responsible for reading `schema.json` and producing a normalized in-memory model.

### Layer 2 — Query graph engine

Maintains builder state and computes valid next actions.

### Layer 3 — Cypher compiler

Compiles builder state into parameterized Cypher.

### Layer 4 — UI module

Renders chips, pickers, path rows, filter controls, previews, and result summaries.

### Layer 5 — Search/data provider adapter

Fetches type-ahead suggestions and executes compiled queries against Neo4j.

---

# Module spec

## Proposed package structure

```ts
src/
  modules/
    graph-query-builder/
      core/
        ontology-types.ts
        ontology-normalizer.ts
        query-state.ts
        validators.ts
        next-options.ts
        cypher-compiler.ts
        display.ts
      adapters/
        neo4j-provider.ts
        suggestion-provider.ts
      ui/
        QueryBuilder.tsx
        QueryStepRow.tsx
        NodeSelector.tsx
        RelationshipSelector.tsx
        PropertyFilterEditor.tsx
        QueryPreview.tsx
        ResultSummary.tsx
      hooks/
        useQueryBuilder.ts
      tests/
        ontology-normalizer.test.ts
        next-options.test.ts
        cypher-compiler.test.ts
```

---

## Core TypeScript interfaces

```ts
export type EntityLabel = string;
export type RelationshipType = string;

export interface OntologyProperty {
  key: string;
  type?: "string" | "number" | "boolean" | "date" | "array";
  required?: boolean;
  description?: string;
  filterOperators?: string[];
  uiControl?: string;
  enumValues?: string[];
}

export interface OntologyEntity {
  label: EntityLabel;
  displayName: string;
  description?: string;
  displayPropertyKeys: string[];
  properties: OntologyProperty[];
  synonyms?: string[];
  contextMessage?: string;
}

export interface OntologyRelationship {
  type: RelationshipType;
  description?: string;
  subjectLabels: EntityLabel[];
  objectLabels: EntityLabel[];
  synonyms?: string[];
  uiLabelForward?: string;
  uiLabelReverse?: string;
}

export interface NormalizedOntology {
  entities: Record<EntityLabel, OntologyEntity>;
  relationships: Record<RelationshipType, OntologyRelationship>;
  labelSynonyms: Record<string, EntityLabel>;
}
```

---

## Query-state model

Use an internal graph, not a flat form.

```ts
export interface QueryNodeRef {
  id: string;
  label: EntityLabel | null;
  selectedNodeId?: string;      // existing db node
  displayValue?: string;        // user-visible label
  filters: PropertyFilter[];
}

export interface QueryEdgeRef {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: RelationshipType | null;
  direction: "outbound" | "inbound";
}

export interface PropertyFilter {
  propertyKey: string;
  operator: string;
  value: unknown;
}

export interface QueryGraphState {
  rootNodeId: string;
  nodes: QueryNodeRef[];
  edges: QueryEdgeRef[];
}
```

---

# Behavior spec

## Primary UX rules

### 1. Start with a root entity

The builder begins with:

* “Find”
* entity type picker
* optional existing-node lookup
* optional property filters

### 2. Only show valid relationships for the current node label

If current node = `Track`, available relationships should be constrained to those where `Track` is a valid subject or object, depending on traversal mode. This is directly supported by the ontology. 

### 3. After relationship selection, only show valid target entity types

If user picks `PERFORMED_BY` from `Track`, target choices should only be `Artist`. 

### 4. After target type selection, expose only valid properties for that type

If target = `Artist`, property picker should only offer `Artist` properties like `name`, `country`, `active_years`. 

### 5. Type-ahead should optionally search existing nodes

For `Artist`, search by `displayPropertyKeys`, which for Artist is `["name"]`; for Album it is `["title", "name"]`. 

### 6. Every step updates a live human-readable summary

Example:

> Find Tracks performed by Artist named “David Bowie” on Albums released by Label named “RCA”

### 7. Every step updates a live Cypher preview

Optional panel for advanced users.

---

# Query grammar recommendation

Support these in v1:

## V1

* one root node
* linear chains of relations
* property filters on any node
* existing-node lookup on any node
* AND logic within a node
* multiple sibling branches from the same node
* result target selection
* sort / limit

## V2

* OR groups
* NOT conditions
* optional edges
* aggregations
* saved templates
* natural-language-to-builder translation

Do **not** start with arbitrary graph pattern editing. That will slow you down and make the UX worse.

---

# Core engine functions

## 1. Normalize ontology

```ts
function normalizeOntology(raw: unknown): NormalizedOntology
```

Responsibilities:

* validate schema shape
* canonicalize synonyms
* index relationships by type
* derive reverse lookup maps:

  * relationshipsBySubjectLabel
  * relationshipsByObjectLabel
  * targetLabelsBySourceAndRelationship
  * sourceLabelsByTargetAndRelationship

## 2. Compute next relationships

```ts
function getValidRelationshipsForNode(
  ontology: NormalizedOntology,
  nodeLabel: EntityLabel,
  direction: "outbound" | "inbound"
): OntologyRelationship[]
```

## 3. Compute valid target labels

```ts
function getValidAdjacentLabels(
  ontology: NormalizedOntology,
  sourceLabel: EntityLabel,
  relationshipType: RelationshipType,
  direction: "outbound" | "inbound"
): EntityLabel[]
```

## 4. Validate partial query

```ts
function validateQueryGraph(
  ontology: NormalizedOntology,
  state: QueryGraphState
): ValidationIssue[]
```

## 5. Compile to Cypher

```ts
function compileToCypher(
  ontology: NormalizedOntology,
  state: QueryGraphState
): { cypher: string; params: Record<string, unknown> }
```

Use parameterized Cypher only.

---

# Cypher compilation approach

Map each query node to an alias:

```cypher
MATCH (n0:Track)-[:PERFORMED_BY]->(n1:Artist)
WHERE toLower(n1.name) CONTAINS toLower($p0)
RETURN n0
LIMIT 25
```

For chains:

```cypher
MATCH (n0:Track)-[:RELEASED_ON]->(n1:Album)-[:RELEASED_BY]->(n2:Label)
WHERE n2.name = $p0
RETURN DISTINCT n0
```

Rules:

* use `DISTINCT` by default when multiple branches are involved
* use alias-stable generation
* compile filters per node
* optionally support fulltext indexes for search-backed lookup

---

# UI module design

## Recommended UI composition

### Main canvas

* root clause row
* plus button for adding relationship branch
* nested step rows

### Each row contains

* direction toggle
* relationship selector
* target entity selector
* node search / create-new mode
* filter editor
* remove row action

### Right panel

* human-readable summary
* Cypher preview
* validation issues
* save template

### Interaction style

Do not use a graph visualization canvas first.
Use a **progressive structured builder** with chips, rows, and nested clauses. It will be faster, clearer, and easier to maintain.

---

# Product decisions you should lock now

## 1. Headless-first

Make the engine reusable independent of React.
That gives you:

* testability
* future CLI or API reuse
* possible LLM translation layer later

## 2. Treat ontology as the source of truth

Do not spread query logic across:

* UI conditionals
* hardcoded entity maps
* Cypher templates
* backend validators

All of those should consume the same normalized ontology.

## 3. Separate suggestion lookup from query-state logic

The query-builder engine should not know how Neo4j search works. It should ask a provider interface.

```ts
interface SuggestionProvider {
  searchNodes(label: string, query: string): Promise<Suggestion[]>;
}
```

---

# Proposed implementation plan

## Phase 1 — foundation

Build:

* ontology loader
* normalized indexes
* query-state model
* next-choice engine
* validator

Deliverable:

* headless engine with tests

## Phase 2 — Cypher backend

Build:

* query compiler
* parameter builder
* Neo4j execution adapter
* suggestion provider

Deliverable:

* builder state -> executable Cypher

## Phase 3 — basic React UI

Build:

* root entity picker
* relationship step row
* target entity picker
* property filter editor
* summary preview
* Cypher preview

Deliverable:

* usable internal query-builder MVP

## Phase 4 — usability refinement

Add:

* synonyms/type-ahead matching
* saved query templates
* breadcrumbs / step summary
* branch support
* result inspector
* keyboard-first interactions

## Phase 5 — advanced behavior

Add:

* OR groups
* negation
* reusable query fragments
* NL prompt -> builder prefill
* explanation panel: “why is this option shown?”

---

# Risks

## 1. Over-building a canvas UI too early

Avoid trying to mimic a node-link editor at the start. Your requirement is relevance-constrained query building, not graph drawing.

## 2. Schema drift

Because entity allowed lists and relationship endpoint rules overlap, drift is likely unless validated automatically. 

## 3. Multi-label identity ambiguity

`Artist + Person` can complicate suggestions, label chips, and Cypher generation if not normalized early. 

## 4. Property operator mismatch

Current property metadata is not rich enough for a polished filter UI. Add UI/operator metadata before building too much UI.

---

# Concrete recommendation

Build a reusable package with this shape:

```ts
@yourorg/graph-query-builder-core
@yourorg/graph-query-builder-react
@yourorg/graph-query-builder-neo4j
```

That keeps the system modular and makes it possible to use the same engine in:

* your app UI
* admin tools
* LLM-assisted query generation
* tests

---

# Immediate next deliverables I recommend

1. **Refactor the ontology into a stricter UI-ready schema extension**
2. **Build the headless engine first**
3. **Implement a row-based React builder, not a graph canvas**
4. **Compile to Cypher from internal query state**
5. **Use Neo4j search only for suggestions, not for builder logic**

If you want, I can next produce the actual **TypeScript interfaces, folder structure, reducer/actions, and a first-pass React component skeleton** for this module.
