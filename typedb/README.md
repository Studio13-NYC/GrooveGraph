# TypeDB schema (GrooveGraph v2)

Canonical **TypeQL** for **TypeDB Cloud** lives in this directory. See [`docs/v2-implementer-defaults.md`](../docs/v2-implementer-defaults.md) for layout and apply policy.

## Apply policy (conservative)

- Schema apply is **manual and deliberate** until automation is added (for example `gg typedb apply`).
- Apply to an **empty** or **dedicated** database when iterating on `define` statements; follow TypeDB Cloud docs for your deployment.
- Prefer **one** canonical file (e.g. `groovegraph-schema.tql`) until migrations are needed. That file includes **`entity gg-generic`** (same `owns` as MO catalog rows) for provisional extract spans; apply schema changes to TypeDB when you add or alter it.
- **Existing databases** that already had the older schema: apply **`groovegraph-schema-add-gg-generic.tql`** once (SCHEMA transaction) instead of re-applying the full canonical file.

## Environment

Use the same variables as the entity-service TypeDB integration: see **§7** in [`docs/USER_AND_AGENT_GUIDE.md`](../docs/USER_AND_AGENT_GUIDE.md) (`TYPEDB_CONNECTION_STRING`, `TYPEDB_USERNAME`, `TYPEDB_PASSWORD`, `TYPEDB_DATABASE`, etc.).
