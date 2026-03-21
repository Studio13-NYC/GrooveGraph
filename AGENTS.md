## Learned User Preferences

- Rephrase the user's goal and provide a concise step plan before tool execution.
- Provide short progress updates while exploring, editing, and validating work.
- Prefer actionable implementation over proposing plans without changes.
- Keep responses concise and use Markdown only when semantically helpful.
- Format paths, files, functions, and classes with inline code backticks.
- Keep local runtime deterministic: `npm run dev` must guarantee port `3000` via the project port guard.
- Avoid one-off, case-specific fixes in parsing/extraction; prefer generalized, ontology-driven, LLM-assisted logic aligned with the fuzzy architecture.
- Keep the LLM as the primary orchestrator across all pipeline stages; avoid hidden deterministic rewrites of interpreted intent.
- Keep root-cause fixes over interaction-blocking patches; do not disable core graph UX (drag, zoom, pan) to mask state bugs.
- Ensure chat typing never causes graph layout churn; preserve stable prop identities and only relayout on graph-data changes.
- Keep entity/proposal canonicalization in the LLM contract when possible; avoid deterministic post-LLM dedupe that changes intent semantics.
- Require explicit UI action feedback for proposal operations (visible state change, button state update, and no-op messaging when lists are empty).
- Keep interface copy minimal and user-facing; remove redundant instructional text and stale implementation language quickly.
- Prefer chat-first interaction with pipeline observability cards over manual builder-centric surfaces.

## Learned Workspace Facts

- GrooveGraph uses Next.js + TypeScript and Neo4j-backed graph workflows.
- The primary enrichment UX path is staged review and apply under `/enrichment`.
- `POST /api/enrich` is intentionally disabled and should remain disabled unless explicitly re-scoped.
- Triplet exploration is handled by `POST /api/enrich/explore-triplet` and feeds into review sessions.
- Generic extraction entrypoint is `POST /api/enrich/extract`; supported workflow types: `triplet` (delegates to triplet exploration), `llm_only` (same body; runs LLM-only pipeline, no external sources). LLM-only flow is validated end-to-end: call returns review session with staged candidates (default model gpt-5-nano).
- Enrichment validation and review logic lives primarily in `src/enrichment/review.ts` and `src/enrichment/llm/validate-bundle.ts`.
- Project workflow rules are enforced via files in `.cursor/rules/`.
- Runtime hygiene rule `port-3000-runtime-hygiene.mdc` requires deterministic startup on `3000` via `npm run dev`.
- Cruft cleanup runs at feature start (after kickoff commit) and feature end (before completion commit), or as standalone hygiene. Use `npm run cleanup:check` (runs `npm prune` and `npx knip`); present proposed removals in a table (Path | Reason | Estimated lines removed | Action) and do not delete or change anything until human approval (see `.cursor/rules/feature-cleanup-cruft.mdc`).
- UI validation uses **Playwright e2e** (`e2e/*.spec.ts`). For deployed-site checks run `npx playwright test --project=deployed` with `PLAYWRIGHT_BASE_URL=https://groovegraph.s13.nyc`. See `docs/UI_TESTING.md` and `.cursor/rules/ui-debug-testing.mdc`. Subagents: **runtime-hygiene** (port 3000, dev server), **ui-testing** (Playwright local/deployed), **deployment** (Azure SWA + App Service per `docs/DEPLOY.md`).
- The main discovery surface has shifted from manual clause builder toward a chat-first discovery pipeline workspace with explicit stage cards.
- Pipeline traceability now expects stage-level input/output visibility plus latency and token usage for LLM-driven steps.
- `frontend/app/components/exploration-graph-cytoscape.tsx` is the interaction-critical graph surface; keyboard leakage from chat inputs must never drive graph movement.
- In chat mode, `GraphView2D` should receive stable references for static props (for example empty sets) to avoid unnecessary Cytoscape re-layout.

## Cursor Cloud specific instructions

### Services overview

This is a single Next.js 14 fullstack app (no Docker, no separate microservices). The dev server (`npm run dev`) serves both the UI and all `/api/*` routes on port 3000.

### Required secrets

The app requires **Neo4j Aura** credentials in `.env.local` (or as environment variables): `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`. Without these, API routes that touch the graph store will throw. See `docs/neo4j.md`.

For enrichment/LLM workflows, `OPENAI_API_KEY` (or `ENRICHMENT_LLM_API_KEY`) is also needed. Without it the chat-first discovery pipeline returns an error, but the UI itself still loads.

### Running the dev server

```
npm run dev
```

This invokes the port guard (`frontend/scripts/ensure-port-3000.mjs`) then starts `next dev frontend -p 3000`. Always use this command (not `npx next dev` directly) to ensure port 3000 is free first.

### Running tests

- **Node test runner** (unit/integration): `npm run test` — requires `npm run build` first (compiles TS to `dist/`). Note: `npm run build` has pre-existing TS errors in `backend/src/enrichment/pipelines/album-contains-track.ts`, so some test files fail to resolve their compiled modules. 24 of 30 tests pass.
- **Playwright e2e**: `npx playwright test -c frontend/playwright.config.ts` — starts the dev server automatically if not running. Needs Playwright browsers installed (`npx playwright install --with-deps chromium`).

### Lint / type-check

There is no dedicated lint script in `package.json`. The Next.js build (`npm run build:web`) runs type-checking. The production build currently has a pre-existing type error in `backend/src/enrichment/adapters/musicbrainz.ts` (Set iteration requires `--downlevelIteration`).

### Key caveats

- The `.env.local` file is git-ignored. Each new VM session needs it recreated or credentials provided via environment variables.
- The CLI build (`npm run build` / `tsc -p tsconfig.cli.json`) has pre-existing errors; this is upstream and does not affect the dev server.
- `npm run build:web` (Next.js production build) also has a pre-existing type error; this does not block `npm run dev`.
