# GrooveGraph

Greenfield **v2** application and tooling for a **music / catalog knowledge graph**: TypeDB + TypeQL, the **`gg`** CLI, entity-service integration, and Brave-backed search. All product and tooling development for v2 happens **in this repository**.

**New agent?** Open **[`AGENTS.md`](AGENTS.md)** — rules and doc index (use as **Cursor / system context**). Then **[`docs/AGENT_ONBOARDING.md`](docs/AGENT_ONBOARDING.md)** — project brief and read order. **Handoff checklist:** **[`docs/NEXT_AGENT_TODO.md`](docs/NEXT_AGENT_TODO.md)**. **Extract stimulus (Wikipedia / MusicBrainz / Discogs + Brave):** **[`docs/WEB_ENRICHMENT.md`](docs/WEB_ENRICHMENT.md)**.

## Product decisions and build defaults

- **[`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)** — **diagrams + short prose** for every `gg` workflow and how TypeDB, entity-service, Brave, and canonical APIs connect.
- **[`docs/v2-product-qa-log.md`](docs/v2-product-qa-log.md)** — discovery **Q&A** (users, search, TypeDB, CLI, env, and so on).
- **[`docs/v2-implementer-defaults.md`](docs/v2-implementer-defaults.md)** — **canonical implementer defaults** (synthesized from Q&A + Q33 TypeQL layout) and the **first implementation slice** checklist.

Entity-service integration (including schema pipeline: raw → validate → formatted) is described in [`docs/USER_AND_AGENT_GUIDE.md`](docs/USER_AND_AGENT_GUIDE.md).

TypeQL layout and **manual apply** policy: [`typedb/README.md`](typedb/README.md). Copy [`.env.example`](.env.example) to `.env` (gitignored) for local keys.

## CLI (`gg`)

Python CLI and **`gg`** commands live under **[`cli/`](cli/README.md)** (`uv sync`, `gg doctor`, `gg schema`, `gg analyze`, pytest). Operator map: **[`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)**.

## Editor workspace (optional)

Open **`groovegraph-dev.code-workspace`** in Cursor/VS Code if you want a named single-folder workspace for this repository.

## Conventions

- Prefer small, reusable modules in this repo over importing or vendoring large external trees.
- When reusing an idea or algorithm from outside, **re-implement** it here so ownership and licensing stay clear.
