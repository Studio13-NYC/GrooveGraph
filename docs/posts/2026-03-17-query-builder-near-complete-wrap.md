# Query Builder Near-Complete Wrap (2am)

It is 2am Tuesday, and this was one of those sessions where the product got sharper because the constraints got sharper.

The key turning point was stopping the "hide the failure" instinct. When ontology-invalid relationships showed up, we stopped auto-fixing them behind the scenes. We exposed them, let the user approve them, and made that approval update ontology state directly. That changed the interaction from "system silently guessed" to "human and system made an explicit decision together."

Then we hit the next real gap: proposed additions were visible but not operational. We closed that loop by surfacing the proposed nodes/relationships with per-item accept actions and persisting accepted proposals to Neo4j immediately. The UI now does not just explain what it thinks - it gives the user control to commit those graph changes on the spot.

Another lesson got reinforced the hard way: brittle text parsing is a trap. The right move was to keep extraction generalized and ontology-governed. We moved proposal extraction to an LLM-driven structured step with ontology constraints instead of adding one-off text patterns. Same flexibility, better architecture alignment.

## Lessons learned today

- Build for explicit human decisions at the boundary where ontology or graph truth is evolving.
- Never hide ontology mismatch; surface it, preserve it as proposal state, and let users accept intentionally.
- A proposal is only useful if it can be applied immediately to the live graph store.
- Architecture discipline matters under pressure: generalized LLM + ontology beats case-specific parsing patches.
- End-to-end value is in completed loops (interpret -> propose -> approve -> persist -> rerun), not isolated "working parts."

Tomorrow starts from a better place: one surface, live graph persistence, and a near-complete operator loop with traceable decisions.
