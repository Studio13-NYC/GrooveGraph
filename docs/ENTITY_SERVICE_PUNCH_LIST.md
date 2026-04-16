# Entity service — punch list (GrooveGraph v2)

GrooveGraph (**`gg`**) and other clients integrate with **entity-service** over HTTP. Some historical “punch” items mixed **entity-service** work with **client-side** responsibilities (where env vars live, what URL `doctor` calls). Below, **entity-service** items are marked **done**; **GrooveGraph** follow-ups are called out explicitly.

---

## Status

| # | Topic | Entity-service | GrooveGraph / operator |
|---|--------|----------------|----------------------|
| 1 | TypeDB env on API process | **Done:** 503 + `detail.code`, startup **WARNING** log, docs, smoke hints | **You:** when spawning ES, pass **`TYPEDB_*`** into **that** process; do not assume **`gg`** `.env` is visible to Python. |
| 2 | Machine-readable blocked errors | **Done:** `{ "detail": { "code", "message", "hint?" } }` on pipeline routes | **You:** triage **`detail.code`** (e.g. `typedb_not_configured_on_entity_service`). |
| 3 | Liveness vs `/docs` | **Done:** `GET /health`, `GET /ready` — `{ "ok": true }` | **You:** point **`gg doctor`** (or probes) at **`/health`** or **`/ready`** if **`/docs`** is disabled in production. |
| 4 | `formatted` vs `/extract` `schema` | **Done:** shared `KnownEntityPayload`; tests | **You:** keep sending **`schema`** from **`/formatted`** unchanged. |
| 5 | MO-style `labels` / hyphenated types | **Done:** parsers, TypeQL builders, aliases example, contract tests | **You:** keep **`labels`** and **`knownEntities[].label`** in the same vocabulary as TypeQL entity types. |
| 6 | Safe logging for large define text | **Done:** sizes + SHA-256 at INFO; **`ENTITY_SERVICE_DEBUG_TYPEDB_BODY`** | — |
| 7 | Smoke / short loop | **Done:** `scripts/smoke_schema_pipeline.py`, **`npm run smoke:schema-pipeline*`**, README | **You:** run smoke against the URL where ES listens. |
| 8 | Contract tests without Brave | **Done:** **`pytest -m contract`**, `tests/test_contract_offline.py` | **You:** run **`uv run pytest -q -m contract`** in CI that only checks ES contracts. |

---

## GrooveGraph tracking tags (formerly “PR tags”)

| Tag | Where it appears | What it means |
| --- | --- | --- |
| **`upstream blocked`** | Docs, agent guidance | Failure is **entity-service configuration or capability**, not a GrooveGraph regression. Fix ES env or deployment, then re-run tests. |
| **`typedb_not_configured_on_entity_service`** | `POST /schema-pipeline/*` **503** or JSON **`detail`** | TypeDB vars are missing on the **API process** that runs FastAPI. |
| **`entity_service`** | Pytest marker `@pytest.mark.entity_service` | Tests that need a **reachable** HTTP entity-service (live e2e). |
| **`blocked: entity-service not reachable`** | Pytest skip text | Nothing listening at **`NER_SERVICE_URL`**. |
| **`503`** | HTTP status on schema pipeline | Often **`typedb_not_configured_on_entity_service`** until **`detail.code`** is read. |

---

## Reference — what was delivered (entity-service)

1. **TypeDB env on API process** — **`load_typedb_http_settings()`** at **app startup** logs one **WARNING** if unset; **`docs/USER_AND_AGENT_GUIDE.md`** troubleshooting row; **`scripts/smoke_schema_pipeline.py --typedb`** surfaces **503** with a clear hint from another terminal.

2. **Stable errors** — **`app/schema_pipeline_http_errors.py`** + **`app/routes/schema_pipeline.py`**; handbook §3.

3. **Health contract** — **`GET /health`**, **`GET /ready`** in **`app/routes/health.py`**.

4. **`formatted` / `schema`** — **`SchemaPipelineFormattedResponse`**, tests in **`tests/test_schema_pipeline.py`**.

5. **MO labels** — **`app/config/aliases.py`**, **`tests/test_contract_offline.py`**, **`tests/test_typeql_builders.py`**, **`tests/test_schema_pipeline.py`**.

6. **Logging** — **`app/services/typedb_http_client.py`**.

7. **Smoke** — **`scripts/smoke_schema_pipeline.py`**, **`package.json`** scripts **`smoke:schema-pipeline`**, **`README.md`**.

8. **Offline contracts** — **`pytest -m contract`**, **`tests/test_contract_offline.py`**.

---

When you change HTTP behavior, update **`docs/USER_AND_AGENT_GUIDE.md`** / **`README.md`** and adjust this table if new tags are needed.
