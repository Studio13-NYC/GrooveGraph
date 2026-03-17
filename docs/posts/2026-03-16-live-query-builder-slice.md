# Live Query Builder Slice

Earlier this afternoon we reset the foundation. A little later, the harder question showed up: would we keep that discipline once implementation got messy?

The first temptation was obvious. Build a polished query-builder demo against local fake responses, make it look complete, and wire the real backend later. It would have looked better, faster. We said no.

Instead, we built a rough UI and forced it to talk to a live compile endpoint from the start.

That single decision changed the entire pace of the slice. Every frontend action immediately pressure-tested backend contracts. Every backend change had a visible user consequence. There was nowhere to hide vague assumptions.

Then another choice surfaced: should we optimize for appearance or observability? We chose observability again. The compile response was shaped to be useful for humans and for debugging at the same time: readable summary, generated Cypher, params, and trace ID. That combination turned “something seems off” into “this exact stage did this exact thing.”

There was also scope pressure. We could have jumped into a fully generalized multi-row builder, but we deliberately cut scope to one meaningful row and one reliable compile path. This was not avoiding ambition. It was sequencing ambition.

A narrow live slice taught us more in one afternoon than a broad speculative layer would have taught us in a week.

By the end of the run, the workflow was real:

compose query -> call compile API -> inspect summary/Cypher/params/trace -> iterate.

No mocks required for that loop.

The interesting part is not that this shipped. The interesting part is why it shipped cleanly: explicit contracts, live pressure, and traces everywhere. That is the Fuzzy Functions loop doing exactly what it is supposed to do - explore with flexibility, then harden with evidence.

Next up is where this gets truly interesting: multi-row composition plus the first orchestration loop that checks prior run insights before deciding how to execute.
