# TypeDB schema (GrooveGraph v2)

Canonical **TypeQL** for **TypeDB Cloud** lives in this directory. See [`docs/v2-implementer-defaults.md`](../docs/v2-implementer-defaults.md) for layout and apply policy.

## Apply policy (conservative)

- Schema apply is **manual and deliberate** until automation is added (for example `gg typedb apply`).
- Apply to an **empty** or **dedicated** database when iterating on `define` statements; follow TypeDB Cloud docs for your deployment.
- Prefer **one** canonical file (e.g. `groovegraph-schema.tql`) until migrations are needed.

## Environment

Use the same variables as the entity-service TypeDB integration: see **§7** in [`docs/USER_AND_AGENT_GUIDE.md`](../docs/USER_AND_AGENT_GUIDE.md) (`TYPEDB_CONNECTION_STRING`, `TYPEDB_USERNAME`, `TYPEDB_PASSWORD`, `TYPEDB_DATABASE`, etc.).
