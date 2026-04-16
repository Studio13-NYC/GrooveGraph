# Entity service — user and agent guide

This document is for **humans integrating** the NER / entity extraction HTTP service and for **AI agents** that need to reason about the system **end to end**. In the **entity-service** repository it complements that repo’s `README.md` and maintainer docs (for example `AGENTS.md` when present).

**GrooveGraph v2:** This file is **mirrored** under `docs/` so agents can read the HTTP contract next to product docs. GrooveGraph direction and CLI defaults: [v2-product-qa-log.md](v2-product-qa-log.md), [v2-implementer-defaults.md](v2-implementer-defaults.md), and the root [README.md](../README.md).

---

## Repository and where to read this guide

| | |
|--|--|
| **Clone (HTTPS)** | `https://github.com/Studio13/entity-service.git` |
| **Repository (browse)** | `https://github.com/Studio13/entity-service` |
| **This document on the default branch** | `https://github.com/Studio13/entity-service/blob/master/docs/USER_AND_AGENT_GUIDE.md` |
| **Path inside any checkout** | `docs/USER_AND_AGENT_GUIDE.md` |

If your published remote differs from `Studio13/entity-service` or your default branch is not `master`, run `git remote get-url origin` and `git branch --show-default` (or check your host’s default branch) and update the table so links stay correct for people you share this file with.

---

## 1. What this system is

The **entity-service** is a small stack that:

1. Exposes a **FastAPI** HTTP API that turns free text into a list of **entity candidates** (text span, label, offsets, confidence).
2. Ships a **TypeScript** client and optional **TypeDB** helpers so callers can stay **schema-aware** without putting a database inside the Python service.

**Architecture rules:**

1. **`POST /extract`** never runs TypeDB queries itself. It only consumes the **`schema`** JSON you send (built in TypeScript or elsewhere).
2. **Optional TypeDB HTTP (read-only)** — when `TYPEDB_*` / `TYPEDB_CONNECTION_STRING` are set on the **server**, FastAPI exposes **`/schema-pipeline/*`** so an orchestrator can: pull **raw** define text + sample rows from ER assumptions, **validate** types locally from that string, then fetch a **formatted** `schema` for `/extract`. This path is **read-only**; it does not define or migrate schema.

---

## 2. End-to-end data flow

```mermaid
flowchart LR
  subgraph callers [Callers]
    TS[TypeScript app]
    Other[Other HTTP clients]
  end

  subgraph optional [Optional path]
    TDB[(TypeDB Cloud / CE)]
    THelpers[src/typedb helpers]
    TDB --> THelpers
  end

  TS --> THelpers
  THelpers -->|schema slice JSON| API
  Other -->|schema optional| API
  API[FastAPI POST /extract]
  API --> Pipe[Extractor pipeline]
  Pipe --> Resp[JSON entities]
  Resp --> TS
  Resp --> Other
  API -. optional read .-> TDB
```

1. **Caller** has raw `text` and optional `labels`, `options`, and `schema`.
2. Optionally, **TypeScript** uses `@typedb/driver-http`, env-based config, and modules under `src/typedb/` to read a **slice** of the knowledge graph and normalize it to the same JSON shape as `schema`.
3. Optionally, the **same** TypeDB credentials on the server enable **`/schema-pipeline/raw` → `/validate` → `/formatted`** so the app can inspect raw ontology material, confirm types, then obtain a `schema` blob for **`POST /extract`**.
4. **FastAPI** validates the body, runs the extractor (aliases, optional model, merge, label filter), returns **`entities`**.

---

## 3. HTTP API (contract)

### `GET /health`

Returns JSON like `{ "ok": true }`. Use for readiness checks.

### `GET /ready`

Returns JSON like `{ "ok": true }` when the process is ready to serve traffic (same shape as **`/health`**; stricter deployments may distinguish the two).

### `POST /extract`

**Request body** (JSON):

| Field | Required | Meaning |
|--------|----------|---------|
| `text` | Yes | Input string to analyze. |
| `labels` | No | If non-empty, only entities whose **`label`** is in this list are returned. If omitted or `[]`, no label filter. |
| `options` | No | `{ "use_aliases": boolean, "use_model": boolean }`. Defaults: aliases **on**, model **off**. |
| `schema` | No | Optional **runtime** vocabulary: `entityTypes` + `knownEntities`. Drives extra alias rows for this request only. |

**Response body** (JSON):

| Field | Type | Meaning |
|--------|------|---------|
| `entities` | array | Each item: `text`, `label`, `start`, `end`, `confidence`. |

**Stability:** the **`/extract` response shape** (`entities[]` fields above) is treated as **stable**. New behavior is added through **optional** request fields, not by renaming or removing existing fields.

**Wire format note:** Pydantic models use **camelCase** aliases for JSON (`entityTypes`, `knownEntities`, …). Some nested compatibility with snake_case exists where configured.

### Schema resolution pipeline (optional, server + TypeDB env)

**Production path:** **`POST /schema-pipeline/formatted`** with **`{ "assumptions": { "entityTypes": [] }, "skipOntologyPrecheck": false }`** (or custom `entityTypes`) — entity-service reads **live TypeDB** and returns `{ entityTypes, knownEntities }` for **`POST /extract`**. GrooveGraph **`gg schema run`**, **`gg extract`** (default), **`gg search --extract`**, and **`gg analyze --schema`** use this path only (no **`/raw`**).

**Testing / offline inspection:** **`POST /schema-pipeline/raw`** returns `typeSchemaDefine` text plus samples; then **`/validate`** and **`/formatted`** may consume that payload when you are iterating on define text.

| Method | Path | TypeDB required | Purpose |
|--------|------|-----------------|--------|
| `POST` | `/schema-pipeline/raw` | Yes (503 if unset) | **Testing:** returns `typeSchemaDefine`, parsed entity labels, and per-type sample `answers`. Body includes `assumptions` (e.g. `{"assumptions": {"entityTypes": []}}`). |
| `POST` | `/schema-pipeline/validate` | No | Body includes `typeSchemaDefine` + `assumptions`; returns `ready` and `issues[]`. |
| `POST` | `/schema-pipeline/formatted` | Yes | Returns `{ entityTypes, knownEntities }` for `/extract`. Request body is **`assumptions`** + **`skipOntologyPrecheck`**; **`typeSchemaDefine`** is optional when types already exist in TypeDB. |

Env vars match the TypeScript driver: **`TYPEDB_CONNECTION_STRING`** and/or **`TYPEDB_ADDRESSES`**, **`TYPEDB_USERNAME`**, **`TYPEDB_PASSWORD`**, **`TYPEDB_DATABASE`**.

---

## 4. `schema` payload (TS → Python)

The `schema` object is how **callers** inject ontology- or catalog-driven hints. Build it in **TypeScript** (`src/typedb/`) or via **`POST /schema-pipeline/formatted`** when server-side TypeDB reads are enabled.

### `schema.entityTypes`

- List of **string** ids and/or objects `{ "name": string, "aliases"?: string[] }`.
- Today, matching is driven primarily by **`knownEntities`**; `entityTypes` is reserved for richer type hints and future constraints.

### `schema.knownEntities`

Each element:

| JSON field | Meaning |
|------------|---------|
| `label` | Entity **type bucket** used by the matcher and returned on candidates (must align with `labels` when filtering). |
| `canonical` or `canonical_text` | Canonical string for that entity (both keys accepted). |
| `aliases` | Optional synonym strings; each becomes an additional surface form to match. |

Python flattens these into internal **alias rows** merged with defaults from `app/config/aliases.py`. See `app/services/schema_aliases.py`.

TypeScript helper: `toEntitySchemaPayload()` in `src/typedb/schema-adapter.ts` maps a normalized `TypeDbSchemaSnapshot` into this JSON.

---

## 5. Extraction pipeline (Python)

Order of operations in `app/services/extractor.py`:

```text
text
  → [optional] alias matcher (config file + schema-derived rows)
  → [optional] GLiNER model path (if `options.use_model` and GLiNER is enabled via env + `uv sync --extra ml`)
  → merge_entity_candidates (overlap / near-duplicate policy, RapidFuzz)
  → label filter (if labels non-empty)
  → sort by (start, end, label, text)
  → return entities[]
```

| Module | Responsibility |
|--------|------------------|
| `app/routes/extract.py` | Thin route: parse body, call extractor, return JSON. |
| `app/routes/schema_pipeline.py` | Optional TypeDB **read** pipeline: `/schema-pipeline/raw`, `/validate`, `/formatted`. |
| `app/services/schema_pipeline.py` | Orchestrates raw fetch, define parsing, validate, formatted `knownEntities`. |
| `app/services/typedb_http_client.py` | Minimal TypeDB REST client (`httpx`). |
| `app/services/typedb_connection.py` | Reads the same env vars as `src/typedb/env.ts`. |
| `app/services/typedb_define_parse.py` | Parses `define` type-schema text for entity / `owns` / string attributes. |
| `app/services/typeql_builders.py` | Safe `match`/`select` builders for bounded instance reads. |
| `app/services/alias_matcher.py` | Substring alias scan, overlap handling, canonical text. |
| `app/services/schema_aliases.py` | `schema` → extra alias rows. |
| `app/services/merge.py` | Merge alias + model spans. |
| `app/services/gliner_extractor.py` | Optional GLiNER (lazy load, feature flags). |
| `app/services/spacy_extractor.py` | Stub for a possible future spaCy path (not wired into the main extractor unless you extend it). |
| `app/config/aliases.py` | Default nested alias configuration. |
| `app/schema_pipeline_models.py` | Pydantic models for pipeline requests/responses. |

---

## 6. TypeScript layout

### HTTP client (`src/ner-client/`)

| File | Role |
|------|------|
| `types.ts` | `ExtractRequest`, `ExtractResponse`, `EntitySchemaPayload`, `ExtractOptions`, etc. |
| `client.ts` | `NerServiceClient`: `health()`, `extract(req)` using `fetch`. |

Environment: `NER_SERVICE_URL` (default in smoke script: `http://127.0.0.1:8000`).

### TypeDB helpers (`src/typedb/`)

These modules **optional** integrate TypeDB **from Node/TS only**. They use `@typedb/driver-http` and never run inside Python.

| File | Role |
|------|------|
| `env.ts` | `readTypeDbEnvFromProcess()` — resolves addresses, user, password, database from env (see §7). |
| `connection-string.ts` | Parses `TYPEDB_CONNECTION_STRING` (`typedb://…@https://host:port/?name=db`). |
| `driver-factory.ts` | `createTypeDbDriver(env)`. |
| `verify-connection.ts` | `verifyTypeDbConnection(env)` — health, version, database list, `getDatabaseTypeSchema`. |
| `schema-adapter.ts` | `TypeDbSchemaSnapshot` → `toEntitySchemaPayload()` for `schema` on `/extract`. |
| `typeql-builders.ts` | Safe TypeQL fragments; `assertSafeTypeqlIdentifier` prevents injection in interpolated labels. |
| `fetch-schema-for-extraction.ts` | Bounded data reads + optional ontology preflight → snapshot for the adapter. |
| `introspect-ontology.ts` | `assertExtractionPlanInOntology`, `listEntityTypeLabels`, etc., backed by **define** type schema parsing (TypeDB 3–friendly). |
| `type-schema-define-parse.ts` | Parses `getDatabaseTypeSchema` text for `entity` / `owns` / `attribute … value string`. |
| `validate-data-concepts.ts` | Validates driver concept rows when `includeInstanceTypes` is on. |
| `with-read-transaction.ts` | Read transaction helper (open → work → close). |
| `scripts/dump-ontology.ts` | CLI: loads repo `.env`, prints type-schema prefix + parsed entity labels. |
| `index.ts` | Barrel exports for integrators. |

**Suggested integration pattern:** your TS service loads env → creates one long-lived driver (or per-request `oneShotQuery` as implemented) → builds `schema` → calls `NerServiceClient.extract({ text, schema, labels, options })`.

---

## 7. TypeDB configuration (environment)

Place a **repo-root** `.env` (gitignored) or export variables in your process.

### Priority rules (`readTypeDbEnvFromProcess`)

1. **`TYPEDB_CONNECTION_STRING`** (optional): TypeDB Cloud style URI, e.g.  
   `typedb://USER:PASS@https://HOST:PORT/?name=DATABASE`  
   - Supplies HTTP **origin** (`https://HOST:PORT`) for the driver.  
   - Optional embedded user/password.  
   - Optional default database name from query param `name=`.
2. **`TYPEDB_ADDRESSES`** (optional): comma-separated list; when set, **overrides** addresses from the connection string (e.g. `https://cluster.example.com:443`).
3. **`TYPEDB_USERNAME`**, **`TYPEDB_PASSWORD`**, **`TYPEDB_DATABASE`**: explicit credentials; **username** and **database** are required unless fully derivable from the connection string.  
   Values are **trimmed** so spaces after `=` in `.env` do not break auth.

### Connection verification

- **`verifyTypeDbConnection`** (`src/typedb/verify-connection.ts`): checks health, server version, that the database name exists in `getDatabases()`, and that `getDatabaseTypeSchema(database)` succeeds (proves schema read access without version-specific TypeQL `sub entity` probes).

### npm scripts (TypeScript)

| Script | Purpose |
|--------|---------|
| `npm test` | Vitest: connection integration (if env present), connection-string parser tests, type-schema parse tests. |
| `npm run test:typedb` | Only `typedb-connection.test.ts`. |
| `npm run typedb:dump-ontology` | Loads `.env` from cwd, prints type-schema snippet + parsed entity labels. |
| `npm run typecheck` | `tsc --noEmit` (production `src/`; test files excluded from this compile). |
| `npm run smoke` | `ts-node src/test-ner.ts` against `NER_SERVICE_URL`. |

Tests load **`.env` from `process.cwd()`** via `dotenv` (Node does not load `.env` automatically).

### Ontology validation (TypeScript)

- **`assertExtractionPlanInOntology`**: before expensive data fetches, ensures requested **entity type labels** exist in the **define** type schema and that each type **owns** the chosen string attribute (parsed from the same define text). This matches the idea that in TypeDB **everything is typed** in the schema.
- **`fetchSchemaForExtraction`**: optional `validateOntology` (default **true**); uses **`includeInstanceTypes: true`** on data reads and validates concept kinds on rows.

---

## 8. Python configuration and optional ML

| Concern | Where |
|---------|--------|
| Default aliases | `app/config/aliases.py` (`ALIASES_NESTED`). |
| GLiNER off/on | `GLINER_ENABLED`, `GLINER_MODEL_ID` (see README `ml` extra). |
| Heavy ML deps | `uv sync --extra ml`; spaCy English model via `python -m spacy download en_core_web_sm` after that. |

---

## 9. Testing matrix

| Layer | Command | Notes |
|--------|---------|------|
| Python | `uv run pytest` | Matcher, extractor, models, schema, merge, GLiNER wiring, etc. |
| TypeScript | `npm test` | Vitest; TypeDB tests **skip** if `TYPEDB_*` / connection string not set after loading `.env`. |
| Smoke | `npm run smoke` or `.\test.ps1` | End-to-end against a running API. |

---

## 10. Ontology alignment (Music Ontology and beyond)

This service does **not** parse RDF/TTL. To align with vocabularies such as the [Music Ontology](https://github.com/motools/musicontology), you map your classes to the **string labels** you send in `labels` and `schema.knownEntities[].label`, and you supply **known entities + aliases** that match how users write text. TypeDB can be the **source of truth** for those rows in TS; the HTTP body is always a **slice**, not a live graph join inside Python.

---

## 11. Troubleshooting (quick)

| Symptom | Things to check |
|---------|------------------|
| TS tests skip TypeDB integration | `.env` at repo root; `TYPEDB_USERNAME` + `TYPEDB_DATABASE` or valid `TYPEDB_CONNECTION_STRING`; run `npm test` from repo root (`cwd`). |
| `verifyTypeDbConnection` fails | Cluster URL, credentials, database name spelling; TLS / port in connection string. |
| `assertExtractionPlanInOntology` throws | Entity type or attribute not present in **define** schema; adjust `entityTypes` / `nameAttribute` or schema in TypeDB. |
| Empty `entities` with `labels` set | Candidate `label` values must appear in `labels`; schema `label` buckets must match. |
| Python import errors for GLiNER | `uv sync --extra ml` and env flags; GLiNER is optional. |

---

## 12. File map (cheat sheet)

```text
app/main.py                 FastAPI app
app/routes/extract.py       POST /extract
app/models.py               Request/response Pydantic models
app/services/extractor.py   Pipeline orchestration
app/config/aliases.py       Default aliases

src/ner-client/             HTTP client + types
src/typedb/                 TypeDB env, driver, verify, schema fetch, adapter, tests
docs/USER_AND_AGENT_GUIDE.md   This document
README.md                   Bootstrap, API tables, MO notes
AGENTS.md                   Maintainer / agent roadmap
```

---

## 13. Summary for agents (copy-paste checklist)

1. **`POST /extract`** does not query TypeDB; it only consumes optional **`schema`** JSON.  
2. **Callers** send optional **`schema`** on `POST /extract` to inject known entities and aliases.  
3. **TypeScript** `src/typedb/` can build `schema` from TypeDB using env + `@typedb/driver-http`.  
4. **Optional** same env on the **Python server** enables **`/schema-pipeline/raw`**, **`/validate`**, **`/formatted`** for raw → examine → formatted flows.  
5. **Connection string** `TYPEDB_CONNECTION_STRING` is parsed for Cloud; **`TYPEDB_ADDRESSES`** overrides hosts (TS and Python).  
6. **Ontology checks** use **define** type schema parsing + safe TypeQL for bounded data reads.  
7. **Stability** is anchored on **`entities[]`** shape; extend via optional request fields.  
8. **Tests:** `uv run pytest`, `npm test`, `npm run smoke` for different layers.

When in doubt, read **`app/services/extractor.py`** for runtime order and **`app/models.py`** for the exact JSON contract.