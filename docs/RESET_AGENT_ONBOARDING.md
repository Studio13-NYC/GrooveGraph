# GrooveGraph Reset Agent Onboarding

## Purpose

This document is the onboarding reference for the **app-first GrooveGraph reset**.

Use it when starting fresh on the current workstream. It is intentionally narrower than the legacy repo docs and only covers the active reset application, the in-repo entity-service, and the reset TypeDB bridge.

## What This Reset Is

The reset app is a **single-path, human-steered workflow** for growing a music graph:

1. `plan`
2. `evidence`
3. `extract`
4. `persistence proposal`
5. `commit`

Every stage is visible.
Every stage is inspectable.
Every stage waits for human approval before continuing.

The goal is not to maximize automation. The goal is to make the pipeline legible enough that we can improve it by watching it work.

## What The Reset Is Not

- It is **not** the legacy CLI workflow.
- It is **not** a many-flag orchestration system.
- It is **not** a place for heuristic phrase extraction disguised as named entity recognition.
- It is **not** a hidden autonomous pipeline.

If a behavior is confusing, duplicated, or no longer used, remove it.

## Current Runtime Surface

### App

- Backend/UI entry: `app/server.ts`
- Browser UI: `http://127.0.0.1:3312/`

### Extraction service

- In repo: `services/entity-service/app.py`
- Contract: one `POST /extract`

### Graph bridge

- In repo: `services/graph-bridge/bridge.py`
- Role: TypeDB context reads and reset-graph persistence

## Current Product Intent

The reset app should:

- collect better source evidence
- extract real named entities
- show the operator what was found
- pause between every major step
- persist only clean, connected draft graph data

The immediate extractor focus is:

- remove fragment-based heuristic entities
- use source-backed entities first
- use real spaCy NER second
- keep the first pass vanilla spaCy before adding EntityRuler or SpanCategorizer
- keep relation extraction conservative

## Active Source Strategy

Source order:

1. graph context from TypeDB
2. Wikipedia
3. MusicBrainz
4. Discogs
5. Brave for discovery
6. browser-rendered page reads for long-form web evidence

Important boundary:

- Brave results are for URL discovery only.
- The extractor should never rely on Brave snippets as entity evidence.
- Web text should come from browser-rendered page extraction and sanitization.

## Active Extractor Strategy

The extractor should have exactly one path:

1. take the evidence bundle
2. merge source-backed entities from graph context, Wikipedia, MusicBrainz, and Discogs
3. run spaCy over cleaned narrative text
4. validate entities against label rules
5. merge source-backed entities and model entities
6. emit entities, conservative relations, and source-backed properties

Do not add a second extraction mode.
Do not keep the old heuristic fragment path around “just in case”.

## Human In The Loop

The reset app must pause at every stage:

- plan approval
- evidence approval
- extract approval
- persistence proposal approval
- commit approval

This is part of the product, not a debugging convenience.

## Files That Matter Most

- `README_APP.md`
- `app/server.ts`
- `app/src/run-pipeline.ts`
- `app/src/evidence.ts`
- `app/src/query-planner.ts`
- `app/src/persistence-plan.ts`
- `app/public/index.html`
- `app/public/app.js`
- `app/public/styles.css`
- `services/entity-service/app.py`
- `services/graph-bridge/bridge.py`
- `typedb/groovegraph-reset-schema.tql`

## Immediate Development Rules

1. Keep one path only.
2. Prefer deletion over compatibility layers.
3. No heuristic phrase-fragment entities.
4. No hidden auto-advance between stages.
5. If a stage output is weak, surface that weakness instead of papering over it.
6. Keep persistence narrower than extraction until the graph schema is ready.

## Benchmark Prompts

Use these prompts when checking extraction quality:

- `Talking Heads Fear of Music recording studio`
- `Brian Eno aliases Roxy Music David Bowie relationships`
- `Talking Heads Remain in Light recording studio`
- `Who produced Fear of Music by Talking Heads`

Inspect extraction quality before judging persistence quality.

## First Questions For Any New Agent

1. Is the app still using one path only?
2. Is the extractor using real spaCy NER, not phrase heuristics?
3. Is Brave being used only for discovery?
4. Can the operator approve each stage manually?
5. Are weak results visible without being silently persisted?
