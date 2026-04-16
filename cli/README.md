# GrooveGraph CLI (`gg`)

Install and run from **inside the GrooveGraph checkout** (so repo-root `.env` resolves):

```bash
cd /path/to/GrooveGraph/cli
uv sync
uv run gg --help
```

## Where to read next

- **[`docs/WORKFLOWS.md`](../docs/WORKFLOWS.md)** — **diagrams and narrative** for every `gg` path (doctor, schema, search, analyze, extract, ingest, pending).
- **[`AGENTS.md`](../AGENTS.md)** — agent rules and doc index.
- **[`docs/USER_AND_AGENT_GUIDE.md`](../docs/USER_AND_AGENT_GUIDE.md)** — entity-service HTTP contract.

`gg doctor` checks **TypeDB** (`type_schema`), entity-service (**`/health` → `/ready` → `/docs`**), and **one Brave** search when a Brave key is set.

## Logging

- **File:** `../logs/gg.log` (rotating) — [`logs/README.md`](../logs/README.md).
- **Console:** INFO+ on stderr; DEBUG in file by default.
- **Env:** `GG_LOG_LEVEL` in repo-root `.env` ([`.env.example`](../.env.example)).
- **Pytest:** `../logs/pytest.log` via `cli/tests/conftest.py`.

## Pretty JSON

Use **`gg --pretty <cmd>`** (global before subcommand) or **`--pretty`** after the subcommand args.

## `gg ingest-draft` stdin shape

```json
{
  "ingestion_batch_id": "cli-2026-04-16-001",
  "catalog_entities": [
    {
      "kind": "mo-music-artist",
      "name": "Talking Heads",
      "approval_status": "pending",
      "mo_class_iri": "http://purl.org/ontology/mo/MusicArtist",
      "source_url": "https://example.com/evidence"
    }
  ],
  "extract": { "entities": [] },
  "notes": "optional audit note"
}
```

Harness rows: set `"approval_status": "test"` ([`AGENTS.md`](../AGENTS.md)).

## Tests

```bash
uv sync --group dev
uv run pytest
```

- **`e2e`** — real TypeDB, entity-service, Brave when configured.
- **`entity_service`** — schema pipeline HTTP; may **skip** if unreachable or upstream-blocked ([`docs/ENTITY_SERVICE_PUNCH_LIST.md`](../docs/ENTITY_SERVICE_PUNCH_LIST.md)).

```bash
uv run pytest -m "not entity_service" -q
uv run pytest -m brave_only -q
uv run pytest -m core -q
```

Canonical TypeQL: [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql) (apply manually; see [`typedb/README.md`](../typedb/README.md)).
