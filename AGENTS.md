## Learned User Preferences

- Rephrase the user's goal and provide a concise step plan before tool execution.
- Provide short progress updates while exploring, editing, and validating work.
- Prefer actionable implementation over proposing plans without changes.
- Keep responses concise and use Markdown only when semantically helpful.
- Format paths, files, functions, and classes with inline code backticks.

## Learned Workspace Facts

- GrooveGraph uses Next.js + TypeScript and Neo4j-backed graph workflows.
- The primary enrichment UX path is staged review and apply under `/enrichment`.
- `POST /api/enrich` is intentionally disabled and should remain disabled unless explicitly re-scoped.
- Triplet exploration is handled by `POST /api/enrich/explore-triplet` and feeds into review sessions.
- Enrichment validation and review logic lives primarily in `src/enrichment/review.ts` and `src/enrichment/llm/validate-bundle.ts`.
- Project workflow rules are enforced via files in `.cursor/rules/`.
