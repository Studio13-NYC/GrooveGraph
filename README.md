# GrooveGraph

Greenfield **v2** application and tooling for a **music / catalog knowledge graph**: TypeDB + TypeQL, the **`gg`** CLI, entity-service integration, and Brave-backed search. All product and tooling development for v2 happens **in this repository**.

**New agent?** Open **[`AGENTS.md`](AGENTS.md)** — rules and doc index (use as **Cursor / system context**). Then **[`docs/AGENT_ONBOARDING.md`](docs/AGENT_ONBOARDING.md)** — project brief and read order. **Handoff checklist:** **[`docs/NEXT_AGENT_TODO.md`](docs/NEXT_AGENT_TODO.md)**. **`docs/` map (active vs archive):** **[`docs/README.md`](docs/README.md)**. **Extract stimulus (Wikipedia / MusicBrainz / Discogs + Brave):** **[`docs/WEB_ENRICHMENT.md`](docs/WEB_ENRICHMENT.md)**.

## Product decisions and build defaults

- **[`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)** — **diagrams + short prose** for every `gg` workflow and how TypeDB, entity-service, Brave, and canonical APIs connect.
- **[`docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md)** — **canonical** discovery outcomes (Q1–Q33), **build defaults**, and **implementation-slice** status (replaces the former separate Q&A log and implementer-defaults docs).

Entity-service integration (including schema pipeline: raw → validate → formatted) is described in [`docs/USER_AND_AGENT_GUIDE.md`](docs/USER_AND_AGENT_GUIDE.md). Symptom matrix, pytest tags, and **`gg`** vs ES behavior: [`docs/AGENT_ENTITY_SERVICE_ISSUES.md`](docs/AGENT_ENTITY_SERVICE_ISSUES.md).

TypeQL layout and **manual apply** policy: [`typedb/README.md`](typedb/README.md). Copy [`.env.example`](.env.example) to `.env` (gitignored) for local keys.

## CLI (`gg`)

Python CLI and **`gg`** commands live under **[`cli/`](cli/README.md)** (`uv sync`, `gg doctor`, `gg schema`, `gg analyze`, pytest). Operator map: **[`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)**.

## Editor workspace (optional)

Open **`groovegraph-dev.code-workspace`** in Cursor/VS Code if you want a named single-folder workspace for this repository.

## Conventions

- Prefer small, reusable modules in this repo over importing or vendoring large external trees.
- When reusing an idea or algorithm from outside, **re-implement** it here so ownership and licensing stay clear.
