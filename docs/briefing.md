# Fuzzy Branch Briefing

## Purpose

This branch establishes the new GrooveGraph direction:

- simpler system shape,
- modular architecture,
- LLM-assisted fuzzy interpretation,
- complete traceability through logging.

It preserves all core infrastructure that already works (Neo4j, current deployment, Cytoscape), while replacing brittle interpretation and query-authoring patterns.

## What we keep

- **Neo4j data + schema persistence**.
- **Environment model** from `.env.local` for Neo4j and LLM access.
- **Deployment workflow** from `docs/DEPLOY.md` (Azure SWA + App Service path unchanged).
- **Cytoscape graph renderer** as default graph visualization path.
- **Ontology assets**:
  - `docs/ONTOLOGY.md`
  - `data/ontology/schema.json`

## What changes now

1. Move toward a **single runtime ontology source** from `data/ontology/schema.json`.
2. Define and implement a **headless query-builder architecture** for Neo4j/Cypher.
3. Build a **fuzzy interpret layer**:
   - checks prior run artifacts,
   - chooses execution strategy,
   - analyzes outcomes,
   - records learnings for next run.
4. Raise logging to first-class system behavior:
   - frontend events,
   - backend API stages,
   - LLM request/response metadata,
   - Neo4j query metadata,
   - trace IDs for full correlation.

## Fuzzy Functions policy

Software is built forward with **Fuzzy Functions**:

- start LLM-assisted across the app where behavior is uncertain or likely to evolve,
- collect evidence through logs and outcomes,
- codify only proven stable patterns into deterministic code,
- keep codified implementations DRY, modular, and organized.

## Operating model on fuzzy branch

- This branch is treated as a dedicated product track.
- Cleanup and restructuring are allowed directly on this branch.
- Rules that conflict with the fuzzy architecture are versioned/scoped rather than silently ignored.

## Deliverables in this branch

- Product requirements document: `docs/PRD_FUZZY.md`.
- Architecture vision rule: `.cursor/rules/architecture-fuzzy.mdc`.
- Runtime ontology loader under `src/ontology/` and integration into LLM ontology context.
- Index and rules documentation updates to keep discoverability accurate.

## Near-term implementation slices

1. Runtime ontology loader + context integration.
2. Headless query-builder core (first live slice complete).
3. Query-builder UI with Cypher preview (multi-row composition + guided next-row direction complete).
4. Fuzzy interpretation orchestrator (first live loop complete: insight lookup -> strategy -> compile).
5. Logging expansion and analysis artifacts (initial query-insights artifact store + API complete).

## Success signal

A user can issue a natural-language or structured query, the system chooses a strategy adaptively, executes against Neo4j with ontology-aware constraints, renders understandable graph results, and emits complete traces for review and iterative improvement.
