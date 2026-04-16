# GrooveGraph v2 — workflows (`gg` and integrations)

This document is the **visual map** of how the CLI, TypeDB, entity-service, and Brave fit together. For HTTP field-level detail, see [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md). For env names, see repo-root [`.env.example`](../.env.example).

---

## 1. Who talks to whom (system context)

GrooveGraph **`gg`** runs on your machine, loads **repo-root `.env`**, and coordinates three external systems:

```mermaid
flowchart LR
  subgraph local [Your machine]
    GG[gg CLI]
  end
  subgraph cloud [Network services]
    TDB[(TypeDB Cloud)]
    ES[entity-service FastAPI]
    Brave[Brave Search API]
  end
  GG -->|typedb-driver reads / writes|TDB
  GG -->|httpx POST /extract etc.|ES
  GG -->|httpx GET web search|Brave
  ES -.->|optional read-only schema pipeline|TDB
```

| System | GrooveGraph uses it for |
|--------|-------------------------|
| **TypeDB** | Catalog search (`gg search`), draft ingest (`gg ingest-draft`), pending listing (`gg pending list`), `gg doctor` type list. |
| **entity-service** | `POST /extract`, optional `POST /schema-pipeline/*`, `GET /health` (or `/ready` / `/docs`) for doctor. |
| **Brave** | Optional web search to enrich text before extract or search. |

**Important:** TypeDB credentials in **your** `.env` drive the **CLI** driver. The **schema pipeline** on entity-service uses **that service’s** process env — they are not automatically the same file.

---

## 2. Startup (every `gg` command)

```mermaid
sequenceDiagram
  participant U as Operator
  participant GG as gg Typer
  participant ENV as repo-root .env
  participant LOG as logs/gg.log
  U->>GG: uv run gg …
  GG->>ENV: load_dotenv (no override)
  GG->>LOG: setup rotating file + stderr INFO
  GG->>U: stdout JSON (or --pretty)
```

- **Repo root** is discovered by walking up from `cwd` until `typedb/` and `.env.example` exist (`repo_root_from`).
- **`--pretty`**: global form `gg --pretty <cmd>` or per-command `--pretty` after args.

---

## 3. Readiness — `gg doctor`

```mermaid
flowchart TD
  A[gg doctor] --> B[TypeDB: type_schema list]
  A --> C[entity-service: GET /health then /ready then /docs]
  A --> D[Brave: one probe search if key set]
  B --> E{all ok?}
  C --> E
  D --> E
  E -->|yes| F[exit 0 JSON ok true]
  E -->|no| G[exit 2 JSON ok false]
```

- **`--probe`**: if Brave key missing, Brave section fails (stricter check).
- Use this before relying on `search`, `schema`, or `analyze`.

---

## 4. Schema pipeline — `gg schema …`

Runs on **entity-service** only (TypeDB must be configured **on that server** for success).

```mermaid
flowchart LR
  subgraph chain [Typical chain]
    R[schema raw]
    V[schema validate]
    F[schema formatted]
  end
  R -->|JSON body|V
  V -->|stdin raw JSON|F
  R -.->|or one shot|RUN[schema run]
  RUN -.-> R
  RUN -.-> V
  RUN -.-> F
```

| Command | Role |
|---------|------|
| **`gg schema raw`** | `POST /schema-pipeline/raw` with `{"assumptions":{"entityTypes":[]}}` → raw define + assumptions JSON (entity-service requires this body shape). |
| **`gg schema validate`** | Reads **stdin** (raw JSON), `POST /schema-pipeline/validate`. |
| **`gg schema formatted`** | Reads **stdin** (raw JSON), `POST /schema-pipeline/formatted`. |
| **`gg schema run`** | Same orchestration as internal callers: raw → validate → formatted. |

**Downstream:** formatted output becomes the `schema` field on **`POST /extract`** when you use `gg search --extract`, `gg extract` (default), or `gg analyze --schema`.

---

## 5. Catalog search — `gg search`

```mermaid
flowchart TD
  S[gg search QUERY] --> T[TypeDB: substring on name per MO kind]
  S -->|if web on| W[Brave: web search]
  T --> X[JSON typedb.hits]
  W --> Y[JSON web]
  S -->|if --extract| P[schema run on entity-service]
  P --> E[POST /extract with labels from kinds + schema]
  E --> Z[JSON extract]
```

- **DB-first:** always queries TypeDB catalog (allowlisted kinds; default all MO tokens).
- **`--web` / `--no-web`:** default web **on** when `BRAVE_API_KEY` is set.
- **`--extract`:** forwards **label list** from `--types` (or all) plus schema pipeline output.

---

## 6. Discovery NER — `gg analyze`

For **greenfield** work: no catalog types required up front; **`labels: []`** so entity-service is not narrowed by your MO list.

```mermaid
flowchart TD
  A[gg analyze QUERY] -->|default| B[Skip TypeDB catalog]
  A -->|optional --typedb| T[TypeDB catalog search]
  A -->|default if key| W[Brave: rich or minimal context]
  W --> C[Build stimulus text capped]
  T --> C
  B --> C
  C -->|optional --schema| P[schema pipeline]
  P --> E[POST /extract]
  C --> E
  E --> R[JSON extract.body.entities + stimulus meta]
```

| Flag | Effect |
|------|--------|
| **`--context rich`** (default) | Several Brave titles + stripped snippets → longer text for NER. |
| **`--context minimal`** | Query + first web title only. |
| **`--use-model`** | `options.use_model: true` on `/extract`. |
| **`--schema`** | Attach schema from pipeline (needs TypeDB on entity-service). |
| **`--emit-stimulus`** | Include full stimulus text in JSON (can be large). |

Tally **`entity.label`** in **`extract.body.entities`** to plan TypeQL catalog types.

---

## 7. Direct extract — `gg extract`

```mermaid
flowchart LR
  X[gg extract --text ...] -->|default| S[schema run]
  S --> E[POST /extract]
  X -->| --no-schema | E
  E --> R[entities JSON]
```

- Optional **`--labels`** (comma-separated) filters entity-service output.
- **`--use-model`** forwards to `options.use_model`.

---

## 8. Persist drafts — `gg ingest-draft` and `gg pending list`

```mermaid
flowchart LR
  subgraph write [Write path]
    STDIN[stdin JSON envelope] --> V[Pydantic validate]
    V --> I[TypeDB insert transaction]
  end
  subgraph read [Read path]
    PL[gg pending list] --> Q[TypeDB match bounded]
    Q --> H[JSON hits]
  end
```

- **`ingest-draft`:** `ingestion-batch` + catalog entities in one write (see [`cli/README.md`](../cli/README.md) for stdin example).
- **`pending list`:** reads entities with `approval-status` filter (default `pending`).

---

## 9. Environment variables (summary)

| Variable | Used by |
|----------|---------|
| `TYPEDB_*` | CLI driver (`gg search`, `ingest-draft`, `pending`, `doctor`). |
| `NER_SERVICE_URL` | All entity-service HTTP calls (default `http://127.0.0.1:8000`). |
| `BRAVE_API_KEY` / `BraveSearchApiKey` | Brave search when enabled. |
| `OPENAI_API_KEY` | Reserved for future LLM tooling (logged as present only). |
| `GG_LOG_LEVEL` | CLI and pytest log verbosity. |

Full list: [`.env.example`](../.env.example).

---

## 10. Logs and tests

| Artifact | Purpose |
|----------|---------|
| `logs/gg.log` | Rotating CLI log (repo root). |
| `logs/pytest.log` | Pytest session log. |

**Pytest markers:** `core`, `entity_service`, `e2e`, `brave_only` — see [`cli/README.md`](../cli/README.md). Upstream schema gaps: tags in [`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md).

---

## 11. Related docs

| Doc | Content |
|-----|---------|
| [`v2-implementer-defaults.md`](v2-implementer-defaults.md) | Decisions and slice checklist. |
| [`v2-product-qa-log.md`](v2-product-qa-log.md) | Full Q&A. |
| [`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md) | Entity-service vs GrooveGraph responsibilities. |
| [`typedb/README.md`](../typedb/README.md) | Manual schema apply. |
| [`ontology/mo-coverage-matrix.md`](../ontology/mo-coverage-matrix.md) | MO coverage. |
