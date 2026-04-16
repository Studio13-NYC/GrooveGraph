# GrooveGraph — agent start here

**Purpose:** Operating instructions for AI agents (and humans) working in this repository. Use this file as **project context**, **Cursor rules**, or **system message** when delegating GrooveGraph v2 work so behavior stays aligned with how we build.

---

## Read order (before you change code)

1. **[README.md](README.md)** — repo role, v1 reference rules, doc index.
2. **[docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md)** — **“Implementing v2 — first session”**: ordered steps, **entity-service** runtime, `.env`, TypeDB manual apply, **next deliverable** in the tree.
3. **[docs/v2-implementer-defaults.md](docs/v2-implementer-defaults.md)** — **canonical** stack choices, tool versions, and **implementation-slice status** (what is done vs next).
4. **[docs/v2-product-qa-log.md](docs/v2-product-qa-log.md)** — full **product Q&A** (intent, tradeoffs, deferred items). Do not contradict it without an explicit product decision recorded there.
5. **[docs/USER_AND_AGENT_GUIDE.md](docs/USER_AND_AGENT_GUIDE.md)** — **entity-service** HTTP contract (`/extract`, optional `/schema-pipeline/*`). Mirrored from upstream; treat the **wire shapes** as stable.

---

## Non-negotiables

- **All v2 implementation lives in this repo (`GrooveGraph`).** [GrooveGraph-next](https://github.com/Studio13-NYC/GrooveGraph-next) is **read-only reference** at tag `v1-reference-for-v2`. Do not land v2 features or fixes there unless the product owner explicitly says so.
- **Never commit secrets.** `.env` is gitignored; only [`.env.example`](.env.example) documents variable **names**. Production uses **Azure** (or host) environment injection, not checked-in env files.
- **entity-service does not own the database.** It is a **stateless** HTTP pipeline. TypeDB access and schema evolution live in **callers** (**`cli/`** + **`gg`**, later app/worker). Python inside entity-service must not open TypeDB for writes that belong in GrooveGraph’s persistence story.
- **MO-first for the catalog model.** Lead with Music Ontology understanding and the [ontology/mo-coverage-matrix.md](ontology/mo-coverage-matrix.md), then TypeQL under [`typedb/`](typedb/README.md). v1 greenfield TypeQL in GrooveGraph-next is **inspiration only**, not a copy source.
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
- **Tests:** **`pytest`** under **`cli/tests/`** — markers include **`core`** (repo `.env` connectivity), **`brave_only`** (standalone Brave), **`entity_service`** (HTTP schema-pipeline; fails until the API process has `TYPEDB_*`). **No GitHub Actions CI** until the product owner turns it on (see Q&A log).
- **Test data in TypeDB:** Any **persisted** rows created by **automated tests** (or ad-hoc local harnesses) must be tagged on the same **`approval-status`** field used for draft ingest lifecycle (the field that carries values like **`pending`** for operator review). Use the literal value **`test`** for those rows so they are easy to filter out and never mistaken for real pending catalog drafts.
- **Documentation:** update **this file**, **implementer defaults**, or **Q&A log** when you change a **product or process** decision; update **typedb/README** or **README** when you change how we apply schema or configure env.

---

## Workflow

1. **Orient:** follow the read order above; check **implementation-slice status** in [docs/v2-implementer-defaults.md](docs/v2-implementer-defaults.md).
2. **Design in small steps:** MO matrix and TypeQL evolve **in parallel** when schema work is involved; do not block TypeQL on a “finished” matrix, but do not skip MO traceability (`mo-class-iri` / `mo-property-iri` literals) when the schema introduces catalog types.
3. **Integrate services locally:** entity-service on **`NER_SERVICE_URL`**; TypeDB env per USER guide §7; Brave key only where search or `doctor --probe` is in scope.
4. **Implement:** one vertical slice per change set (e.g. one `gg` subcommand, one schema concern, one doc correction).
5. **Verify:** run the relevant tests or smoke commands you added or touched; use **`gg doctor`** (when shipped) for environment sanity.
6. **Escalate if blocked:** if a decision is unclear after docs (see **When you are unsure**), **ask the human** before merging or pushing risky assumptions.
7. **Hand off:** commit messages are **clear, complete sentences**; describe what changed and why. Link issues or ADR-style notes in the body when it helps the next reader.

---

## Architecture habits

- **Middle path for ingest:** keep **shared library boundaries** inside the repo so a future **worker** can own long-running fetch/write without rewriting core logic (see Q&A on “middle path”).
- **Schema pipeline:** prefer **`/schema-pipeline/raw` → `/validate` → `/formatted`** before expensive extraction when TypeDB is in play — see USER guide.
- **Return raw in every environment** is a **service capability**; respect whatever auth the deployed entity-service enforces.

---

## v1 reference (when you need prior art)

Use **`git fetch groovegraph-next-v1`** and **`git show` / `git grep`** on tag `v1-reference-for-v2` (see [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md)). **Re-implement** in GrooveGraph; do not bulk-copy legacy trees.

---

## When you are unsure

1. Re-check in order: **product Q&A** → [docs/v2-product-qa-log.md](docs/v2-product-qa-log.md); **defaults** → [docs/v2-implementer-defaults.md](docs/v2-implementer-defaults.md); **HTTP API** → [docs/USER_AND_AGENT_GUIDE.md](docs/USER_AND_AGENT_GUIDE.md).
2. If you are still **unsure** or **confused**, or the decision touches **product intent, TypeQL semantics, data safety, or secrets**, follow the **non-negotiable** above: **stop and ask the human** (summarize evidence and the exact question).

For **low-risk, purely local** choices that are fully consistent with those docs (for example a private helper name), you may proceed and note the choice in the commit message.
