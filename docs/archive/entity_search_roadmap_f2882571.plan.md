---
name: Entity Search Roadmap
overview: Implement a unified type-aware exploration page that combines query and graph views behind a toggle defaulting to Graph, while addressing the key UX, performance, stability, and onboarding gaps identified in `docs/uat.md`. The plan prioritizes a reusable entity search control, a merged page layout, generic query/graph APIs, graph readability improvements, and targeted hardening of the Neo4j-backed experience.
todos:
  - id: search-control
    content: Design a reusable entity-type dropdown plus text input control for the unified exploration page and any remaining shared entry points.
    status: completed
  - id: unified-page-layout
    content: Merge query and graph flows onto one page with a view toggle that defaults to Graph and preserves context between modes.
    status: completed
  - id: generic-query-api
    content: Generalize the artist-only query flow into a type-aware search endpoint and result contract.
    status: completed
  - id: generic-graph-loading
    content: Extend graph loading to support non-artist seed entities and deep links.
    status: completed
  - id: neo4j-hardening
    content: Reduce first-query latency and stabilize Neo4j subgraph fetching with store-level helpers and instrumentation.
    status: completed
  - id: ux-onboarding
    content: Address UAT UX gaps with stronger homepage narrative, guided examples, better empty states, and clearer graph interpretation.
    status: completed
  - id: enrichment-visibility
    content: Make enrichment outcomes more visual in the graph and result flows, including source badges and before/after change summaries.
    status: completed
  - id: uat-refresh
    content: Re-run and update UAT/documentation after multi-entity exploration is implemented.
    status: completed
isProject: false
---

# GrooveGraph Unified Exploration Plan

## Goal

Evolve GrooveGraph from an artist-only utility into a multi-entity exploration product where users can start from `Artist`, `Genre`, `Album`, or any supported node type and uncover shared graph connections. This plan covers the recommendations in `[d:/Studio13/Lab/Code/GrooveGraph/docs/uat.md](d:/Studio13/Lab/Code/GrooveGraph/docs/uat.md)`, adds the requested entity-type dropdown to the left of the search input, and changes the target UX to a single page that contains both query and graph views with a toggle defaulting to `Graph`.

## Phase 1: Single-Page Exploration Layout

- Consolidate the current split between `[d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx)` and `[d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx)` into one primary exploration surface.
- Add a view toggle near the top of the page that switches between `Graph` and `Query` presentations while keeping the current search state, selected entity type, and active result context intact.
- Default that toggle to `Graph` so the product opens on its hero experience while still making query-oriented inspection immediately available.
- Decide whether the existing `/graph` route becomes the canonical unified page or whether `/` absorbs graph content and `/graph` redirects; keep this as an implementation detail, but ensure the end-state feels like one product surface.

## Phase 2: Unified Type-Aware Search

- Create a reusable search control component, for example `[d:/Studio13/Lab/Code/GrooveGraph/app/components/entity-search-controls.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/components/entity-search-controls.tsx)`, that combines:
  - a dropdown sourced from `[d:/Studio13/Lab/Code/GrooveGraph/app/lib/graph-viz.ts](d:/Studio13/Lab/Code/GrooveGraph/app/lib/graph-viz.ts)` `ENTITY_LABELS`
  - a context-sensitive text input whose placeholder changes by selected entity type
  - a consistent submit/loading/error pattern shared by the toggleable query and graph sections
- Replace the artist-only inputs in `[d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx)` and `[d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx)` with that shared control during the merge, keeping the dropdown immediately left of the text box.
- Default the dropdown options to the legend taxonomy already exposed by `ENTITY_LABELS`: `Artist`, `Album`, `Track`, `Equipment`, `Instrument`, `Studio`, `Person`, `Credit`, `Label`, `Performance`, `Effect`, `Genre`, `Playlist`, `Venue`, `SongWork`, `Session`, `Release`.
- Update the copy so the search prompt describes the specific selected entity instead of always saying “artist”.

## Phase 3: Generic Query And Graph Loading APIs

- Generalize `[d:/Studio13/Lab/Code/GrooveGraph/app/api/query-artist/route.ts](d:/Studio13/Lab/Code/GrooveGraph/app/api/query-artist/route.ts)` into a type-aware query endpoint that accepts `{ entityType, query }` and returns a display-focused result model per entity label.
- Extend `[d:/Studio13/Lab/Code/GrooveGraph/app/api/graph/route.ts](d:/Studio13/Lab/Code/GrooveGraph/app/api/graph/route.ts)` to accept generic entity filters rather than only `artist`, so the unified page can deep-link and load subgraphs for non-artist entities too.
- Add a shared label-to-display-property mapping so searches work across mixed models where the primary identifier may be `name`, `title`, or `venue`.
- Keep exact-match-first behavior, then fuzzy/contains ranking, but move matching logic away from broad in-memory scans where possible.

## Phase 4: Neo4j Search Performance And Stability

- Refactor the current slow path in `[d:/Studio13/Lab/Code/GrooveGraph/app/api/query-artist/route.ts](d:/Studio13/Lab/Code/GrooveGraph/app/api/query-artist/route.ts)`, which currently falls back to loading up to `20000` artist nodes and filtering in memory.
- Add Neo4j-backed query helpers in `[d:/Studio13/Lab/Code/GrooveGraph/src/store/Neo4jGraphStore.ts](d:/Studio13/Lab/Code/GrooveGraph/src/store/Neo4jGraphStore.ts)` for:
  - exact lookup by label and display property
  - ranked fuzzy contains search by label
  - generic subgraph fetch from an arbitrary seed node, not just artists
- Revisit the custom artist subgraph logic in `[d:/Studio13/Lab/Code/GrooveGraph/src/store/Neo4jGraphStore.ts](d:/Studio13/Lab/Code/GrooveGraph/src/store/Neo4jGraphStore.ts)` to remove the open UAT stability risk and extract a safer reusable pattern for non-artist seed nodes.
- Add request-level instrumentation so first-response latency and graph query failures are visible during validation.

## Phase 5: Graph Readability And Exploration UX

- Use the new entity-type selector and the view toggle in the unified page to satisfy the UAT recommendation for node-type filtering and make the graph easier to interpret.
- Expand the details panel to group related attributes and highlight why a node is connected to the selected seed.
- Add a “show only new/enriched nodes” or “highlight enriched elements” toggle so enrichment has visible impact beyond a success card.
- Use the existing legend from `[d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx)` as the single source for ontology explanation, but connect it more directly to search/filter controls so first-time users understand what they can explore.

## Phase 6: Page Narrative, Guidance, And Empty States

- Refresh the unified entry experience so it communicates the broader product promise: exploring hidden links across artists, genres, labels, venues, sessions, and more.
- Add guided example searches tied to the new dropdown, such as starting from `Genre` or `Label`, to address the UAT onboarding gap.
- Improve empty states in both toggle modes so they guide first-time exploration rather than reading like a blank developer tool.
- Update result cards so non-artist searches still feel useful and lead naturally into graph exploration.

## Phase 7: Enrichment Feedback As A Discovery Feature

- Build on the recent enrichment work in `[d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx)` and the enrichment pipeline files under `[d:/Studio13/Lab/Code/GrooveGraph/src/enrichment](d:/Studio13/Lab/Code/GrooveGraph/src/enrichment)` to:
  - add source badges
  - summarize before/after graph deltas
  - call out newly created shared entities versus matched existing hubs
- Feed enrichment outcomes into the graph view so users can jump directly from a persisted enrichment event into the affected neighborhood without leaving the page.

## Phase 8: Validation, UAT Refresh, And Documentation

- Update browser-based UAT coverage in `[d:/Studio13/Lab/Code/GrooveGraph/docs/uat.md](d:/Studio13/Lab/Code/GrooveGraph/docs/uat.md)` to include:
  - search by multiple entity types
  - graph deep-linking by non-artist seed entities
  - the unified page toggle with `Graph` as the default view
  - latency checks for exact and fuzzy searches
  - enrichment visibility in graph filters/highlights
- Refresh high-level product and usage docs such as `[d:/Studio13/Lab/Code/GrooveGraph/README.md](d:/Studio13/Lab/Code/GrooveGraph/README.md)` once the new exploration flow is in place.

## Key Files

- `[d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/page.tsx)`
- `[d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx](d:/Studio13/Lab/Code/GrooveGraph/app/graph/page.tsx)`
- `[d:/Studio13/Lab/Code/GrooveGraph/app/lib/graph-viz.ts](d:/Studio13/Lab/Code/GrooveGraph/app/lib/graph-viz.ts)`
- `[d:/Studio13/Lab/Code/GrooveGraph/app/api/query-artist/route.ts](d:/Studio13/Lab/Code/GrooveGraph/app/api/query-artist/route.ts)`
- `[d:/Studio13/Lab/Code/GrooveGraph/app/api/graph/route.ts](d:/Studio13/Lab/Code/GrooveGraph/app/api/graph/route.ts)`
- `[d:/Studio13/Lab/Code/GrooveGraph/src/store/Neo4jGraphStore.ts](d:/Studio13/Lab/Code/GrooveGraph/src/store/Neo4jGraphStore.ts)`
- `[d:/Studio13/Lab/Code/GrooveGraph/docs/uat.md](d:/Studio13/Lab/Code/GrooveGraph/docs/uat.md)`

## Implementation Notes

- Reuse `ENTITY_LABELS` from `[d:/Studio13/Lab/Code/GrooveGraph/app/lib/graph-viz.ts](d:/Studio13/Lab/Code/GrooveGraph/app/lib/graph-viz.ts)` so the dropdown and legend never diverge.
- Treat the current split routes as migration scaffolding; the target UX is one exploration page with two modes, not two separate destinations.
- Treat the current artist-only query endpoint as a migration seam: either generalize it in place or replace it with a new generic endpoint while preserving backward compatibility during rollout.
- Prefer one shared search control, one shared label-to-display-property mapping, and one shared exploration state model so the query and graph modes remain consistent.

