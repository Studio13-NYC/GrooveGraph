# Enrichment Process: Collect → Verify → Review → Load

This document defines how enrichment data is **collected**, **verified**, **reviewed**, and **loaded** into the graph with full provenance. See [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) §5 and [ENRICHMENT_SOURCES.md](ENRICHMENT_SOURCES.md).

---

## 1. Collecting the data

### 1.1 Source adapter contract

- **Input**: Entity type (e.g. `Artist`, `Album`, `Track`) + graph node id (or canonical name/title).
- **Output**: One or more **raw enrichment payloads** (e.g. JSON or normalized DTOs) plus **source metadata**:
  - `source_id`, `source_name`, `source_type` (e.g. `api`, `scrape`, `bulk`)
  - `url`, `retrieved_at` (ISO)
  - optional `excerpt` or `citation`

### 1.2 Collection methods

| Method | Description | Example sources |
|--------|-------------|-----------------|
| **REST API** | Call documented API with entity identifier or search; paginate if needed. | Discogs, MusicBrainz, Spotify, Last.fm, Setlist.fm |
| **Structured query** | SPARQL (Wikidata) or similar; return bindings. | Wikidata |
| **Scrape** | HTTP fetch + parse (HTML/JSON); respect robots.txt and rate limits. | Wikipedia, AllMusic, Genius, BBC, RYM, magazines |
| **Bulk / file** | Import from dump or exported file (e.g. CSV, JSON). | DAHR, MusicBrainz dumps |
| **Web search** | Use search API or engine to find candidate URLs; then fetch and parse. | Official artist site, generic web |

### 1.3 Orchestration

The enrich API or a dedicated service:

1. Resolves the entity by id from the graph store.
2. Consults the **source registry** for sources that can enrich that entity’s label.
3. Invokes each source’s **adapter** (implemented or stubbed).
4. Aggregates raw payloads + source metadata and passes them to **Verify**.

For the staged curator workflow, GrooveGraph also supports a review-session path:

1. A subset of target graph entities is selected in the `/enrichment` UI.
2. That subset is approved and saved as a review session.
3. The project-level `enrichment-curator` subagent researches the approved targets using the documented source list first, then web search and Firecrawl where helpful.
4. The subagent returns a structured JSON bundle of candidate properties, nodes, and relationships with provenance.
5. The bundle is imported into the review session for human review before any writes happen.

---

## 2. Verifying the data

Data is verified before loading so we can attach a confidence or verification flag and avoid bad writes.

### 2.1 Verification steps

| Step | Purpose |
|------|--------|
| **Schema / shape validation** | Ensure payload has expected fields and types (e.g. name is string, release_date is string or null). Reject or flag malformed payloads. |
| **Entity match confidence** | Compare source entity name/title to the graph node’s name/title; score similarity (exact, normalized, fuzzy). Low confidence can be stored but flagged (e.g. `meta.enrichment_confidence: "low"`). |
| **Cross-source consistency** | When multiple sources are used for the same entity, compare key fields (e.g. birth year, country); agree = higher confidence; conflict = flag for review or store both with provenance. |
| **Sanitization** | Escape or truncate strings for storage; reject obviously invalid values (e.g. empty required field, invalid URL). |

### 2.2 Output of verification

- **Verified enrichment record**: Normalized property set (aligned to [DOMAIN_MODEL.md](DOMAIN_MODEL.md) property names) + provenance (`source_id`, `source_name`, `url`, `retrieved_at`, `excerpt`, `confidence`).
- **Rejected** payloads are logged or returned in an error report; they do not advance to loading.

### 2.3 Confidence levels

- `high`: Exact or strong match; schema valid; no conflict with other sources.
- `medium`: Normalized or fuzzy match; schema valid.
- `low`: Weak match or parsed from unstructured text; store with flag for review.

---

## 3. Loading the data appropriately

### 3.1 Loading rules

| Rule | Description |
|------|-------------|
| **Property mapping** | Map source fields to [DOMAIN_MODEL.md](DOMAIN_MODEL.md) properties (snake_case). E.g. MusicBrainz `life-span.begin` → `active_years`; Discogs `profile` → `biography`. |
| **Provenance on every write** | For each added or updated property (or batch), attach provenance: `enrichment_source`, `enrichment_url`, `enrichment_date` (ISO), optional `enrichment_excerpt`, `enrichment_confidence` (per FUNCTIONAL_SPEC §5.2 and DOMAIN_MODEL §3.4). |
| **Upsert, don’t blind overwrite** | Prefer patching: add new properties, update only when source is trusted or user-confirmed; keep prior provenance when not replacing. |
| **Expand the graph** | When a source returns new entities (e.g. a producer, a studio), create nodes and edges with provenance instead of only updating the target node. |

### 3.2 Write path

- **Input**: Verified enrichment record (normalized properties + provenance) + target graph node id. Records may include `relatedNodes` and `relatedEdges` for structural expansion.
- **Actions**:
  1. `store.updateNode(nodeId, patch)` with property updates and `meta` containing provenance.
  2. For each `relatedNode` in the record: create or update the node (e.g. Genre, Person, Studio).
  3. For each `relatedEdge` in the record: create or update the edge (e.g. PART_OF_GENRE, PRODUCED_BY, RECORDED_AT) with the same provenance metadata.
- **Idempotency**: Same source + URL + entity can be applied multiple times; last write wins. Existing nodes/edges are updated; new ones are created.
- **Store**: Production uses Neo4j Aura; writes persist immediately.

### 3.3 Provenance storage

Provenance is stored in node/edge `meta` or in dedicated properties:

- `enrichment_source` (e.g. musicbrainz, wikipedia)
- `enrichment_url`
- `enrichment_date` (ISO)
- `enrichment_excerpt` or `citation`
- `enrichment_confidence`

### 3.4 Review before load

For curator-led enrichment, GrooveGraph stages data before loading:

- **Session creation**: The UI creates a review session from an approved subset of target entities.
- **Candidate import**: The subagent's JSON bundle is imported as candidate property changes, node candidates, and edge candidates.
- **Workflow metadata**: Imported bundles persist `workflowType` metadata (`triplet`, `span_mention`, `llm_only`, `hybrid`) for routing and UI clarity.
- **Import provenance metadata**: Sessions also persist `importedFrom` (for example `triplet-exploration`, `llm-only`, `auto-preview`) to make ingestion path explicit in review UI.
- **Provenance review**: Each staged candidate keeps source URL, retrieval time, optional excerpt, and confidence.
- **Human rejection**: The reviewer can reject bad items in the web UI before apply.
- **Deduped apply**: Only non-rejected candidates are applied, with node and relationship matching against existing graph data before creating anything new.

### 3.5 Triplet exploration (specialized staged path)

GrooveGraph also supports triplet-driven enrichment in the `/enrichment` workspace:

- Request shape: `subjectType:subjectName RELATIONSHIP objectType:objectName`
  - Example: `artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar`
- `any` placeholders are supported for subject and/or object.
- When `any` is used, a scope is required (for example `artist:Paul Weller`).
- The triplet route creates/uses a review session, runs an LLM triplet pipeline, validates the resulting bundle, then imports candidates for review.
- Candidates still go through the same review/apply gate as other enrichment paths.

API notes:

- Generic extraction entrypoint: `POST /api/enrich/extract`
- Apply session to graph: `POST /api/enrich/apply-review-session` with body `{ sessionId: string }`. The UI uses this endpoint; the nested route `POST /api/enrich/review-session/[id]/apply` is not used by the client (Next.js 14 returns 405 for that path).
- Supported workflow types:
  - `workflowType: "triplet"` — delegates to triplet exploration (same body: `triplet`, optional `scope`).
  - `workflowType: "llm_only"` — same body as triplet; resolves targets from subject/object/scope, creates a review session, runs the LLM-only pipeline (no external sources), imports the bundle with `importedFrom: "llm-only"` and `workflowType: "llm_only"`.
  - `workflowType: "span_mention"` — body: `{ text: string, sourceId?: string, async?: boolean }`; creates a session with one stub target, runs mention extraction (rule-based and/or compromise NER when `ENRICHMENT_EXTRACTION_MODE=dual_run` or `ensemble`), normalizes by ontology, builds bundle, imports with `importedFrom: "span-mention"` and `workflowType: "span_mention"`; response includes `runMetadata` (mentionCount, relationCount, latencyMs). If `async: true`, the server returns **202 Accepted** with `{ jobId, status: "accepted", statusUrl: "/api/enrich/jobs/{jobId}" }`; poll **GET /api/enrich/jobs/{jobId}** until `status` is `completed` or `failed`. Use `ENRICHMENT_ENGINE_PRIMARY=compromise` for compromise-only; `ENRICHMENT_EXTRACTION_MODE=ensemble` runs both engines and merges IR.
- `hybrid` is not yet implemented.

Operational notes:

- **LLM required**: Set `OPENAI_API_KEY` or `ENRICHMENT_LLM_API_KEY` for triplet and llm_only extraction to run. Copy `.env.example` to `.env.local`, set one of these keys. Start the dev server from the **project root** (`npm run dev`) so Next.js loads `.env.local`; then **restart** after any env change.
- **Default model**: Both pipelines use task-level routing: LLM-only uses `getModelForTask("synthesis", complexity)`, triplet uses `getModelForTask("triplet_expand", complexity)`. Override per task with `ENRICHMENT_MODEL_PRECHECK`, `ENRICHMENT_MODEL_NORMALIZE`, `ENRICHMENT_MODEL_RELATION_EXTRACT`, `ENRICHMENT_MODEL_SYNTHESIS`, `ENRICHMENT_MODEL_TRIPLET_EXPAND`, or globally with `OPENAI_MODEL`, `ENRICHMENT_LLM_MODEL`, `TRIPLET_LLM_MODEL`. Complexity still uses `ENRICHMENT_MODEL_SMALL/MEDIUM/FRONTIER` and `ENRICHMENT_COMPLEXITY_FRONTIER_THRESHOLD`.
- **Async**: For long-running runs, send `async: true` with `span_mention`, `llm_only`, or `triplet`; receive 202 and poll GET /api/enrich/jobs/{jobId}.
- **Idempotency**: Send `idempotencyKey` in the body or `Idempotency-Key` header with async requests; retries with the same key receive the same job (no duplicate sessions).
- Triplet requests can be long-running for broad scoped exploration.
- Timeout controls are configurable via `TRIPLET_LLM_TIMEOUT_MS` or `ENRICHMENT_LLM_TIMEOUT_MS`.

---

## End-to-end flow

### Direct pipeline

1. **Collect**: Registry + adapters produce raw payloads + source metadata.
2. **Verify**: Schema validation, entity match confidence, sanitization → verified enrichment records.
3. **Load**: Map to domain properties, attach provenance, update node (and optionally create nodes/edges).

### Staged curator workflow

1. **Select subset**: Choose the entities to enrich in the `/enrichment` workspace.
2. **Approve subset**: Save the subset as a review session.
3. **Research**: Run the `enrichment-curator` subagent using the generated research packet.
4. **Import**: Paste the subagent JSON bundle into the review session.
5. **Review**: Reject bad items and explicitly approve ambiguous ones when needed.
6. **Apply**: Persist the remaining deduped properties, nodes, and relationships to Neo4j with provenance and review-session metadata.

### Triplet exploration workflow

1. **Submit triplet**: Provide triplet spec (and scope when using `any`) from `/enrichment`.
2. **Session bootstrap**: Resolve/create target stubs and create a review session.
3. **LLM exploration**: Generate triplet-constrained candidates via the triplet pipeline.
4. **Validate and import**: Enforce ontology/schema constraints and import staged candidates.
5. **Review**: Accept/reject candidate properties, nodes, and edges.
6. **Apply**: Persist approved candidates to Neo4j using the same apply path as other sessions.

### Generic extraction pipeline (IR path)

When extraction goes through the **ExtractionIR** path (triplet adapter, span_mention adapter):

1. **Adapter**: Input (triplet or text) → `ExtractionIR` (mentions, relations) with optional metadata.
2. **Ontology normalizer**: `normalizeExtractionIR(ir, ontology)` — coerce mention labels to allowed entity labels, set `canonicalKey` (slug of text), drop relations with disallowed types or invalid mention refs.
3. **Bundle build**: `irToResearchBundle(normalizedIr, sessionId, targets, ontology)` → `ResearchBundle` (targets, nodeCandidates, edgeCandidates, propertyChanges).
4. **Import**: `importResearchBundle(store, sessionId, bundle, importedFrom, tripletContext?, workflowType)`:
   - **Validate**: `validateResearchBundle(bundle, …)` enforces schema and ontology.
   - **Sanitize + match**: For each node candidate, `sanitizeNodeCandidate(store, candidate)` runs **store-backed alias/canonical match** (`matchNodeCandidate`): by external ids, then by exact display name within label; sets `matchStatus: "matched_existing"` and `matchedNodeId` when a graph node is found, else `"create_new"`.
5. **Review and apply**: Same as other sessions; apply uses `matchedNodeId` when present to update existing nodes instead of creating duplicates.
