# Rules and Standards

This document catalogs all Cursor rules and coding/layout standards for GrooveGraph so contributors and tooling have one place to look.

**Generic reuse:** Generalized versions of these rules and matching doc templates for any TypeScript project live in [.cursor/rules/candidate/](../.cursor/rules/candidate/) and [docs/candidate/](candidate/). See [candidate/README.md](candidate/README.md) and [candidate/RULES_AND_STANDARDS_TEMPLATE.md](candidate/RULES_AND_STANDARDS_TEMPLATE.md).

---

## Cursor rules (`.cursor/rules/`)

| Rule file | Purpose | Applies to |
|-----------|---------|------------|
| **mermaid-diagrams.mdc** | When creating or editing Mermaid in docs: render diagram to PNG, place image first, put Mermaid source in a collapsible `<details>` section. Use paths under `docs/images/`. | `**/*.md` |
| **oop-domain.mdc** | Domain layer OOP: entities and relationships as classes, one file per type, inheritance from GraphNode/GraphEdge, split layout (`entities/`, `relationships/`), typed properties. Reference DOMAIN_MODEL for fields and edge semantics. | `src/domain/**/*.ts` |
| **feature-start-commit-tag.mdc** | Enforces feature/enhancement kickoff workflow: choose commit prefix with suggestion+override, perform documentation sweep before every commit/push, create detailed kickoff commit (plan+why), push, and increment/push `0.0.XXX` tag. | Always |
| **feature-cleanup-cruft.mdc** | Enforces cruft cleanup checkpoints (feature start and end) using `npm prune` and `npx knip`, with a mandatory human approval gate before removals. | Always |
| **ui-debug-testing.mdc** | Requires autonomous UI workflow testing: **Playwright e2e** (local and **deployed** project) preferred; browser tool when needed. Progress updates during attempts; terminal hygiene and port `3000` preflight (see runtime-hygiene subagent). For deployment/cross-origin work, run tests against the deployed site. | Always |
| **port-3000-runtime-hygiene.mdc** | Enforces deterministic local runtime on port `3000`, including stale-listener cleanup and mandatory `npm run dev` startup path with project port guard. | Always |
| **documentation-cleanup.mdc** | Keep docs accurate (verify against code), non-redundant (single catalog in docs/INDEX.md, archive old plans in docs/archive/), and indexed; update INDEX when adding or removing docs. | Always |

---

## Coding and layout standards

### TypeScript

- Use **strict** mode (no implicit any, strict null checks).
- No runtime dependency on Graphiti or agent-memory features.
- Keep docs in sync with code changes before commit/push (see `feature-start-commit-tag.mdc`).
- Use PowerShell-friendly command examples in workflow documentation where commands are shown.

### Domain layer

- **One class per file**: Each entity type (Artist, Track, Album, Instrument, etc.) and each relationship type (PerformedBy, RecordedAt, etc.) has its own file.
- **Layout**: Entity classes in `src/domain/entities/`; relationship classes in `src/domain/relationships/`; base types (GraphNode, GraphEdge) in `src/domain/`.
- **Inheritance**: Entity classes extend the base graph node type; relationship classes extend the base graph edge type. Use further inheritance where it clarifies the model (e.g. PhysicalArtifact for Instrument/Equipment).
- **Typed properties**: Prefer typed fields on the class for core attributes. Use `properties` or `meta` only for extensibility (e.g. provenance).
- **Authority**: Property lists and edge semantics are defined in [DOMAIN_MODEL.md](DOMAIN_MODEL.md).

### Diagrams (Mermaid)

- Store Mermaid source in `docs/images/*.mmd`.
- Render to `docs/images/*.png` (e.g. `npx @mermaid-js/mermaid-cli -i docs/images/<name>.mmd -o docs/images/<name>.png -e png`).
- In markdown: image first, then `<details><summary>Mermaid source</summary>` with the fenced Mermaid block.

### Commit and cleanup workflow

- Before each commit, propose a commit prefix and ask for user confirmation with override options.
- For feature/enhancement starts, first create/switch to a new feature/function branch, then create a kickoff commit with implementation plan and rationale.
- Use incremental delivery: implement in small UI-testable slices, validate each slice through browser automation, and commit frequently after each validated slice.
- Before every commit and push, perform a documentation review:
  - fix inaccuracies
  - remove obsolete statements
  - add new behavior/details introduced by the change
- At feature start and feature end, run cleanup analysis with `npm run cleanup:check` (or `npm prune` and `npx knip` separately) and present proposed removals for human approval before deleting anything.

### UI validation and runtime hygiene

- **UI testing:** Prefer **Playwright e2e** tests in `e2e/*.spec.ts`. Run locally with `npx playwright test` and against the **deployed** site with `$env:PLAYWRIGHT_BASE_URL = "https://groovegraph.s13.nyc"; npx playwright test --project=deployed`. See [UI_TESTING.md](UI_TESTING.md) and the **ui-testing** subagent (`.cursor/agents/ui-testing.md`).
- For feature, enhancement, and debug work, validate full user workflows (Playwright or browser automation) before considering work complete.
- While attempts are running, provide concise status updates (attempt, result, next step) without requiring user intervention.
- **Runtime hygiene:** Before starting local runs on port `3000`, verify the port is free and avoid duplicate/stale dev servers. Use `npm run dev` (runs port guard). See **port-3000-runtime-hygiene.mdc** and the **runtime-hygiene** subagent (`.cursor/agents/runtime-hygiene.md`).
- **Deployment:** For Azure (SWA + App Service), use scripts in `scripts/` and the **deployment** subagent (`.cursor/agents/deployment.md`). See [DEPLOY.md](DEPLOY.md).
