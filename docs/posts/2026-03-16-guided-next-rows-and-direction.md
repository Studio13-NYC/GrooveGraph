# Guided Next Rows and Direction-Aware Chains

We closed a gap that showed up as soon as multi-row composition became real: the API was already giving us ontology-aware next options, but the UI was still making users translate those suggestions manually.

So we made two linked decisions.

First, we exposed suggestions directly in the builder as a visible “Suggested next connections” panel, and added `Add Suggested Row` so users can continue a valid chain in one click.

Second, we stopped pretending all rows are outbound. Suggestions often came back inbound, so we added per-row direction (`outbound` / `inbound`) and passed that direction through compile.

This matters because the query-builder now reflects graph reality instead of forcing a single traversal shape.

The loop is tighter now:

- compile a row,
- inspect ontology-guided next options,
- add a suggested row (including its direction),
- recompile immediately with traceable output.

The result is less guesswork, fewer dead-end combinations, and a much more honest path toward guided query authoring.

Next step: use these suggestions to proactively constrain each row’s relationship/target dropdowns before compile so invalid combinations are prevented earlier.
