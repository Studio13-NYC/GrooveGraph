# Enrichment Process: Collect → Verify → Load

This document defines how enrichment data is **collected**, **verified**, and **loaded** into the graph with full provenance. See [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) §5 and [ENRICHMENT_SOURCES.md](ENRICHMENT_SOURCES.md).

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

- **Input**: Verified enrichment record (normalized properties + provenance) + target graph node id.
- **Actions**:
  1. `store.updateNode(nodeId, patch)` with property updates and `meta` containing provenance.
  2. Optionally create new nodes (e.g. Person, Studio) and edges (e.g. PRODUCED_BY, RECORDED_AT) with the same provenance metadata.
- **Idempotency**: Same source + URL + entity can be applied multiple times; last write wins or version by `enrichment_date` depending on product choice.

### 3.3 Provenance storage

Provenance is stored in node/edge `meta` or in dedicated properties:

- `enrichment_source` (e.g. musicbrainz, wikipedia)
- `enrichment_url`
- `enrichment_date` (ISO)
- `enrichment_excerpt` or `citation`
- `enrichment_confidence`

---

## End-to-end flow

1. **Collect**: Registry + adapters produce raw payloads + source metadata.
2. **Verify**: Schema validation, entity match confidence, sanitization → verified enrichment records.
3. **Load**: Map to domain properties, attach provenance, update node (and optionally create nodes/edges).
