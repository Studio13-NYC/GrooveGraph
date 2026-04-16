# Agent onboarding — GrooveGraph v2

Use this file when you are **new to the project**. It answers: **what this is**, **what we are building now**, **how we work**, and **where to read next**. For day-one commands, see [`cli/README.md`](../cli/README.md) and [`WORKFLOWS.md`](WORKFLOWS.md).

**Taking over from a prior agent?** Read **[`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md)** first — prioritized checklist, open integrations, and verification steps.

---

## 1. What this project is

**GrooveGraph** (this repo) is the **greenfield v2** stack for a **music / catalog knowledge graph** and the tooling around it. All v2 product and CLI work ships here.

| Layer | Role |
|--------|------|
| **TypeDB** | System of record for **catalog-style entities** (names, MO-ish types, approval, ingestion provenance). Target: **TypeDB Cloud**; schema lives under **`typedb/`**. |
| **`gg` (Python CLI)** | Operator and agent interface: **readiness**, **search**, **explore**, **discovery NER**, **schema slice for extract**, **draft ingest**, **pending review**. Lives under **`cli/`**. JSON-first output for automation. |
| **entity-service (ES)** | **Stateless HTTP** service: **`POST /extract`**, optional **`POST /schema-pipeline/*`** when **its** process has TypeDB env. It does **not** own GrooveGraph’s persistence story. |
| **Brave** | First **web search** adapter: **SERP titles + snippets** merged into the extract stimulus (not full-page fetch). |
| **Canonical APIs (caller-side)** | **`gg`** calls **Wikipedia**, **MusicBrainz**, and **Discogs** (when token set) to build rich **`text`** for **`POST /extract`** before / alongside Brave. See [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md). |

**Ontology direction:** **MO-first** (Music Ontology mindset) — see [`ontology/mo-coverage-matrix.md`](../ontology/mo-coverage-matrix.md) and TypeQL under **`typedb/`**. Your **live TypeDB** schema may differ from the repo file until operators **manually apply** updates ([`typedb/README.md`](../typedb/README.md)).

---

## 2. What we are working on (current slice)

The **canonical checklist** is [`v2-implementer-defaults.md`](v2-implementer-defaults.md). In plain terms, the active arc is:

1. **Reliable integrations** — `gg doctor` (TypeDB + ES `/docs` + Brave probe on explore), clear errors when ES is missing TypeDB on the **server** process ([`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)).
2. **Operator loop** — DB-first **`gg search`** (optional **`--extract`**), **`gg explore`** (doctor + TypeDB + canonical APIs + Brave + formatted + extract), **`gg analyze`** (always runs canonical enrichment + **`/extract`**).
3. **Extract stimulus** — **Wikipedia + MusicBrainz + Discogs** (API-first) + **Brave** snippets → one **`text`** for entity-service ([`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)). Env: **`DISCOGS_TOKEN`**, **`GROOVEGRAPH_HTTP_USER_AGENT`**, optional **`WIKIPEDIA_LANG`** ([`.env.example`](../.env.example)).
4. **entity-service alignment** — **`gg-generic`** label for TypeDB-off unknown labels and optional **`useGgGenericForUnknownCatalogLabels`** on **`/extract`** (GrooveGraph search/extract sets it **true**). Upstream repo: **entity-service** in workspace / [`Studio13/entity-service`](https://github.com/Studio13/entity-service).
5. **Schema path** — Default **`gg`** flows call **`POST /schema-pipeline/formatted`** only. **`/raw`** is for **testing / define inspection** (`gg schema raw`), not the main extract path.
6. **Draft persistence** — **`gg ingest-draft`**, **`gg pending list`** (`approval-status`, `ingestion-batch`).
7. **Next product slice (not done)** — HTTP **readability** fetch of selected URLs (not via Brave content API), deeper MusicBrainz/Discogs entity follow-ups, optional Playwright for JS-heavy sites — see Q&A log and [`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md).

**Explicitly not assumed:** GitHub Actions CI (off until requested), automatic `gg typedb apply` (manual apply policy), silent promotion of web results to trusted graph data.

---

## 3. How we work (process + code)

Align with **[`AGENTS.md`](../AGENTS.md)** — it is the **binding** agent index (non-negotiables, test markers, coding rules). Summary:

| Practice | Detail |
|----------|--------|
| **Repo boundary** | All **v2 implementation** in **GrooveGraph** on **`origin`**. entity-service is a **separate** repo; mirror docs only when the HTTP contract is shared. |
| **Secrets** | Never commit **`.env`**. Names only in [`.env.example`](../.env.example). |
| **Diffs** | **Small, purposeful** changes; match neighboring style; no drive-by refactors or deps without need. |
| **Python stack** | **`uv`**, **Typer**, **Pydantic**, **httpx**, **typedb-driver**, **`pytest`**. `requires-python >= 3.12` unless the repo changes it. |
| **Tests** | Under **`cli/tests/`**. Markers: **`core`**, **`entity_service`**, **`e2e`**, **`brave_only`**. Upstream ES/TypeDB gaps → **`skip`** + tags in punch list / [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md), not fake “GrooveGraph green”. |
| **Test data in TypeDB** | Rows created by automation use **`approval_status`: `test`** ([`AGENTS.md`](../AGENTS.md)). |
| **Uncertainty** | After docs, if **product intent**, **schema safety**, **secrets**, or **compliance** is unclear → **stop and ask the human** with evidence ([`AGENTS.md`](../AGENTS.md)). |
| **Handoff** | Commit messages: **full sentences**, what changed and why. Update **`NEXT_AGENT_TODO.md`** when you finish or reprioritize a slice. |

**Workflow (repeatable):** orient (read order below) → small vertical slice → run targeted tests / `gg doctor` → commit. Prefer **`gg`** and JSON logs under **`logs/`** for dogfooding.

---

## 4. First session — read in this order

When you **implement or debug**, read **before** large changes:

1. **[`AGENTS.md`](../AGENTS.md)** — rules, read order pointer, non-negotiables.
2. **[`WORKFLOWS.md`](WORKFLOWS.md)** — **who calls whom** (diagrams): TypeDB, ES, Brave, canonical APIs, `gg`.
3. **[`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)** — **extract stimulus**: Wikipedia, MusicBrainz, Discogs, Brave; env vars; `insufficient_context`; JSON shape.
4. **[`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md)** — **prioritized handoff checklist** for the next implementer.
5. **[`v2-implementer-defaults.md`](v2-implementer-defaults.md)** — stack choices and **slice status** (done vs next).
6. **[`v2-product-qa-log.md`](v2-product-qa-log.md)** — product **Q&A**; do not contradict without a recorded decision.
7. **[`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md)** — **entity-service** HTTP contract (`/extract`, `/schema-pipeline/*`).
8. **[`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)** — if **`/extract`** or **`/formatted`** look empty or “wrong” (two TypeDB configs, symptoms).
9. **[`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md)** — upstream checklist and tags (paths refer to entity-service repo when cloned).

**Hands-on setup:**

- **Secrets:** copy [`.env.example`](../.env.example) → **`.env`** at repo root (gitignored). For canonical enrichment set **`DISCOGS_TOKEN`** and a unique **`GROOVEGRAPH_HTTP_USER_AGENT`** (see [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md) and [Discogs authentication](https://www.discogs.com/developers/page:authentication,header:authentication)).
- **TypeDB:** credentials per USER guide §7; **manual** apply of [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql) and incremental [`typedb/groovegraph-schema-add-gg-generic.tql`](../typedb/groovegraph-schema-add-gg-generic.tql) per [`typedb/README.md`](../typedb/README.md) (strip `//` comments if applying via programmatic `query()` — see TypeDB parser behavior).
- **entity-service:** run per upstream README; set **`NER_SERVICE_URL`** in `.env`. Put **`TYPEDB_*` on the ES process** if you use **`/schema-pipeline/*`** or **`useTypeDbTypes`** on **`/extract`**.
- **CLI:** [`cli/README.md`](../cli/README.md) — `cd cli`, `uv sync`, `uv run gg --help`, `uv run gg doctor`.

---

## 5. Repo layout (where things live)

| Path | Purpose |
|------|---------|
| **`cli/`** | **`gg`** package, Typer entrypoint, **`cli/tests/`** pytest. |
| **`cli/src/groovegraph/canonical_sources.py`** | Wikipedia / MusicBrainz / Discogs fetch for extract stimulus. |
| **`cli/src/groovegraph/stimulus_compose.py`** | Merge canonical + Brave → one **`text`**. |
| **`typedb/`** | Canonical **TypeQL** and apply policy. |
| **`ontology/`** | MO coverage matrix and pointers. |
| **`docs/`** | Product Q&A, workflows, ES guides, **`WEB_ENRICHMENT.md`**, **`NEXT_AGENT_TODO.md`**, agent issues. |
| **`ner-client/`** | Thin **TypeScript** types + `fetch` client for ES (optional callers). |
| **`logs/`** | Rotating **`gg.log`** / **`pytest.log`** (see [`logs/README.md`](../logs/README.md)). |
| **`groovegraph-dev.code-workspace`** | Optional VS Code / Cursor workspace file for this repo. |

---

## 6. Quick clone checklist (new machine)

```bash
git clone https://github.com/Studio13-NYC/GrooveGraph.git
cd GrooveGraph
```

Copy **`.env.example`** → **`.env`**, then `cd cli && uv sync && uv run gg doctor`.

---

## 7. When you are still stuck

1. Re-read [`v2-product-qa-log.md`](v2-product-qa-log.md) and [`v2-implementer-defaults.md`](v2-implementer-defaults.md).
2. For HTTP / ES behavior: [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md) + [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md).
3. For **`/extract`** stimulus assembly: [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md).
4. If product or data-risk remains ambiguous, follow [`AGENTS.md`](../AGENTS.md): **ask the human** with a short evidence summary.
