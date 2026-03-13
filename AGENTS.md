# AGENTS.md

This file gives a new agent enough context to start productive work in GrooveGraph without re-discovering the codebase from scratch.

## Project Snapshot

- Project: `GrooveGraph`
- Stack: `Next.js` + `TypeScript` + `Neo4j Aura`
- Purpose: Recorded-music property graph for relationship discovery and curator-led enrichment
- Status: Dynamic web app with graph/query exploration and staged enrichment review/apply workflows

## Product and Architecture (Source of Truth)

Read these docs first, in order:

1. `README.md` (high-level project state and runbook)
2. `docs/DOMAIN_MODEL.md` (canonical entity labels, properties, relationship semantics)
3. `docs/ARCHITECTURE.md` (layer model and graph primitives)
4. `docs/ENRICHMENT_PROCESS.md` (collect/verify/review/load and triplet workflow)
5. `docs/FUNCTIONAL_SPEC.md` (functional requirements and v1 scope)
6. `docs/RULES_AND_STANDARDS.md` (coding and workflow standards)

## Runtime Topology

- Frontend: Next.js app routes and client components in `app/`
- APIs: Next route handlers in `app/api/**/route.ts`
- Graph store abstraction and persistence:
  - Interface and domain services under `src/`
  - Neo4j runtime adapter used in production
- Enrichment engine:
  - Core types: `src/enrichment/types.ts`
  - Session/review/apply engine: `src/enrichment/review.ts`
  - Validation gate: `src/enrichment/llm/validate-bundle.ts`
  - Triplet parsing/helpers: `src/enrichment/triplet.ts`
  - Triplet LLM pipeline: `src/enrichment/pipelines/triplet-exploration.ts`

## Enrichment Workflows (Current Behavior)

### 1) Staged review workflow (primary path)

- Enrichment work is performed via `/enrichment`
- Review session stages candidates (properties, nodes, edges) with provenance
- Human review rejects bad candidates before apply
- Apply persists only non-rejected candidates to Neo4j

### 2) Triplet exploration workflow

- Route: `POST /api/enrich/explore-triplet`
- Input format: `subjectType:subjectName RELATIONSHIP objectType:objectName`
- Supports `any` for subject/object; `scope` is required when any placeholder is used
- Pipeline runs LLM exploration, validates bundle, imports candidates into a review session
- Writes still require review/apply (no bypass)

### 3) Direct shortcut route status

- `POST /api/enrich` is intentionally disabled (`410`) and should not be reintroduced casually

## LLM and Provider Defaults

- Triplet pipeline model default: `gpt-5.4`
- Model is env-configurable:
  - `OPENAI_MODEL` or `ENRICHMENT_LLM_MODEL`
- Base URL and key:
  - `OPENAI_BASE_URL` or `ENRICHMENT_LLM_BASE_URL`
  - `OPENAI_API_KEY` or `ENRICHMENT_LLM_API_KEY`
- Long-run timeout knobs:
  - `TRIPLET_LLM_TIMEOUT_MS`
  - `ENRICHMENT_LLM_TIMEOUT_MS`
- Transport: `undici` with explicit timeout config in triplet pipeline

## Important Routes and Files

- Graph query/visualization APIs:
  - `app/api/graph/route.ts`
  - `app/api/query-artist/route.ts`
- Enrichment APIs:
  - `app/api/enrich/review-session/route.ts`
  - `app/api/enrich/review-session/[id]/route.ts`
  - `app/api/enrich/review-session/[id]/import/route.ts`
  - `app/api/enrich/review-session/[id]/decisions/route.ts`
  - `app/api/enrich/review-session/[id]/apply/route.ts`
  - `app/api/enrich/explore-triplet/route.ts`
  - `app/api/enrich/route.ts` (disabled shortcut)

## Commands You Will Use Often

- Install deps: `npm install`
- Build TypeScript: `npm run build`
- Build web app: `npm run build:web`
- Dev server: `npm run dev`
- Start prod build locally: `npm run start`
- Run tests (compiled JS tests): `npm test`
- Load graph into Neo4j: `npm run load:neo4j`
- Query by artist (CLI): `npm run query -- "Artist Name"`

## Non-Negotiable Workflow Rules

Rules are defined under `.cursor/rules/`.

### Commit start/tag/docs workflow (`feature-start-commit-tag.mdc`)

- For feature/enhancement starts:
  1. Create/switch to a new feature/function branch
  2. Select commit prefix (`feat`, `enhance`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`)
  3. Perform documentation update sweep before commit/push
  4. Create kickoff commit with plan + why
  5. Push branch
  6. Create and push next `0.0.XXX` tag
- Prefix selection requires suggestion + user override choice before commit
- Deliver in small UI-testable slices (no big-bang), run browser automation after each slice, and commit frequently after validated increments

### Cleanup workflow (`feature-cleanup-cruft.mdc`)

- Run cleanup checks at feature start and feature end:
  - `npm prune`
  - `npx knip`
- Present concrete removal proposal (paths/reasons/estimated line impact)
- Do not remove until human approval

### Domain and docs style rules

- `oop-domain.mdc`: one class per file in domain layer, typed entities/relationships
- `mermaid-diagrams.mdc`: render diagrams to images and keep Mermaid source in collapsible details
- `ui-debug-testing.mdc`: autonomous browser-driven end-to-end workflow testing with progress updates and terminal/port-`3000` preflight hygiene

## Current Planning Artifact

- Generic future-state enrichment roadmap:
  - `docs/generic_enrichment_plan_719e1170.plan.md`
- This is a plan document, not fully implemented behavior

## Known Agent Pitfalls

- Do not import server-only enrichment barrel modules into client components if that pulls Node-only deps
- Keep label normalization aligned with canonical `ENTITY_LABELS` to avoid validation failures
- Ensure candidate edge refs (`fromRef.id`, `toRef.id`) match `nodeCandidates[].candidateId` exactly in triplet-generated bundles
- Handle long LLM calls as potentially slow; timeout defaults are intentionally extended

## First-Hour Checklist For A New Agent

1. Read the six source-of-truth docs listed above
2. Run `npm install`
3. Run `npm run build` and `npm run build:web` to verify baseline
4. Skim key enrichment files:
   - `src/enrichment/review.ts`
   - `src/enrichment/llm/validate-bundle.ts`
   - `src/enrichment/pipelines/triplet-exploration.ts`
   - `app/api/enrich/explore-triplet/route.ts`
5. Confirm intended workflow path is staged review (`/enrichment`), not direct `/api/enrich`

## Documentation Maintenance Standard

When code changes behavior, update relevant docs in the same change set:

- Correct stale statements
- Remove obsolete behavior notes
- Add new operational details (routes, env vars, constraints)
- Keep terminology consistent with `DOMAIN_MODEL.md` and enrichment contracts
