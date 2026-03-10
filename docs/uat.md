# GrooveGraph UAT

## Scope

User acceptance testing for the current dynamic GrooveGraph application backed by Neo4j Aura, with the new unified graph-first exploration page.

## Environment

- App URL: `http://localhost:3000`
- Runtime: Next.js dev server
- Storage: Neo4j Aura

## Test Areas

- Unified explore page shell
- Type-aware search and guided examples
- Query/graph view toggle behavior
- Artist enrichment flow
- Non-artist discovery flow
- Error handling and empty states

## Results

Completed browser-based execution against the live dev server.

## Summary

Overall result: **pass with follow-up polish items**.

The core flows now work on one page:

- unified graph-first entry renders correctly
- graph view is the default mode
- query and graph modes preserve context while switching
- entity-type dropdown works across multiple labels
- artist enrichment succeeds and persists
- shared entities such as `classic rock` connect multiple artists
- dragged nodes stay pinned where they are dropped
- `Reset layout` restores both nodes and relationships to the current structured layout

The remaining gaps are now mostly polish:

- first-load latency is still noticeable on cold requests
- the force graph remains visually dense on large neighborhoods
- some metric labels in the query summary are still terse and would benefit from friendlier wording

## Test Cases

| ID | Scenario | Result | Notes |
|----|----------|--------|-------|
| UAT-01 | Open unified explore page | Pass | Page rendered successfully at `http://localhost:3000/` with `Graph` selected by default. |
| UAT-02 | Verify entity dropdown placement and options | Pass | Dropdown rendered to the left of the search input and exposed the legend entity taxonomy. |
| UAT-03 | Run guided example for artist `The Who` | Pass | URL updated to `?view=graph&entityType=Artist&query=The+Who`; graph and summary metrics loaded together. |
| UAT-04 | Switch from graph view to query view | Pass | Query mode opened without losing the active entity type or search term. |
| UAT-05 | Enrich known artist from unified page | Pass | `POST /api/enrich` succeeded and UI showed source badges plus deduped entity/relationship feedback. |
| UAT-06 | Run non-artist search for `Genre -> classic rock` | Pass | Query summary showed `The Who` and `The Rolling Stones` as shared connections to the same genre node. |
| UAT-07 | Switch `Genre -> classic rock` back to graph view | Pass | URL updated to `?view=graph&entityType=Genre&query=classic+rock` and context remained intact. |
| UAT-08 | Drag and pin graph nodes | Pass | Dropped nodes remained pinned instead of snapping back into the simulation. |
| UAT-09 | Reset graph layout after dragging | Pass | `Reset layout` re-bound both nodes and links to the refreshed layout. |
| UAT-10 | Open ontology legend | Pass | Legend remained available from the unified graph mode. |

## Observed Behavior

### Unified explore flow

- The merged page reads much more like a product surface than the previous split home/graph flow.
- The graph-first default supports the product’s “discover connections” promise immediately.
- Guided examples make the first interaction easier and visibly demonstrate cross-entity exploration.
- The URL now preserves `view`, `entityType`, and `query`, which makes the workspace state shareable and recoverable.

### Query mode

- Query mode presents a useful structured summary for both artists and non-artist entities.
- For `Artist -> The Who`, the page showed relationship counts, related entity counts, key facts, and a discovery preview.
- For `Genre -> classic rock`, the page clearly exposed the shared-entity goal by showing multiple artists connected to the same genre hub.
- Query timing improved substantially after the generic Neo4j preview work; observed warm requests were approximately **271ms** for `Genre -> classic rock` and **290ms** for the post-enrichment `Artist -> The Who` query.

### Graph mode

- Graph mode remains the strongest hero moment and now coexists cleanly with query mode.
- Artist graph load for `The Who` succeeded with an observed warm `GET /api/graph?entityType=Artist&query=The+Who` at approximately **458ms**.
- Genre graph load for `classic rock` succeeded with an observed `GET /api/graph?entityType=Genre&query=classic+rock` at approximately **269ms**.
- Highlighting enriched nodes is a meaningful improvement over the earlier invisible persistence behavior.
- Dragged nodes can now be pinned in place, which makes manual graph exploration more usable.
- `Reset layout` now restores the entire rendered graph coherently instead of resetting only node positions.

### Enrichment flow

- Enrichment succeeded from the unified page in query mode.
- Browser-visible feedback now shows source badges plus deduped entity and relationship results after persistence, rather than only raw property counts.
- In the tested `The Who` run, the UI reported matched existing genre entities and `PART_OF_GENRE` relationships, which correctly reflects deduped shared-node behavior.

### Empty and error states

- The default empty graph state is more informative and points users toward guided examples.
- Search copy now adapts to the selected entity type instead of assuming artists only.
- No blocking runtime errors were encountered during the final unified-page UAT pass.

## UX Findings

### What works well

- One-page exploration flow is easier to understand
- Graph-first default better matches the product vision
- Type-aware dropdown opens the door to real multi-entity discovery
- Guided examples accelerate onboarding
- Manual graph positioning is more usable because dropped nodes stay pinned
- Enrichment feedback is now meaningfully connected to graph structure
- Shared-entity behavior is visible in the UI, not just in the backend

### What still feels weak

- Large force-graph neighborhoods are still visually dense
- Summary pills such as `Artist 2` or `PART OF GENRE 2` are accurate but not yet especially polished
- Cold-start request latency is improved but still noticeable enough to warrant continued tuning

## Known Risks

- The custom Neo4j graph path is much more stable after the generic node-subgraph refactor, but graph quality still depends on backend query health and dataset size.
- The dev server emitted a non-blocking webpack cache restore warning during restart; it did not affect the verified app behavior.

## Recommendations

### High priority

1. Continue reducing first-load latency for both graph and query calls.
2. Improve the wording and formatting of summary count pills in query mode.
3. Make large graph neighborhoods easier to read with stronger focus and filtering controls.

### Medium priority

1. Add richer graph-specific highlighting for the active seed path.
2. Expand guided examples to cover additional entity types such as `Label`, `Venue`, and `Person`.
3. Consider exposing route timing in a developer-visible diagnostics panel during testing.

### Lower priority

1. Add alternate relationship views beyond the force graph for dense neighborhoods.
2. Add richer empty-state illustrations or contextual onboarding copy.
