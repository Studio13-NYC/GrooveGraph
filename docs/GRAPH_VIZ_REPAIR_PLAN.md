# Graph Visualization Repair / Replace Plan

**Goal:** Repair or replace the existing graph visualization so it works reliably and delivers a **fluid, cinematic** experience that is a **joy to use**—not clinical or basic. All work must be validated with **browser automation** during build and debugging. TypeScript/JS only; everything runs in the browser.

**Implementation status:** The **Cytoscape.js 2D** path has been implemented. The exploration workspace uses `GraphView2D` (`app/components/exploration-graph-cytoscape.tsx`) with a **GraphViewProps** contract (`app/components/graph-view-types.ts`). A future 3D view can implement the same interface and be selected via a view-mode toggle without changing the workspace.

**Cleanup (human approval required):** After `npm run cleanup:check`, the following were reported. No removals have been made; approve before changing.

| Path | Reason | Estimated lines removed | Action |
|------|--------|-------------------------|--------|
| `src/lib/entity-config.ts` | Unused export `getEntitySearchPlaceholder` | ~5 | Remove export or use |
| `src/enrichment/triplet.ts` | Unused exports `formatTripletSpec`, `TRIPLET_EXAMPLES`, `isTripletSpec` | ~40 | Remove export or use |
| `src/enrichment/types.ts` | Unused types `EvidenceMention`, `RelationAssertion`, `ExtractionAssertion` | ~30 | Remove or keep for future use |
| `src/enrichment/extraction/job-store.ts` | Unused type `EnrichmentJobStatus` | ~3 | Remove export or use |

---

## 1. Current State (As-Is Analysis)

### 1.1 Stack and Data Flow (current implementation)

| Layer | Implementation |
|-------|----------------|
| **Library** | **Cytoscape.js** (2D, WebGL-capable); component `app/components/exploration-graph-cytoscape.tsx` exports `GraphView2D`. |
| **Contract** | `GraphViewProps` in `app/components/graph-view-types.ts` so a future 3D view can plug in via a view-mode toggle. |
| **Data** | `GET /api/graph` → `{ nodes, links, focusNodeId }` (see `src/lib/exploration-types.ts`, `src/lib/exploration.ts`) |
| **UI** | `app/components/exploration-workspace.tsx` (graph panel), `app/lib/graph-viz.ts` (colors), `app/components/graph-legend.tsx` |

- **Payload:** Nodes have `id`, `label`, `name`, `nodeKind` (`focus` | `type_hub` | `entity`), `entityLabel`, `groupKey`, `x`/`y` for layout. Links have `source`, `target` (string IDs), `type`, `groupKey`, `hiddenByDefault`.
- **Layout:** Semantic layout computed in the app (focus at center bottom, type hubs on an arc, entities in expandable groups); positions applied in Cytoscape as preset then viewport fitted.
- **Visibility:** Only focus + type_hub nodes plus entities whose `groupKey` is in `expandedTypeKeys` are shown; links filtered by visibility and `hiddenByDefault`/`groupKey`.

### 1.2 Identified Issues

1. **UAT / product**
   - “Large force-graph neighborhoods are still visually dense” (docs/uat.md).
   - “The existing one just doesn’t work properly” (user): may include layout glitches, zoom/fit failures, links not rendering, drag/freeze bugs, or poor first-load behavior.

2. **Technical notes**
   - Cytoscape 2D is in place; Options A (repair in place) and B (replace with Cytoscape) in §3 are historical. The "Recommended Direction" (Option B) has been implemented.
   - Fit-to-viewport and "Reset layout" work; any remaining jitter or density is addressed by tuning layout constants or adding level-of-detail controls.
   - WebGL rendering supports larger graphs; further gains may come from layout toggles or 3D (§5).

3. **UX shortfall**
   - Experience is improved; optional polish: smoother transitions, richer hierarchy, and density controls (see §5 for 3D upgrade path). “fluid and cinematic”
---

## 2. Validation and Process Requirements

Per **`.cursor/rules/ui-debug-testing.mdc`** and **`port-3000-runtime-hygiene.mdc`**:

- **Browser automation is mandatory** for any build or debugging that touches the graph workflow.
- Use the built-in browser automation (e.g. **cursor-ide-browser** MCP) to:
  - Ensure port `3000` is available; start app with `npm run dev`.
  - Open the exploration entry point (e.g. `http://localhost:3000/` with graph mode).
  - Take a snapshot to capture structure and element refs.
  - Run the full flow: entity type + search (e.g. Artist → “The Who”), optional type-hub expand, drag node, Reset layout, toggle Graph/Query.
  - Snapshot after critical steps and at completion.
  - Assert on **visible outcomes** (graph renders, nodes/links visible, zoom/pan/drag behave, no blank or broken canvas).
- During implementation:
  - Provide short **progress updates** (attempt, result, next step).
  - Fix from **evidence** (what the browser shows), then re-run the same flow to confirm.
- **Completion:** Work is not done until the end-to-end graph workflow has been exercised in the browser and the user-visible result is confirmed.

These requirements apply to **every slice** of the repair/replace (e.g. after swapping library, after layout changes, after styling/UX tweaks).

---

## 3. Options (Repair vs Replace)

### 3.1 Option A — Repair in place (react-force-graph-2d)

- **Pros:** Same API surface, no data contract change, minimal migration.
- **Cons:** Still canvas + d3-force; “cinematic” ceiling is limited; large graphs will remain a challenge.

**Actions:**

1. **Stabilize layout and fit**
   - Resolve links to node refs **before** passing to the graph (e.g. in the same `useMemo` that builds `graphData`) so `nodes` and `links` are referentially consistent and the library doesn’t mutate shared state in surprising ways.
   - Tune d3-force: expose or set `d3Force('link').distance()`, `d3Force('charge')`, and optionally `d3Force('center')` to match semantic layout (e.g. weaker charge, larger link distance for type hubs).
   - Increase `cooldownTicks` or use `onEngineStop` plus a short delay before first `fitGraphToViewport` so the graph is stable before fitting.
   - Ensure `zoomToFit`/`centerAt` are called only when the graph ref and canvas dimensions are ready (e.g. after first paint or in requestAnimationFrame).

2. **Reduce visual density**
   - Add a “focus level” or “neighborhood depth” control (e.g. show only 1–2 hops from focus by default).
   - Optional: collapse type hubs by default to “count only” and expand on click (already partially there); ensure expanded rings don’t overlap.
   - Slightly larger default node spacing in semantic layout constants.

3. **Polish**
   - Smooth zoom/pan (library may support duration; use it).
   - Optional: subtle entrance animation (e.g. opacity or scale) when switching context.
   - Keep and refine `app/lib/graph-viz.ts` colors and legend for hierarchy.

4. **Validation**
   - After each change set: run full exploration flow in browser automation (search → graph → expand → drag → reset → toggle view); confirm no regressions and improved stability/readability.

### 3.2 Option B — Replace with a more capable 2D library

Candidates (TypeScript-friendly, browser, no Python):

| Library | Notes | Cinematic / fluid potential |
|--------|--------|------------------------------|
| **Cytoscape.js** | WebGL, many layouts, strong API; 3.4M weekly downloads. | High (layouts + rendering). |
| **Sigma.js** | Canvas/WebGL, good for large graphs. | Medium–high. |
| **vis-network** | Canvas, easy API, dynamic updates. | Medium. |
| **@cosmograph/cosmograph** | GPU (Cosmos.gl), huge scale. | High for scale; may be overkill for current node counts. |

**Recommendation for “fluid and cinematic” 2D:** **Cytoscape.js** (with `cytoscape` + optional `react-cytoscapejs` or a small wrapper) for:

- WebGL rendering and multiple layout algorithms (including force-directed and hierarchical).
- Good TypeScript support and extensibility for custom node/edge styling and animations.
- Same data contract: convert `GraphPayload` to Cytoscape elements (nodes/edges) and keep existing API and semantic layout as initial positions or as a custom layout step.

**Replace steps:**

1. Add `cytoscape` (and types if needed); optional wrapper component in `app/components/` (e.g. `ExplorationGraphCytoscape.tsx`).
2. Map `GraphPayload` → Cytoscape `elements` (nodes + edges); preserve `nodeKind`, `entityLabel`, `groupKey` in node data for styling and filtering.
3. Implement semantic layout: either set positions in element data and use “preset” layout, or run a custom layout that respects focus/type-hub/entity rings.
4. Reimplement interactions: click type hub → expand/collapse; click entity → refocus (navigate); drag → pin (disable force on that node); “Reset layout” re-applies semantic layout.
5. Styling: mirror `graph-viz.ts` colors and legend; use Cytoscape’s zoom/pan and, if available, smooth transitions.
6. Remove or conditionally disable `react-force-graph-2d` only after the new component is feature-complete and validated.
7. **Validation:** Same browser-automation flow as above; confirm parity then improved feel.

### 3.3 Option C — Replace with 2D now, design for 3D later

Same as B, but with a **clear 3D upgrade path** (see Section 5). Choose a 2D stack that doesn’t block 3D (e.g. keep graph data and “layout intent” abstract so a 3D renderer can consume the same payload).

---

## 4. Recommended Direction and Slices

**Recommendation:** **Option B (Replace with Cytoscape.js)** for 2D, with a thin abstraction over “graph view” so we can swap or add a 3D view later.

**Rationale:**

- Current issues (density, “doesn’t work properly,” fit/layout) are easier to fix with a library that has robust layouts and WebGL.
- Cytoscape is well-maintained, TS-friendly, and supports the kind of custom styling and interaction we need.
- Keeping the same `GraphPayload` and API means backend and exploration logic stay unchanged; only the component that turns `nodes`/`links` into a picture is replaced.

**Incremental slices (each validated with browser automation before moving on):**

1. **Slice 1 — Setup and minimal graph**
   - Add Cytoscape (and optional React wrapper); create a minimal `ExplorationGraphCytoscape` that receives `graphData` (same shape as today) and renders nodes/edges with default styling.
   - No semantic layout yet; use a simple force or grid layout.
   - **Validation:** Load app → search Artist “The Who” → graph mode shows nodes and edges without errors.

2. **Slice 2 — Data and styling**
   - Map all `GraphNodePayload`/`GraphLinkPayload` fields into Cytoscape element data; apply colors from `graph-viz.ts` (node color by `entityLabel`, link color by `type`).
   - Replicate focus/type_hub/entity node kinds and legend.
   - **Validation:** Same flow; colors and types match current legend; no regressions.

3. **Slice 3 — Semantic layout**
   - Compute positions (same math as `applySemanticLayout`) and apply as preset positions in Cytoscape (or run a one-off layout that uses them).
   - Implement expand/collapse: only nodes with `nodeKind === 'focus'`, `nodeKind === 'type_hub'`, or (`nodeKind === 'entity'` and `groupKey` in `expandedTypeKeys`) are in the visible set; sync with existing state.
   - **Validation:** Initial load and after “Reset layout” match current structure; expand/collapse type hubs works.

4. **Slice 4 — Interactions and controls**
   - Node click: type hub → toggle group; entity → refocus (call existing `loadContext`).
   - Node drag: update position and set fixed (pin); persist in graph state.
   - “Reset layout” re-applies semantic layout and refreshes view.
   - Zoom to fit and center on load/resize (using Cytoscape viewport API).
   - **Validation:** Drag to pin, reset layout, back/forward navigation, and “Show in graph” from query mode all work as today.

5. **Slice 5 — Polish and cinematic feel**
   - Smooth zoom/pan and optional transition when changing context (e.g. zoom to focus node).
   - Optional: light animations on node appear or on expand.
   - Edge labels and “highlight enriched” toggle; keep parity with current toggles.
   - **Validation:** Same flow feels smoother and more readable; no performance or layout regressions.

6. **Slice 6 — Cutover and cleanup**
   - Switch exploration workspace to the new component by default; remove or feature-flag `react-force-graph-2d` usage.
   - Run cleanup (e.g. `npm run cleanup:check`); propose dependency and dead-code removals for human approval per `feature-cleanup-cruft.mdc`.
   - **Validation:** Full UAT-style pass via browser automation; update docs (README, uat.md) to describe new stack.

---

## 5. Future 3D Upgrade (Side Consideration)

- **Libraries:** `react-force-graph-3d` (Three.js + d3-force-3d) or `r3f-forcegraph` (React Three Fiber) are natural candidates; same `nodes`/`links` data shape.
- **Abstraction:** Keep a single “graph view” interface in the app:
  - Input: `graphData` (nodes + links + focusNodeId) + view mode (e.g. `'2d'` | `'3d'`).
  - Output: same callbacks (onNodeClick, onExpandType, onDragEnd, resetLayout, fitView).
- **2D → 3D:** Use the same semantic “layout intent” (focus center, type hubs on a circle/arc, entities in rings). In 3D, place type hubs on a horizontal circle around focus and entities on a sphere or cylinder; reuse `applySemanticLayout`-style math with a Z component (or delegate to 3D force layout with initial positions).
- **Implementation order:** After 2D is stable and validated, add a view toggle (2D / 3D), a second component (e.g. `ExplorationGraph3D`), and shared layout/state logic so both views stay in sync.

---

## 6. Summary

| Item | Action |
|------|--------|
| **Current stack** | react-force-graph-2d + d3-force, canvas; semantic layout in app. |
| **Known issues** | Dense neighborhoods, fit/layout timing, possible link/ref quirks; not “cinematic.” |
| **Validation** | Mandatory browser automation for every slice (open app, run exploration flow, snapshot, assert). |
| **Recommendation** | Replace with **Cytoscape.js** (2D, WebGL) in slices; keep `GraphPayload` and API unchanged. |
| **3D later** | Same data + “layout intent”; add 2D/3D toggle and `ExplorationGraph3D` (e.g. react-force-graph-3d or r3f-forcegraph) when ready. |

This plan ensures the agent uses **browser automation to visually inspect** the graph at each build and debugging step, and delivers a path to a fluid, cinematic 2D experience with a clear route to 3D.
