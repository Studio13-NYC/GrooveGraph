# Multi-row Composition, Still This Afternoon

The first query-builder slice worked, but it still had training wheels: one row, one hop, one decision at a time.

So we moved straight into the next pressure test: can this hold up when users chain intent instead of asking one-hop questions?

The fork here was subtle. We could have paused and designed a perfect generalized graph-editor model first, or we could extend the existing live path in small, testable steps. We chose the second option again.

That meant:

- adding rows in the UI instead of replacing the first row model,
- compiling all rows into `queryState.steps`,
- validating against the same live compile endpoint,
- keeping traceable failures visible when a relationship chain is invalid.

The useful surprise was that failure became informative instead of frustrating.  
When we intentionally composed an invalid chain, the API returned a clear failure. After switching to an ontology-valid chain, compile succeeded immediately. That is exactly the behavior we want at this stage: strict enough to prevent nonsense, fast enough to iterate.

This was another decision moment about product feel. We did not hide compile errors to keep the UI “clean.” We surfaced them, because this tool is supposed to teach users what is valid while they build.

At the end of this slice, we now have real multi-row composition, not a mock demo:

start -> row 1 -> row 2 -> compile -> inspect Cypher/params/trace -> adjust.

Next step is to reduce invalid combinations earlier by constraining row options from ontology context before compile, so users are guided before they hit an error.
