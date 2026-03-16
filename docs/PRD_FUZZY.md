# PRD: GrooveGraph Fuzzy Edition

## 1. Product intent

GrooveGraph Fuzzy Edition keeps the current Neo4j-backed graph and deployment model, while rebuilding the search and interpretation experience around a modular, ontology-driven, LLM-assisted architecture.

The redesign addresses three core failures in the current experience:

- Search and interpretation are too rigid (triplet-only parsing, low adaptability).
- Query authoring is not a true builder (single triplet form, no graph query composition).
- Graph visualization works but still feels dense and brittle at workflow level.

## 2. Non-negotiables

- Keep Neo4j and existing graph data.
- Keep model/API-key environment configuration in `.env.local`.
- Keep the current deployment process as documented in `docs/DEPLOY.md`.
- Keep Cytoscape as the default graph renderer (unless a future decision supersedes it).
- Keep `docs/ONTOLOGY.md` and `data/ontology/schema.json` as canonical ontology assets.

## 3. Guiding principles

- **Simplicity**: fewer parallel definitions, fewer hidden branches, fewer special cases.
- **Modularity**: headless core modules with clear API boundaries.
- **Fuzzy-first behavior**: prefer LLM-assisted interpretation and execution planning over brittle hardcoded parsing.
- **Fuzzy Functions policy**: build the app broadly LLM-assisted first, then codify stable behavior only where evidence from runtime traces is strong, using DRY and organized module boundaries.
- **Massive observability**: structured logs and traces across frontend, backend, LLM, and graph calls.
- **Human-in-the-loop improvement**: agents propose improvements from runtime artifacts; humans approve.

## 4. Current-state findings

### 4.1 Search and interpretation pipeline

- Current interpretation relies on triplet parsing in `src/enrichment/triplet.ts`.
- Pipeline execution is primarily one-shot (`src/enrichment/pipelines/triplet-exploration.ts`) with no durable pre-run insight lookup or post-run learning loop.
- `src/enrichment/llm/ontology-context.ts` historically relied on TypeScript config maps rather than runtime schema loading.

### 4.2 Query building UI

- `app/components/triplet-search-controls.tsx` provides a structured triplet form, not a composable query builder.
- There is no headless query state engine, no valid-next-option computation, and no Cypher preview/compile flow.
- `docs/candidate/QueryBuilderSpeculativeUI.md` provides strong interaction direction that should be adapted to Neo4j/Cypher.

### 4.3 Graph display

- Cytoscape 2D is implemented (`app/components/exploration-graph-cytoscape.tsx`) and is the correct short-term foundation.
- Remaining issues from `docs/GRAPH_VIZ_REPAIR_PLAN.md`: readability under density, layout/fit smoothness, and interaction polish.

## 5. Future-state architecture

### 5.1 Core modules

- `src/ontology/`
  - Load and normalize `data/ontology/schema.json`.
  - Provide canonical entity/relationship definitions and lookup indexes.
- `src/query-builder/` (or equivalent module path)
  - Headless query graph state.
  - Valid-next-step evaluator from ontology constraints.
  - Cypher compiler with parameterized output.
- `src/interpret/` (or enrichment submodule)
  - Fuzzy interpretation layer for NL and structured intents.
  - Strategy selection (triplet, query-builder execution, direct constrained Cypher).
  - Pre-run insight lookup + post-run analysis writeback.
- `src/logging/`
  - Structured event logger.
  - Trace propagation across API, LLM, and Neo4j calls.

### 5.2 UI model

- Keep graph viewing and query building separate concerns.
- Build a row-based progressive query builder (not a graph-canvas authoring UI).
- Show both:
  - human-readable summary,
  - generated Cypher preview.
- Keep Cytoscape for result visualization and exploration workflows.

## 6. Observability requirements

### 6.1 Backend logging (mandatory)

Capture at minimum:

- request id / trace id
- route + stage markers
- LLM interaction metadata:
  - provider/base URL
  - model
  - request payload (with clear policy for redaction where needed)
  - response payload
  - token usage and latency when available
- Neo4j query metadata:
  - query text
  - params (sanitized policy)
  - latency, row counts, error context

### 6.2 Frontend logging (mandatory)

Capture at minimum:

- query-builder actions (add/remove clause, relation choice, filter changes)
- search/execute clicks and timing
- graph interaction events (expand, refocus, reset layout)
- user-visible failures and retries

## 7. Ontology governance

- `data/ontology/schema.json` is the machine-readable source for runtime behavior.
- `docs/DOMAIN_MODEL.md` remains human-readable domain authority.
- `docs/ONTOLOGY.md` documents schema usage patterns and validation behavior.
- Add schema extensions for UI/UX where useful (relationship UI labels, property filter operator hints, control hints).

## 8. Scope and roadmap

### 8.1 In-scope now (fuzzy branch execution)

- Branch setup and focused cleanup/restructure.
- `docs/briefing.md` creation.
- Architecture/vision rule for fuzzy development.
- Runtime ontology loader implementation.
- Use ontology loader in at least one active runtime path (LLM ontology context).

### 8.2 Next slices

1. Headless query-builder engine.
2. Query-builder UI wired to engine.
3. Fuzzy interpretation orchestrator with run-insight loop.
4. Expanded logging pipeline and analysis artifacts.
5. Graph UX polish on Cytoscape.

## 9. Success criteria

- Ontology used at runtime from `data/ontology/schema.json`.
- Query-builder implementation path established as modular headless + UI layers.
- Fuzzy interpretation strategy defined and scaffolded for incremental delivery.
- Structured logging foundation in place with traceability goals captured.
- Documentation and rules reflect the fuzzy branch operating model.

## 10. Risks and mitigations

- **Risk: ontology drift** between docs and schema.
  - **Mitigation:** central loader, validation tests, and docs sync gates.
- **Risk: overdependence on opaque LLM behavior.**
  - **Mitigation:** mandatory logging + post-run analysis + human approval loops.
- **Risk: scope explosion in UI rewrite.**
  - **Mitigation:** ship in slices with clear contracts and e2e validation.

## 11. References

- `docs/candidate/QueryBuilderSpeculativeUI.md`
- `docs/GRAPH_VIZ_REPAIR_PLAN.md`
- `docs/ONTOLOGY.md`
- `data/ontology/schema.json`
- `docs/DEPLOY.md`
- `docs/RULES_AND_STANDARDS.md`
