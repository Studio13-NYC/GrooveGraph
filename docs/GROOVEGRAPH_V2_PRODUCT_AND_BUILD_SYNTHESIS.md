# GrooveGraph v2 — product & build synthesis

**Role:** Single **canonical** doc for **product intent**, **discovery decisions (Q1–Q33)**, **synthesized build defaults**, and **implementation-slice status**. It **replaces** the former [`archive/v2-product-qa-log.md`](archive/v2-product-qa-log.md) and [`archive/v2-implementer-defaults.md`](archive/v2-implementer-defaults.md) in active use.

**Out of scope here (by design):** Operator onboarding and session guides → [`AGENT_ONBOARDING.md`](AGENT_ONBOARDING.md). Command flows and diagrams → [`WORKFLOWS.md`](WORKFLOWS.md). HTTP wire shapes → [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md). Stimulus env and APIs → [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md).

**Maintain:** When product meaning or defaults change, **edit this file** and (if you need a verbatim paper trail) append to git history or a short note under [`docs/archive/`](archive/README.md). Verbatim round-1 Q&A lives in **[`archive/v2-product-qa-log.md`](archive/v2-product-qa-log.md)**.

**Release / status (rolling):** **`v0.0.4+`** — `cli/` + `gg` (doctor, search/explore/analyze, DB-backed `formatted` assumptions, draft ingest with duplicate-name skip, optional [`cli-pytest` workflow](../.github/workflows/cli-pytest.yml)).

---

## 1. Executive snapshot

| Area | Direction |
|------|-----------|
| **Storage** | TypeDB + TypeQL; target **TypeDB Cloud**. |
| **Ontology** | **MO-first** (Music Ontology); curated matrix [`ontology/mo-coverage-matrix.md`](../ontology/mo-coverage-matrix.md); evolve matrix and TypeQL **in parallel**. |
| **Prior greenfield TypeQL** | **Inspiration only** — not a copy source (Q11). |
| **Extraction** | **entity-service** over HTTP; **does not own** the database; TypeDB writes live in **callers** (`gg`, future worker). |
| **Web → graph** | **Always draft** + **`approval-status`** + **ingestion-batch** / provenance; **no** silent auto-promote to trusted without a later review UI (Q2–Q3). |
| **Search** | **Database first**, then **web**; add graph data as discovery proceeds (Q1). |
| **Web fetch** | Prefer **APIs** over HTML where both exist; HTTP + readability-style extraction **first**; **Playwright** deferred (Q5–Q6). |
| **Web search** | **Pluggable**; v1 adapter **Brave** (Q8). |
| **First surface** | **CLI (`gg`)** before a mandatory web UI; shared library **middle path** for a future worker (Q7, Q15). |
| **Schema apply** | **Manual, deliberate** at first; **`gg typedb apply`** when automation is justified (Q32). |
| **TypeQL layout** | Start **one canonical** file under **`typedb/`**; split / numbered migrations when review cost demands it (Q33). |

---

## 2. Users & operator intent (Q1)

- **Who:** Product owner + agent (chat) first; later, site users.
- **What:** Search musicians, albums, tracks, instruments, labels, studios, gear, etc.; show **interconnections** in the graph.
- **Dogfooding:** Owner asks the agent to search; agent runs the pipeline; patterns inform improvements.

---

## 3. Data lifecycle & provenance (Q2–Q3)

- **Web-sourced writes:** **Draft + approval** (simple UI later); instances tagged **pending** (Q2).
- **TypeDB modeling:** Shared **`approval-status`** **plus** **ingestion-batch** (and related provenance attributes) — **both**, not either-or (Q3).
- **Automation tests:** Catalog rows from tests use **`approval-status: `**`test`** (see [`AGENTS.md`](../AGENTS.md)).

---

## 4. Sources, search & enrichment (Q4–Q6, Q8, Q28–Q29)

- **Sources in scope (first pass):** Wikipedia, MusicBrainz / Cover Art Archive, Discogs, official sites, YouTube/Bandcamp text, forums/Reddit, plus **general web search** for long-tail (Q4).
- **API vs HTML:** **Prefer APIs** for structured facts; HTML/readability for gaps and long-tail (Q5); Wikipedia API where appropriate.
- **Fetch layer:** HTTP + APIs + readability-style extraction **first**; heavier browser automation **later** (Q6).
- **Brave:** Pluggable search; **Brave** concrete adapter for v1 (Q8).
- **`gg doctor` + Brave:** Default checks **env present** without burning quota; **`--probe`** does **one** live search (Q28).
- **CLI output:** **JSON by default**; **`--pretty`** for humans (Q29).

Operational caps, env vars, and Wikipedia policy → **[`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)**.

---

## 5. Architecture & boundaries (Q7, Q10–Q11, Q14)

- **Ingest / fetch placement:** **Middle path** — one repo, **shared library** for fetch/normalize/draft writes, wired into the **app or CLI first**, with a **clean boundary** so a **worker** can own the same package later (Q7).
- **entity-service:** Assume **local** early (`NER_SERVICE_URL`); hosted when ops are clear (Q10).
- **Return raw / schema pipeline:** Capability in **every** environment; access per **service auth** (Q14). GrooveGraph default operator flows use **`POST /schema-pipeline/formatted`** only for the DB-backed slice; **`/raw` → `/validate` → `/formatted`** is for inspection and tooling (see [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md)).

---

## 6. TypeDB, MO & schema files (Q9, Q12–Q13, Q30–Q33)

- **Deployment:** **TypeDB Cloud** for early v2 (Q9).
- **MO grounding:** **MO-first** — matrix leads; TypeQL follows; do not block TypeQL on a “finished” matrix (Q12–Q13).
- **Coverage matrix path:** **`ontology/mo-coverage-matrix.md`** (Q30; errata: filename settled after Q30 text).
- **Canonical TypeQL on disk:** **`typedb/`** at repo root (Q31).
- **Apply policy:** **Manual** documented apply first; **`gg typedb apply`** once schema and review justify it (Q32).
- **Single file vs migrations:** **One canonical** `.tql` initially (e.g. `typedb/groovegraph-schema.tql`); numbered migrations when incremental change and review require it (Q33).

Details: **[`typedb/README.md`](../typedb/README.md)**.

---

## 7. CLI & Python stack (Q15–Q22, Q25–Q27)

| Topic | Decision |
|--------|----------|
| **First milestone surface** | **CLI first**; web UI can follow (Q15). |
| **Language** | **Python** for `cli/`; **Pydantic** for models (Q16). |
| **Layout** | **`cli/`** at repo root with its own **`pyproject.toml`** (Q17). |
| **Toolchain** | **`uv`** always (Q18). |
| **Env** | **Auto-load** repo-root **`.env`** via **python-dotenv** (Q19). |
| **TypeDB from CLI** | Official **TypeDB Python** driver as first-class dep (Q20). |
| **Console script** | **`gg`** (Q21). |
| **Secrets** | **`.env` gitignored**; **`.env.example`** names only; cloud via **Azure** (or host) env injection (Q22). |
| **Python version** | **`requires-python >= 3.12`** in `cli/pyproject.toml` unless revised (Q25). |
| **CLI framework** | **Typer** (default implementer choice) (Q26). |
| **First subcommand** | **`gg doctor`** (readiness: TypeDB, ES, Brave config / optional probe) before heavier flows (Q27). |

---

## 8. Tests & CI (Q23–Q24)

- **Tests from early `cli/`:** **Yes** — **pytest** + smoke-style coverage (Q23).
- **Q24 (original):** Keep **GitHub Actions out** until the repo is wired for CI the way you want.
- **Current reconciliation (2026-04-16):** [`.github/workflows/cli-pytest.yml`](../.github/workflows/cli-pytest.yml) runs **`pytest -m "not entity_service"`** as an **optional** default signal. Treat **broader CI** (all markers, secrets in CI) as still **product-owned** when you expand beyond that workflow.

---

## 9. Synthesized defaults (implementer judgment)

Derived from Q&A plus conservative follow-ons. **Change this table** when direction shifts; use **Appendix B** for the Q trace.

| Topic | Default |
|--------|---------|
| **Future `gg` work** | **`gg search`** (DB then web) as the catalog loop matures; **`gg typedb apply`** when schema automation is justified (Q32). |
| **HTTP client in `cli/`** | **`httpx`** for Brave, entity-service, and other REST calls. |
| **`requires-python`** | **`>=3.12`** in `cli/pyproject.toml` until a reason appears to widen or narrow. |
| **Manual schema apply** | Documented in **`typedb/README.md`** and root **`README.md`**: env vars, empty-DB expectation, deliberate apply until automation. |
| **Lint / format (Python)** | Add **`ruff`** when `cli/` grows enough to justify it. |
| **Ingest library boundary** | Keep **`cli/`** thin: shared **pure modules** under `cli/src/groovegraph/` (or future `packages/`) — **middle path** (Q7). |
| **Pending + provenance in TypeQL** | **`approval-status`** + **ingestion-batch** in the same MO-first pass (Q2–Q3). |
| **stderr / stdout** | **stdout JSON-only** for machine default; **`--pretty`** for humans; optional structured stderr later. |

---

## 10. Implementation slice status (round 1)

| Step | Status | Notes |
|------|--------|-------|
| 1. **`.gitignore` + `.env.example`** | **Done** | Repo root; `.env` gitignored. |
| 2. **`typedb/`** + **`typedb/README.md`** | **Done** | `groovegraph-schema.tql` — MO-aligned catalog slice; manual apply. |
| 3. **`ontology/mo-coverage-matrix.md`** | **Done** | MVP rows; evolve with TypeQL. |
| 4. **`cli/`** + **`gg` entry** | **Done** | `uv`, Typer, Pydantic, python-dotenv, httpx, TypeDB driver, pytest; script **`gg`**. |
| 5. **`gg doctor`** | **Done** | JSON / `--pretty`; TypeDB type list; ES **`/health`** (fallback **`/ready`**, **`/docs`**); Brave key presence + optional **`--probe`**. |
| 6. **`gg schema *`** | **Done** | DB-backed **`POST /schema-pipeline/formatted`**; `raw\|validate\|formatted` for testing per USER guide. |
| 7. **Catalog operator loop** | **Done (slice)** | **`gg search`**, **`gg analyze`**, **`gg extract`**, **`gg ingest-draft`**, **`gg pending list`**, **`gg explore --ingest`**. Canonical enrichment, optional supplementary HTTP + deep artist context, catalog **`entityTypes`** on formatted — see [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md), [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md). **Next:** richer MO relations, **`gg typedb apply`**, Playwright-class fetch when justified. |

---

## Appendix A — Q&A index (round 1, 2026-04-15)

Verbatim questions and discussion → **[`archive/v2-product-qa-log.md`](archive/v2-product-qa-log.md)**.

| Q | Short topic | One-line outcome |
|---|-------------|------------------|
| Q1 | Primary users / E2E | DB-first search; graph growth; agent dogfooding. |
| Q2 | Web write policy | Always draft + approval UI later; `pending`. |
| Q3 | Pending in TypeDB | `approval-status` + ingestion-batch. |
| Q4 | First web sources | Broad list + general search; exclusions TBD. |
| Q5 | API vs HTML | Prefer API; HTML for gaps. |
| Q6 | HTTP vs Playwright | Simple HTTP/API/readability first. |
| Q7 | Where ingest runs | Middle path: shared lib; app/CLI first, worker later. |
| Q8 | Web search provider | Pluggable; Brave v1. |
| Q9 | TypeDB deployment | TypeDB Cloud. |
| Q10 | entity-service deploy | Local first; hosted later. |
| Q11 | Prior TypeQL | Inspiration only. |
| Q12 | MO vs TypeQL order | MO-first. |
| Q13 | Matrix vs TypeQL timing | Parallel; MO-shaped parsing; return raw; DB-driven extract vocabulary. |
| Q14 | Return raw environments | Every env; service auth. |
| Q15 | Next vs CLI | CLI first milestone. |
| Q16 | CLI language | Python + Pydantic. |
| Q17 | `cli/` location | Root `cli/` + own pyproject. |
| Q18 | Toolchain | `uv`. |
| Q19 | `.env` loading | Auto-load repo-root `.env`. |
| Q20 | TypeDB from CLI | Official Python driver. |
| Q21 | Script name | `gg`. |
| Q22 | Secrets in repo | `.env` ignored; `.env.example`; Azure in cloud. |
| Q23 | Tests | pytest from early meaningful change. |
| Q24 | GitHub Actions | Originally “out until wired”; optional narrow workflow added later — see §8. |
| Q25 | Python version | Implementer picks modern pin → **3.12+**. |
| Q26 | CLI framework | Typer (default). |
| Q27 | First subcommand | `gg doctor`. |
| Q28 | Brave in doctor | Env check + optional live probe. |
| Q29 | Default output | JSON default; `--pretty`. |
| Q30 | MO matrix path | Under `ontology/`. |
| Q31 | TypeQL on disk | Root `typedb/`. |
| Q32 | Apply via `gg` | Manual first; `gg typedb apply` later. |
| Q33 | Single file vs migrations | One canonical file first. |

---

## Appendix B — Errata (frozen answers vs repo tree)

- **Q30:** Matrix file is **`ontology/mo-coverage-matrix.md`** (answer text predates the exact filename; location **`ontology/`** matches).
