# 2026-03-18 - Hardening the Chat-First Surface

This was one of those sessions where progress did not come from one big feature. It came from removing friction, deleting leftovers, and tightening behavior until the app started to feel coherent.

We spent a lot of time confronting the gap between "looks close" and "works reliably."

## What we tried first (and why it still felt wrong)

Early fixes addressed obvious symptoms:

- duplicate nodes in the graph,
- send-button and interaction inconsistencies,
- graph runtime chunk loading issues,
- keyboard events leaking into graph behavior.

Some of those fixes were technically correct but still not good enough in user experience. The biggest miss was treating interaction bugs as isolated event problems instead of state-lifecycle problems. That led to patches that helped one side while hurting another.

## What we failed to remove fast enough

The main drag on progress was not one bug; it was old assumptions surviving in multiple places:

- builder-era naming and control flow still shaping chat behavior,
- deterministic post-LLM patches creeping back in where the model should own the interpretation contract,
- graph rendering paths that did too much work on unrelated UI state updates,
- UI copy and component intent not fully aligned with the chat-first architecture.

We repeatedly discovered that "leftover logic" created more instability than brand-new code.

## What changed to get us close

The turning point was ruthless simplification plus strict contracts:

- **LLM-first contract stayed primary.** We pushed canonicalization expectations into the LLM extraction contract instead of mutating outputs in ad hoc deterministic layers.
- **Graph became a secondary, faithful view.** In chat mode, graph rendering stayed tied to execute results and server-provided LLM graph payloads, not neighborhood guessing.
- **Interaction quality became a release gate.** Typing in chat must not move the graph; mouse drag/zoom/pan must stay available together.
- **Render churn got treated as a bug source.** Stable references were required for static graph props to avoid accidental Cytoscape relayout while typing.
- **Docs/rules/memory were updated in lockstep.** We documented the actual failure modes so we do not reintroduce them next session.

## Where we are now

We are not done, but we are now near a functional app loop from a user perspective:

- chat-first interaction is stable enough to iterate quickly,
- graph behavior is much closer to expected interaction semantics,
- architecture is cleaner and closer to the intended LLM-centered model.

## Next up

The next major milestone is integrating the database path more deeply into this now-stable interaction layer:

- tighten execution coverage beyond proposal-only graph payloads,
- improve match quality and ontology-aligned retrieval,
- keep LLM answer quality high while pulling more live graph-backed context when available.

The lesson from today is simple: removing the wrong complexity is often the fastest way to ship the right complexity.

