# Fuzzy Interpretation: First Live Loop

Today we crossed from “builder mechanics” into actual fuzzy behavior.

We now have a live interpretation path where a user can type intent in plain language, send it to `/api/query-builder/interpret`, and get back:

- an interpreted query state,
- compiled Cypher + params,
- ontology-aware next options,
- a trace ID.

The key decision in this slice was strategy layering. We did not bet everything on one method. The orchestrator now follows a sequence:

1. check prior successful insights for exact/relevant matches,
2. use model-guided interpretation when configured,
3. fall back to ontology-based heuristics when needed.

That gives us adaptability without blocking when the model is unavailable.

We also added memory as a first-class artifact. Every interpretation outcome is written to query-builder insights and exposed through `/api/query-builder/insights`. So each run can influence the next one instead of disappearing into logs.

On the UI side, the builder now includes a fuzzy prompt input and an `Interpret Prompt` action that hydrates row state directly from orchestration output.

This is the first real pre-run insight -> strategy -> execution loop in production code for the query path.

Next step: make orchestration more context-aware by ranking insight relevance better and constraining row controls proactively from interpreted options before compile.
