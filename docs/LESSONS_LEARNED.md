# Lessons Learned

## 1) LLM intent must not be silently rewritten
- **Lesson:** Hidden deterministic repair logic erodes trust and creates confusing behavior.
- **Going forward:** Keep post-LLM validation diagnostic-only by default; surface conflicts to users and preserve interpreted intent.

## 2) Conversation loops are state-contract failures
- **Lesson:** Repeated clarifications happened when `sessionId`, `questionId`, and LLM conversation state were not consistently enforced.
- **Going forward:** Treat multi-turn state as a strict contract across interpretation, follow-up, approval, and resume paths.

## 3) UI actions must show immediate outcomes
- **Lesson:** Proposal buttons that do work without visible confirmation are perceived as broken.
- **Going forward:** Every action must produce an immediate state signal (status label, button disable/hide, and explicit no-op message for empty lists).

## 4) Persistence must be verified, not assumed
- **Lesson:** Approval flows require proof that writes landed and did not duplicate.
- **Going forward:** After persistence features, run explicit checks for entity existence, relationship existence, and duplicate nodes/edges.

## 5) Naming and copy must track architecture changes
- **Lesson:** Legacy names and old UI copy caused mental model drift after the shift to chat + pipeline.
- **Going forward:** Rename stale files/components early, and remove redundant or implementation-heavy copy from user-facing UI.

## 6) Pipeline observability accelerates debugging
- **Lesson:** LLM systems are hard to debug without stage-level visibility.
- **Going forward:** Keep explicit pipeline cards with stage input/output plus duration and token usage for every major LLM stage.

## 7) Transition-aware data checks prevent false negatives
- **Lesson:** Mixed ontology/data states (for example `Artist` vs `Band`) can invalidate naive checks.
- **Going forward:** Use compatibility-aware verification during transitions and document transitional assumptions directly in checks.

## 8) Interaction regressions often come from render churn, not event wiring
- **Lesson:** Graph movement during chat typing was primarily caused by unnecessary Cytoscape resync/re-layout from unstable prop identities (for example passing a new empty set each render).
- **Going forward:** Keep static graph props memoized, trigger layout only when graph data changes, and treat keystroke-induced graph motion as a state-lifecycle bug first.

## 9) Fixes must preserve user capability, not trade one break for another
- **Lesson:** Hard stops that suppress movement can accidentally remove expected graph controls (drag, zoom, pan), producing another critical UX failure.
- **Going forward:** Validate typing isolation and mouse interactions together in one workflow before declaring graph behavior fixed.
