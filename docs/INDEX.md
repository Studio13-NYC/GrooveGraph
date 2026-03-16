# GrooveGraph documentation index

This index catalogs every document in `docs/` and how it relates to the codebase. Use it to find the right doc and avoid duplication.

**Conventions:** Core design docs use `UPPER_SNAKE.md`; a few keep lowercase for historical links (`neo4j.md`, `uat.md`). The **single source of truth** for the graph shape is [DOMAIN_MODEL.md](DOMAIN_MODEL.md). The **formal ontology** (schema + LLM) is [ONTOLOGY.md](ONTOLOGY.md) and `data/ontology/schema.json`.

---

## Core design and architecture

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Property-graph core, conceptual layers, query model, indexing, validation. |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | **Single source of truth**: node labels, properties, edge types, and advanced structures (Instrument, SongWork, provenance). |
| [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) | Product outcome, actors, capabilities, discovery use cases, enrichment, import contract. |
| [PRD_FUZZY.md](PRD_FUZZY.md) | Product requirements for the fuzzy branch: modular query builder, fuzzy interpretation, and full-trace logging. |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Domain types, OOP rule, entity/relationship layout, data population; references GraphStore and Neo4j. |
| [STORAGE_ABSTRACTION.md](STORAGE_ABSTRACTION.md) | `GraphStore` interface, Neo4j Aura production store, InMemory reference adapter. |

---

## Setup, deploy, and operations

| Document | Purpose |
|----------|---------|
| [neo4j.md](neo4j.md) | Neo4j Aura setup: configure `.env.local` for connection. |
| [DEPLOY.md](DEPLOY.md) | Deploy the dynamic app: Vercel, Node host, Azure (SWA + App Service), Docker. |

---

## Enrichment

| Document | Purpose |
|----------|---------|
| [ENRICHMENT_PROCESS.md](ENRICHMENT_PROCESS.md) | Enrichment pipeline: collect → verify → review → load; staged review session; triplet and span_mention extraction; API notes. |
| [ENRICHMENT_SOURCES.md](ENRICHMENT_SOURCES.md) | Catalog of enrichment sources (MusicBrainz, Wikipedia, Discogs, etc.); implemented adapter paths. |
| [ONTOLOGY.md](ONTOLOGY.md) | Formal graph schema (`data/ontology/schema.json`), LLM context, validation, and tools (`get_ontology_schema`, `search_entity`). |
| [ADAPTERS_AS_TOOLS.md](ADAPTERS_AS_TOOLS.md) | Plan (parked): expose source adapters as LLM-callable tools. |
| [CASE_SPECIFIC_LOGIC.md](CASE_SPECIFIC_LOGIC.md) | Where the code branches on entity/relationship types; intentional rules vs generalization candidates. |

---

## UI, testing, and quality

| Document | Purpose |
|----------|---------|
| [RULES_AND_STANDARDS.md](RULES_AND_STANDARDS.md) | Catalog of Cursor rules and coding/layout standards. |
| [briefing.md](briefing.md) | Branch briefing for the fuzzy product direction and implementation priorities. |
| [posts/2026-03-16-fuzzy-foundation.md](posts/2026-03-16-fuzzy-foundation.md) | First milestone narrative for the fuzzy rebuild and execution model. |
| [posts/2026-03-16-live-query-builder-slice.md](posts/2026-03-16-live-query-builder-slice.md) | Milestone narrative for the first live ontology-driven query-builder compile slice. |
| [UI_TESTING.md](UI_TESTING.md) | **Playwright e2e:** local and deployed UI tests; when to run which; link to ui-testing and runtime-hygiene subagents. |
| [uat.md](uat.md) | User acceptance testing: scope, test cases, results, and recommendations for the unified exploration page. |
| [BROWSER_TEST_EXPLORE_ENRICHMENT.md](BROWSER_TEST_EXPLORE_ENRICHMENT.md) | How to run Explore and Enrichment browser tests with Cursor automation; screenshot locations and params. |
| [browser-test-screenshots/README.md](browser-test-screenshots/README.md) | Where browser test screenshots are saved and how to find them. |
| [browser-test-params.json](browser-test-params.json) | Default parameters for browser tests (baseUrl, paths, queries). |
| [UI_MOCKUPS.md](UI_MOCKUPS.md) | Mockups for entity search: type selector, results list, post-selection cards. |
| [GRAPH_VIZ_REPAIR_PLAN.md](GRAPH_VIZ_REPAIR_PLAN.md) | Graph visualization: current Cytoscape 2D stack, repair/replace options, validation and 3D upgrade path. |

---

## Backlog and historical plans

Completed implementation plans are in **[docs/archive/](archive/)** so they stay out of the main doc set.

| Document | Purpose |
|----------|---------|
| [ToDo.md](ToDo.md) | Long-term backlog (e.g. Next.js upgrade); not scheduled. |
| [archive/entity_search_roadmap_f2882571.plan.md](archive/entity_search_roadmap_f2882571.plan.md) | Completed plan: unified exploration page, type-aware search, generic query/graph APIs. |
| [archive/generic_enrichment_plan_719e1170.plan.md](archive/generic_enrichment_plan_719e1170.plan.md) | Completed plan: ontology-guided enrichment, extraction IR, span_mention and triplet adapters. |
| [baseline/README.md](baseline/README.md) | Curated baseline bundle derived from generalized project standards and templates. |
| [baseline/BASELINE_DOC_STRUCTURE.md](baseline/BASELINE_DOC_STRUCTURE.md) | Baseline documentation taxonomy for the rebuilt repo layout. |
| [baseline/BASELINE_EXECUTION_MODEL.md](baseline/BASELINE_EXECUTION_MODEL.md) | Incremental execution model for clean-slate fuzzy rebuild slices. |
| [baseline/SUBAGENT_ASSIGNMENTS.md](baseline/SUBAGENT_ASSIGNMENTS.md) | Active task ownership and quality gates for frontend and backend subagents. |

---

## Other references

| Document | Purpose |
|----------|---------|
| [data/README.md](../data/README.md) | Reference datasets (Last.fm, play history, Spotify) for import and testing. |

---

## Quick links from README

The [README](../README.md) “Project status and docs” table is a short subset of this index. For the full catalog and clear naming, use **this file** ([docs/INDEX.md](INDEX.md)).
