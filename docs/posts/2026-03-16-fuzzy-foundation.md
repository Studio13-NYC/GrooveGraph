# Fuzzy Foundation, This Afternoon

This started with an uncomfortable truth: we were spending more energy navigating the codebase than improving the product.

By midday we were staring at two options. Option one was safe on paper: keep the existing structure, patch around it, and promise ourselves we would clean it later. Option two was painful now: stop, reorganize, and pay the cost upfront. We chose pain now.

That is how the repo became `frontend/`, `backend/`, and `utilities/`.

This was not a cosmetic refactor. It changed how decisions get made. Before, every change felt like archaeology. After the split, it became obvious where UI work lives, where query and enrichment logic belongs, and where operational scripts should sit. The fog lifted faster than expected.

Then came the more important decision: how to build behavior when requirements are still moving.

We could have hardcoded interpretation paths immediately and called it “stable.” We did not. We chose Fuzzy Functions on purpose. Start LLM-assisted where the problem is ambiguous, capture traces of real usage, then codify only the pieces that repeatedly prove themselves. Not because this is trendy, but because hardcoded certainty too early has burned us before.

That choice forced another one: logging cannot be “later.” If the system is going to learn, then every run has to leave evidence. So we treated observability as product surface, not engineering garnish. Frontend events, API stages, model interactions, query execution context, trace IDs: all of it belongs in the story of each request.

By the end of the afternoon, the branch felt different. Less legacy gravity, more intent. The architecture was no longer pretending to be finished; it was designed to evolve in public, with receipts.

Later that same afternoon came the first real test of this approach: ship a live query-builder slice without hiding behind mocks.
