# Reset Extraction Growth Plan

## Goal

Grow GrooveGraph from evidence-first collection, not prompt-first extraction.

When a run collects a large body of evidence, the extraction step should try to surface:

- entities mentioned anywhere in the corpus
- relationships implied by those mentions
- properties that make those entities useful and mergeable later

That means a question about one recording can still grow the graph around adjacent context:

- aliases
- band memberships
- producer relationships
- recording locations
- release metadata
- equipment and manufacturer clues

The immediate product goal is not "only answer the prompt." It is "use the prompt to open a useful evidence bundle, then extract as much structured graph signal as we can from that bundle."

## What This Patch Adds

### 1. Broader ES output

The in-repo entity-service now returns a richer extraction payload:

- `entities`
- `relations`
- `properties`

The service now combines:

- known graph entities from context
- Wikipedia page entities and metadata
- MusicBrainz structured entities and metadata
- Discogs structured entities and metadata
- heuristic text extraction from the cleaned evidence corpus
- text-pattern relations such as:
  - `alias_of`
  - `member_of`
  - `produced`
  - `produced_by`
  - `recorded_at`
  - `released_by`
  - `manufactured_by`

### 2. Broader extraction labels

Extraction is no longer limited to only the persistence slice. The run pipeline now allows ES to emit broader labels such as:

- `Release`
- `Instrument`
- `Manufacturer`
- `Label`
- `Alias`

Persistence is still intentionally narrower than extraction.

### 3. Human-readable ES output in the app

The app inspector now includes an `ES Output` panel that groups the extractor output into:

- entities by label
- relationships
- properties

This is for operator inspection and debugging. It lets us judge extraction quality without having to read raw JSON.

## Important Current Boundary

This patch broadens **extraction**, not **final persistence semantics**.

Today:

- ES can return a broader graph-shaped result.
- The UI can show that broader result.
- The review and persistence path still focuses on the current reset TypeDB slice:
  - `Artist`
  - `Recording`
  - `Studio`
  - `Equipment`
  - `Person`

That is deliberate. It keeps the app honest while we improve extraction quality.

## Why This Direction

The previous bottleneck was clear:

- evidence collection had started to improve
- but ES still returned mostly thin entities
- relations and properties were effectively empty
- useful context in long evidence pages was being lost

Broadening ES first gives us a better place to evaluate graph-growth quality before we widen TypeDB persistence.

## Next Execution Steps

1. Improve entity resolution across labels so person/artist ambiguity collapses better.
2. Add sentence-to-entity anchoring so extracted relations use stronger subjects and objects.
3. Broaden persistence once the richer ES output is stable enough to trust.
4. Add explicit operator controls for "show only persistable" versus "show all extracted graph candidates."
5. Introduce Playwright-backed page extraction for hard pages after the current cleaned HTML path is exhausted.

## Files Touched In This Slice

- `services/entity-service/app.py`
- `app/src/run-pipeline.ts`
- `app/public/index.html`
- `app/public/app.js`
- `app/public/styles.css`

