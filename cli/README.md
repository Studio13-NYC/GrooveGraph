# GrooveGraph CLI (`gg`)

Install and run from the **repository root** (so repo `.env` resolves consistently):

```bash
cd /path/to/GrooveGraph/cli
uv sync
uv run gg --help
```

See root [`AGENTS.md`](../AGENTS.md) and [`docs/USER_AND_AGENT_GUIDE.md`](../docs/USER_AND_AGENT_GUIDE.md).

`gg doctor` checks **GET `/docs`** on entity-service, **TypeDB** via `type_schema()` (returns a `types` list), and **one Brave web search** whenever **`BRAVE_API_KEY`** or **`BraveSearchApiKey`** is set in `.env`.

Standalone Brave API smoke (no entity-service / TypeDB / doctor):

```bash
uv run pytest -m brave_only -q
```

## End-to-end tests

```bash
uv sync --group dev
uv run pytest
```

`e2e` tests call **real** TypeDB, entity-service, and (when enabled) Brave. TypeDB reachability is also checked **directly** against TypeDB (no entity-service) in `test_typedb_direct_smoke_e2e.py`.

Tests marked **`entity_service`** hit **`NER_SERVICE_URL`** for `/schema-pipeline/*` and **fail** (no skip) until the API process has **`TYPEDB_*` set** per entity-service docs. To run everything except those while fixing the server:

```bash
uv run pytest -m "not entity_service" -q
```

Core connectivity (repo-root **`.env`** must exist; verifies each configured integration):

```bash
uv run pytest -m core -q
```
