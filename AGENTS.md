# GrooveGraph — agent start here

**Purpose:** Operating instructions for AI agents (and humans) working in this repository. Use this file as **project context**, **Cursor rules**, or **system message** when delegating GrooveGraph v2 work so behavior stays aligned with how we build.

---

## Read order (before you change code)

1. **[README.md](README.md)** — repo role and doc index.
2. **[docs/README.md](docs/README.md)** — **map of `docs/`** (active vs [`docs/archive/`](docs/archive/)).
3. **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)** — **visual map** of `gg` commands and integrations (TypeDB, entity-service, Brave); read before changing CLI orchestration. Canonical extract stimulus (Wikipedia / MusicBrainz / Discogs + Brave): **[docs/WEB_ENRICHMENT.md](docs/WEB_ENRICHMENT.md)**.
4. **[docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md)** — **new agent brief**: what GrooveGraph v2 is, current work slice, how we work, doc read order, clone checklist.
5. **[docs/NEXT_AGENT_TODO.md](docs/NEXT_AGENT_TODO.md)** — **prioritized handoff checklist** (shipped slices + operational); update when you ship or reprioritize.
6. **[docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md)** — **canonical** product intent (Q1–Q33), **synthesized build defaults**, and **implementation-slice status**. Do not contradict it without an explicit product decision recorded there (and update this doc when you record one).
7. **[docs/USER_AND_AGENT_GUIDE.md](docs/USER_AND_AGENT_GUIDE.md)** — **entity-service** HTTP contract (`/extract`, optional `/schema-pipeline/*`). Mirrored from upstream; treat the **wire shapes** as stable.
8. **[docs/AGENT_ENTITY_SERVICE_ISSUES.md](docs/AGENT_ENTITY_SERVICE_ISSUES.md)** — when **`/extract`** or **`/schema-pipeline/formatted`** look “broken” (empty `entities`, empty `knownEntities`, 503): symptom matrix, **two TypeDB envs**, pytest **tags**, and what **`gg`** sends vs does *not* do.

---

## Non-negotiables

- **All v2 implementation lives in this repo (`GrooveGraph`).** There is no sibling legacy app in this workspace; ship v2 work only here on **`origin`**.
- **Never commit secrets.** `.env` is gitignored; only [`.env.example`](.env.example) documents variable **names**. Production uses **Azure** (or host) environment injection, not checked-in env files.
- **entity-service does not own the database.** It is a **stateless** HTTP pipeline. TypeDB access and schema evolution live in **callers** (**`cli/`** + **`gg`**, later app/worker). Python inside entity-service must not open TypeDB for writes that belong in GrooveGraph’s persistence story.
- **MO-first for the catalog model.** Lead with Music Ontology understanding and the [ontology/mo-coverage-matrix.md](ontology/mo-coverage-matrix.md), then TypeQL under [`typedb/`](typedb/README.md). Prior greenfield TypeQL (if any) is **inspiration only**, not a copy source — see Q11 in [docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md) (Appendix A).
- **Human in the loop when you are stuck.** If you are **unsure** or **confused** after consulting the docs in the read order (or the risk is **high** — product meaning, schema migration, auth, secrets, compliance), **stop** and **ask the human** for assistance. State what you already checked and what is ambiguous. **Do not** guess past serious uncertainty or ship speculative behaviour in those areas.

---

## Product principles (short)

- **Search:** database first, then web; **APIs before HTML** where a source offers both; **simple HTTP + readability-style extraction first**; optional heavier browser automation later.
- **Web → graph:** **always draft**, **`approval-status`** + **ingestion-batch / provenance**; promotion through a **simple UI later** — no silent auto-promote to “trusted” without that path.
- **Pluggable web search:** first adapter is **Brave**; keep a **narrow interface** so other providers can plug in.
- **TypeDB:** **Cloud** is the target for early work; **schema apply is manual and conservative** until automation is justified (see [typedb/README.md](typedb/README.md)).
- **Dogfooding:** we improve the system by **using** it (CLI first, chat-driven flows). Prefer commands and JSON output agents can parse (`gg`: **JSON by default**, `--pretty` for humans).

---

## How we code

- **Minimal, purposeful diffs.** Change only what the task requires. No drive-by refactors, no unrelated formatting sweeps, no new dependencies without a clear need.
- **Match the house style** in each area: read neighboring files before writing; align naming, imports, and error handling with what is already there.
- **Python (`cli/`):** **`uv`** only; **Pydantic** for models; **Typer** for `gg`; **httpx** for HTTP; **python-dotenv** loading repo-root `.env`; official **`typedb-driver`** for TypeDB Cloud. **`requires-python >=3.12`** unless the repo pin changes.
- **TypeScript (`ner-client/`):** keep the client **thin** — types + `fetch` to `/health` and `/extract` only unless the task expands it deliberately.
- **TypeQL:** lives under **`typedb/`**; start from **one** canonical file until migrations are needed. Extend schema in line with the **MO coverage matrix**, not ad hoc.
- **Tests:** **`pytest`** under **`cli/tests/`** — markers include **`core`** (repo `.env` connectivity), **`brave_only`** (standalone Brave), **`entity_service`** (HTTP schema-pipeline; **`skip`** when entity-service is unreachable or returns **503 / TypeDB-not-configured-on-server** — treat as **upstream blocked**; tags in [`docs/AGENT_ENTITY_SERVICE_ISSUES.md`](docs/AGENT_ENTITY_SERVICE_ISSUES.md) §1.2, not GrooveGraph regressions). **CI:** [`.github/workflows/cli-pytest.yml`](.github/workflows/cli-pytest.yml) runs **`pytest -m "not entity_service"`** unless you expand scope; product default on broader CI remains in [docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md) §8.
- **Generic catalog type:** TypeQL **`entity gg-generic`** (see [`typedb/groovegraph-schema.tql`](typedb/groovegraph-schema.tql)) matches the same **`owns`** shape as MO catalog rows; **`gg-generic`** is the **`POST /extract`** **`label`** and CLI kind for provisional spans. Apply schema to TypeDB before relying on it (see [`typedb/README.md`](typedb/README.md)).
- **Test data in TypeDB:** Any **persisted** rows created by **automated tests** (or ad-hoc local harnesses) must be tagged on the same **`approval-status`** field used for draft ingest lifecycle (the field that carries values like **`pending`** for operator review). Use the literal value **`test`** for those rows so they are easy to filter out and never mistaken for real pending catalog drafts.
- **Documentation:** update **this file** and **[docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md)** when you change a **product or process** decision; update **typedb/README** or **README** when you change how we apply schema or configure env.

---

## Workflow

1. **Orient:** follow the read order above; check **implementation-slice status** in [docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md) §10.
2. **Design in small steps:** MO matrix and TypeQL evolve **in parallel** when schema work is involved; do not block TypeQL on a “finished” matrix, but do not skip MO traceability (`mo-class-iri` / `mo-property-iri` literals) when the schema introduces catalog types.
3. **Integrate services locally:** entity-service on **`NER_SERVICE_URL`**; TypeDB env per USER guide §7; Brave key only where search or `doctor --probe` is in scope.
4. **Implement:** one vertical slice per change set (e.g. one `gg` subcommand, one schema concern, one doc correction).
5. **Verify:** run the relevant tests or smoke commands you added or touched; use **`gg doctor`** (when shipped) for environment sanity.
6. **Escalate if blocked:** if a decision is unclear after docs (see **When you are unsure**), **ask the human** before merging or pushing risky assumptions.
7. **Hand off:** commit messages are **clear, complete sentences**; describe what changed and why. Link issues or ADR-style notes in the body when it helps the next reader.

---

## Architecture habits

- **Middle path for ingest:** keep **shared library boundaries** inside the repo so a future **worker** can own long-running fetch/write without rewriting core logic (see Q&A on “middle path”).
- **Schema pipeline:** default **`gg`** flows use **`POST /schema-pipeline/formatted`** only (DB-backed types). **`/raw` → `/validate` → `/formatted`** is for **testing / define inspection** — see USER guide and [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md).
- **Return raw in every environment** is a **service capability**; respect whatever auth the deployed entity-service enforces.

---

## When you are unsure

1. Re-check in order: **product & build synthesis** → [docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md](docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md); **HTTP API** → [docs/USER_AND_AGENT_GUIDE.md](docs/USER_AND_AGENT_GUIDE.md).
2. If you are still **unsure** or **confused**, or the decision touches **product intent, TypeQL semantics, data safety, or secrets**, follow the **non-negotiable** above: **stop and ask the human** (summarize evidence and the exact question).

For **low-risk, purely local** choices that are fully consistent with those docs (for example a private helper name), you may proceed and note the choice in the commit message.
