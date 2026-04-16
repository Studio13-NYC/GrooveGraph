# Agent brief — why entity-service (ES) may not “do its job” yet

**Audience:** AI agents and operators debugging **GrooveGraph `gg`** + **entity-service** + **TypeDB** together.

**Goal:** ES should (a) expose **`POST /schema-pipeline/formatted`** that reflects **types and sample entities already in TypeDB**, and (b) expose **`POST /extract`** that returns **non-empty `entities[]`** when given enough signal (text, `schema`, `options`).

This document is **issue-oriented**. For the upstream capability checklist, see [`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md). For HTTP field shapes, see [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md). For **`gg`** wiring, see [`WORKFLOWS.md`](WORKFLOWS.md).

---

## 1. Two different TypeDB configurations (frequent confusion)

| Process | Env vars | What fails if wrong |
|--------|----------|---------------------|
| **GrooveGraph `gg`** (CLI on your machine) | Repo-root **`.env`** → `TYPEDB_*` | `gg search`, `gg ingest-draft`, `gg doctor` TypeDB section — **not** ES schema pipeline. |
| **entity-service** (FastAPI process) | **`TYPEDB_*` on the ES process** | `POST /schema-pipeline/*` returns **503** / `typedb_not_configured_on_entity_service`; **`schema`** empty or missing; **`/extract`** may still return 200 with **no useful `schema`**. |

**Agent rule:** Never assume “TypeDB works in `gg doctor`” implies “TypeDB works inside ES.” Verify **both** sides independently.

**Tags:** `typedb_not_configured_on_entity_service`, `upstream blocked` (see punch list).

### 1.1 Generic catalog type (`gg-generic`)

**`gg-generic`** is the TypeQL **entity type** and **`POST /extract`** **`label`** for provisional / untyped spans: same **`owns`** as **`mo-*`** rows (`name`, `approval-status`, `mo-class-iri`, …). Defined in [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql) with default class IRI **`https://groovegraph.dev/ns#GenericExtractSpan`**. **`gg explore`** may append **`gg-generic`** to **`labels`** when kinds are narrowed so generics are not filtered out. **`gg explore --ingest`** **may** persist **`gg-generic`** drafts like other catalog kinds when that label is in the allowlist.

---

## 2. Symptom matrix (what you observe vs likely cause)

| Observation | Likely cause area | What to verify |
|-------------|-------------------|-----------------|
| **`POST /extract` → `200` but `entities: []`** | ES extractor path (aliases only, model off, text too short, or no `schema` signal) | Request body: `text` length, `options.use_model`, presence/shape of `schema`, `labels` filter not over-narrowing. |
| **`POST /schema-pipeline/formatted` → `200` but `knownEntities: []` (and often `entityTypes: []`)** | ES TypeDB **read** slice (queries return no rows, wrong DB, or assumptions too narrow) | ES `TYPEDB_DATABASE`, data actually inserted, ES logs for TypeQL reads, assumptions payload (`entityTypes` empty = server default — confirm server behavior). |
| **`POST /schema-pipeline/*` → `503`** | ES process has **no** TypeDB env | ES env on **same OS process** as uvicorn. |
| **`POST /schema-pipeline/raw` → `422`** (when called) | Body schema drift | Body must include valid **`assumptions`** (GrooveGraph only uses **`/raw`** for **`gg schema raw`** testing; default **`gg`** flows use **`/formatted`** only). |
| **CLI `gg search` → TypeDB errors `Type label 'mo-*' not found`** | **GrooveGraph catalog** uses MO-style labels; **your live TypeDB** may use different labels (`music-artist`, `track`, …) | Align **catalog kinds / TypeQL** with live schema, or apply repo schema to a dedicated DB. **Not** an ES bug. |

---

## 3. What GrooveGraph does today (so you do not mis-attribute bugs)

- **`gg schema run`**, **`gg extract`** (default), **`gg search --extract`**, **`gg analyze --schema`** call **`POST /schema-pipeline/formatted`** with **`{"assumptions":{"entityTypes":[]},"skipOntologyPrecheck":false}`** only. They **do not** chain **`/raw` → `/validate` → `/formatted`**.
- **`gg analyze`** (without `--schema`) sends **`/extract`** with **`labels: []`** and **no `schema`** — good for discovery, often **empty `entities`** if the model path is off.
- **`gg doctor`** checks ES **`/health`** (then **`/ready`**, **`/docs`**) — liveness only; it does **not** prove **`/extract`** returns entities.

---

## 4. “ES doing its job” — minimal acceptance checks

Run these against **`NER_SERVICE_URL`** (substitute your base URL). Capture **status + JSON** (or `detail.code` on errors).

1. **Liveness:** `GET /health` → `{ "ok": true }`.
2. **Schema slice (DB-backed):**  
   `POST /schema-pipeline/formatted`  
   `{"assumptions":{"entityTypes":[]},"skipOntologyPrecheck":false}`  
   → **`200`** and JSON keys **`entityTypes`** and **`knownEntities`** present.  
   **Issue:** If both arrays are **empty**, `/extract` may still run but **alias/schema signal is weak** until ES or data fixes that.
3. **Extract with schema:** Build `schema` from step 2, then  
   `POST /extract` with a **long** `text` (e.g. Wikipedia paragraph), `labels: []`, and `options: {"use_aliases":true,"use_model":true}` if your deployment supports the model path.  
   **Issue:** If `entities` is still empty, focus on **ES extractor config** (GLiNER / env / `use_model`), not GrooveGraph routing.

---

## 5. Evidence to attach when escalating (human or ES repo)

- **`NER_SERVICE_URL`** (redact secrets).
- **Redacted** ES process env: whether **`TYPEDB_*`** / **`TYPEDB_CONNECTION_STRING`** are set (names only).
- **Sample requests/responses** for steps 2–3 above (truncate large `typeSchemaDefine` if ever used).
- **`gg doctor`** JSON (typedb + entity_service sections).
- **GrooveGraph commit** or version if CLI behavior is in question.

---

## 6. Related docs (read order for agents)

1. [`WORKFLOWS.md`](WORKFLOWS.md) — **`gg`** sequence diagrams.  
2. [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md) — **`/extract`**, **`/schema-pipeline/*`**, options.  
3. [`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md) — upstream vs GrooveGraph ownership.  
4. [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md) — **this file** (symptoms + environment split).

---

## 7. Explicit non-claims (avoid hallucinated progress)

- GrooveGraph **does not** persist **`/extract`** results to TypeDB unless an operator runs **`gg ingest-draft`** with a valid envelope.  
- An **HTTP 200** on **`/extract`** does **not** imply non-empty **`entities`**.  
- Empty **`knownEntities`** from **`/formatted`** is a **first-class signal** that the DB-backed slice is not feeding the extractor yet — treat as **ES + data + assumptions**, not as “GrooveGraph forgot to call ES.”
