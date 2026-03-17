# 2026-03-17 - The Day We Stopped Guessing

Today felt like three projects in one.

We started with a UI that looked close enough to done, but behaved like a prototype under stress. Buttons appeared to do nothing. Clarifications looped. The system occasionally sounded confident while doing the wrong thing. That mismatch was the real bug: users were doing clear work, while the system was still carrying hidden assumptions from older deterministic patterns.

The first meaningful decision was architectural, not visual: **the LLM stays in the middle of every stage**. Not just interpretation. Not just answer generation. Every stage. We stopped treating later steps as special-case deterministic zones and instead exposed backend capabilities as tools. The model could inspect ontology, validate candidate state, and keep conversation continuity through the full run.

That changed debugging immediately. Instead of "why did this parser pick that," we had a traceable sequence: model output, diagnostics, proposals, user actions, resumed flow.

The second decision was about trust. We removed silent post-LLM rewrites and turned that layer into diagnostics. When a relationship was unavailable, we kept it visible as proposed and blocked compile transparently. Users could approve on the spot. No invisible repair. No hidden correction.

Then we hit the next wall: interaction quality. Approve/reject/propose actions were technically firing, but the UI often gave weak feedback. We tightened this hard:

- process state is explicit,
- buttons hide when an item is done,
- bulk actions report no-op states clearly,
- selected continuation chips behave like a real multi-select interaction.

At the same time, we stripped redundant text and stale naming. "Query builder" language stuck around after the product had already moved toward a chat-first pipeline workspace. We renamed the component and cleaned the copy because naming is architecture, too. If file names and labels tell the wrong story, the codebase drifts.

The final step was observability as a first-class UI feature. We replaced the old builder-centric center of gravity with pipeline cards: each stage shows input, output, duration, and token usage. This is now the right debugging surface for an LLM-driven product.

By the end of this long session, the app was less "smart-looking" and more honest. That is progress.

## Rule Text

```md
# LLM Pipeline Lessons Enforcement

Use these rules for discovery/query workflows and related UI/API work.

## 1. Preserve LLM intent

- Treat LLM-interpreted intent as primary.
- Do not silently rewrite interpreted query state after LLM output.
- If ontology constraints fail, report diagnostics and actionable proposals instead of mutating intent.

## 2. Enforce multi-turn state contract

- Maintain `sessionId`, stable question identity, and LLM conversation state across all stages.
- Do not re-ask an already answered clarification when the same `questionId` is present in session context.
- After ontology approval actions, auto-resume the original intent in the same session context.

## 3. UI action feedback is mandatory

- Every proposal action (single or bulk) must visibly update state in the UI.
- Processed items must show status and remove or disable action controls.
- Bulk actions must report explicit no-op messages when there are zero eligible items.

## 4. Persistence verification requirement

- For workflows that write approvals/proposals, verify writes reached Neo4j and did not create duplicates.
- Include checks for node existence, relationship existence, and duplicate node/edge counts for affected entities.

## 5. Keep user-facing UI language minimal

- Remove redundant instructional text.
- Prefer concise user-facing terms; avoid implementation jargon in default copy.
- Keep one clear entry point for search intent.

## 6. Pipeline observability requirement

- Show explicit pipeline stages with per-stage input and output.
- Include stage timing and token usage when LLM calls are involved.
- Keep the observability view available during empty, in-progress, and completed states.
```
