## Learned User Preferences

- Rephrase the user's goal and provide a concise step plan before tool execution.
- Provide short progress updates while exploring, editing, and validating work.
- Prefer actionable implementation over proposing plans without changes.
- Keep responses concise and use Markdown only when semantically helpful.
- Format paths, files, functions, and classes with inline code backticks.
- Keep local runtime deterministic: `npm run dev` must guarantee port `3000` via the project port guard.
- Avoid one-off, case-specific fixes in parsing/extraction; prefer generalized, ontology-driven, LLM-assisted logic aligned with the fuzzy architecture.
- Keep the LLM as the primary orchestrator across all pipeline stages; avoid hidden deterministic rewrites of interpreted intent.
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
