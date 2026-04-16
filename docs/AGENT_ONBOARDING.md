# Agent onboarding — GrooveGraph v2

Use this file when you are **new to the project**. It answers: **what this is**, **what we are building now**, **how we work**, and **where to read next**. For day-one commands, see [`cli/README.md`](../cli/README.md) and [`WORKFLOWS.md`](WORKFLOWS.md).

---

## 1. What this project is

**GrooveGraph** (this repo) is the **greenfield v2** stack for a **music / catalog knowledge graph** and the tooling around it. We are **not** extending the legacy app in place; we **replace** [GrooveGraph-next](https://github.com/Studio13-NYC/GrooveGraph-next) over time.

| Layer | Role |
|--------|------|
| **TypeDB** | System of record for **catalog-style entities** (names, MO-ish types, approval, ingestion provenance). Target: **TypeDB Cloud**; schema lives under **`typedb/`**. |
| **`gg` (Python CLI)** | Operator and agent interface: **readiness**, **search**, **discovery NER**, **schema slice for extract**, **draft ingest**, **pending review**. Lives under **`cli/`**. JSON-first output for automation. |
| **entity-service (ES)** | **Stateless HTTP** service: **`POST /extract`**, optional **`POST /schema-pipeline/*`** when **its** process has TypeDB env. It does **not** own GrooveGraph’s persistence story. |
| **Brave** | First **web search** adapter for enrichment (`gg search`, `gg analyze`). |
| **GrooveGraph-next** | **v1 read-only reference** only (tag `v1-reference-for-v2`). Do not ship v2 work there unless the product owner explicitly says so. |

**Ontology direction:** **MO-first** (Music Ontology mindset) — see [`ontology/mo-coverage-matrix.md`](../ontology/mo-coverage-matrix.md) and TypeQL under **`typedb/`**. Your **live TypeDB** schema may differ from the repo file until operators **manually apply** updates ([`typedb/README.md`](../typedb/README.md)).

---

## 2. What we are working on (current slice)

This moves; the **canonical checklist** is [`v2-implementer-defaults.md`](v2-implementer-defaults.md). In plain terms, the active arc is:

1. **Reliable integrations** — `gg doctor` (TypeDB + ES `/health` + Brave), clear errors when ES is missing TypeDB on the **server** process.
2. **Operator loop** — DB-first **`gg search`**, Brave enrichment, **`gg analyze`** for NER discovery (optional **`--schema`** so ES gets a DB-backed **`schema`**), **`gg extract`** for ad-hoc text.
3. **Schema path** — Default **`gg`** flows call **`POST /schema-pipeline/formatted`** only (types already in TypeDB). **`/raw`** is for **testing / define inspection** (`gg schema raw`), not the main extract path.
4. **Draft persistence** — **`gg ingest-draft`** (stdin envelope) and **`gg pending list`** for human-in-the-loop catalog rows (`approval-status`, `ingestion-batch`).
5. **Docs and agent ergonomics** — [`WORKFLOWS.md`](WORKFLOWS.md) (diagrams), [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md) (empty `entities` / dual TypeDB env debugging), [`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md) (upstream vs GrooveGraph).

**Explicitly not assumed:** GitHub Actions CI (off until requested), automatic `gg typedb apply` (manual apply policy), silent promotion of web results to trusted graph data.

---

## 3. How we work (process + code)

Align with **[`AGENTS.md`](../AGENTS.md)** — it is the **binding** agent index (non-negotiables, test markers, coding rules). Summary:

| Practice | Detail |
|----------|--------|
| **Repo boundary** | All **v2 implementation** in **GrooveGraph** `origin`. v1 at **`groovegraph-next-v1`** remote + tag — **`git show` / `git grep`**, re-implement; no bulk copy. |
| **Secrets** | Never commit **`.env`**. Names only in [`.env.example`](../.env.example). |
| **Diffs** | **Small, purposeful** changes; match neighboring style; no drive-by refactors or deps without need. |
| **Python stack** | **`uv`**, **Typer**, **Pydantic**, **httpx**, **typedb-driver**, **`pytest`**. `requires-python >= 3.12` unless the repo changes it. |
| **Tests** | Under **`cli/tests/`**. Markers: **`core`**, **`entity_service`**, **`e2e`**, **`brave_only`**. Upstream ES/TypeDB gaps → **`skip`** + tags in punch list / [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md), not fake “GrooveGraph green”. |
| **Test data in TypeDB** | Rows created by automation use **`approval_status`: `test`** so they are filterable and never confused with real pending drafts ([`AGENTS.md`](../AGENTS.md)). |
| **Uncertainty** | After docs, if **product intent**, **schema safety**, **secrets**, or **compliance** is unclear → **stop and ask the human** with evidence ([`AGENTS.md`](../AGENTS.md)). |
| **Handoff** | Commit messages: **full sentences**, what changed and why. |

**Workflow (repeatable):** orient (read order below) → small vertical slice → run targeted tests / `gg doctor` → commit. Prefer **`gg`** and JSON logs under **`logs/`** for dogfooding.

---

## 4. First session — read in this order

When you **implement or debug**, read **before** large changes:

1. **[`AGENTS.md`](../AGENTS.md)** — rules, read order pointer, non-negotiables.
2. **[`WORKFLOWS.md`](WORKFLOWS.md)** — **who calls whom** (diagrams): TypeDB, ES, Brave, `gg`.
3. **[`v2-implementer-defaults.md`](v2-implementer-defaults.md)** — stack choices and **slice status** (done vs next).
4. **[`v2-product-qa-log.md`](v2-product-qa-log.md)** — product **Q&A**; do not contradict without a recorded decision.
5. **[`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md)** — **entity-service** HTTP contract (`/extract`, `/schema-pipeline/*`).
6. **[`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)** — if **`/extract`** or **`/formatted`** look empty or “wrong” (two TypeDB configs, symptoms).
7. **[`ENTITY_SERVICE_PUNCH_LIST.md`](ENTITY_SERVICE_PUNCH_LIST.md)** — upstream checklist and tags.

**Hands-on setup:**

- **Secrets:** copy [`.env.example`](../.env.example) → **`.env`** at repo root (gitignored).
- **TypeDB:** credentials per USER guide §7; **manual** apply of [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql) per [`typedb/README.md`](../typedb/README.md).
- **entity-service:** clone [`Studio13/entity-service`](https://github.com/Studio13/entity-service), run per upstream README; set **`NER_SERVICE_URL`** in `.env`. Put **`TYPEDB_*` on the ES process** if you use the schema pipeline.
- **CLI:** [`cli/README.md`](../cli/README.md) — `uv sync`, `uv run gg --help`, `uv run gg doctor`.

---

## 5. Repo layout (where things live)

| Path | Purpose |
|------|---------|
| **`cli/`** | **`gg`** package, Typer entrypoint, **`cli/tests/`** pytest. |
| **`typedb/`** | Canonical **TypeQL** and apply policy. |
| **`ontology/`** | MO coverage matrix and pointers. |
| **`docs/`** | Product Q&A, workflows, ES guides, agent issues. |
| **`ner-client/`** | Thin **TypeScript** types + `fetch` client for ES (optional callers). |
| **`logs/`** | Rotating **`gg.log`** / **`pytest.log`** (see [`logs/README.md`](../logs/README.md)). |
| **`groovegraph-dev.code-workspace`** | Opens this repo + sibling **GrooveGraph-next** for reference. |

---

## 6. v1 reference (GrooveGraph-next) — how to use it

**Goal:** Keep v1 as **read-only** reference (remote + tag + workspace), not a second place to commit v2.

### Remotes and tag

- **GrooveGraph** should have remote **`groovegraph-next-v1`** → `https://github.com/Studio13-NYC/GrooveGraph-next.git`. Run **`git fetch groovegraph-next-v1`** periodically.
- **v1 snapshot tag:** **`v1-reference-for-v2`** on GrooveGraph-next `main` (see root [`README.md`](../README.md) for `git show` examples).

### Inspect v1 without copying

From **GrooveGraph** root:

```bash
git fetch groovegraph-next-v1
git show groovegraph-next-v1/v1-reference-for-v2:README.md
git grep -n "session" groovegraph-next-v1/v1-reference-for-v2 -- product/src
```

Replace the path after the colon with any v1 path you need.

### Side-by-side in Cursor / VS Code

1. Clone **GrooveGraph-next** as a **sibling** of GrooveGraph (e.g. `../GrooveGraph-next`).
2. Open **`groovegraph-dev.code-workspace`** from the GrooveGraph root.
3. Use v1 folder for **search/navigation only**; commit v2 work only on **GrooveGraph** `origin`.

### Conventions

- Prefer **`git show` / `git grep`** over vendoring v1 trees.
- **Re-implement** ideas from v1 in GrooveGraph; do not add GrooveGraph-next as a submodule unless the team decides explicitly.

---

## 7. Quick clone checklist (new machine)

```bash
git clone https://github.com/Studio13-NYC/GrooveGraph.git
git clone https://github.com/Studio13-NYC/GrooveGraph-next.git
cd GrooveGraph
git remote -v
git fetch groovegraph-next-v1
```

Copy **`.env.example`** → **`.env`**, then `cd cli && uv sync && uv run gg doctor`.

---

## 8. When you are still stuck

1. Re-read [`v2-product-qa-log.md`](v2-product-qa-log.md) and [`v2-implementer-defaults.md`](v2-implementer-defaults.md).
2. For HTTP / ES behavior: [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md) + [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md).
3. If product or data-risk remains ambiguous, follow [`AGENTS.md`](../AGENTS.md): **ask the human** with a short evidence summary.
