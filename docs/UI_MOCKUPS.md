# UI Mockups: Entity Search

Mockups for the **search any entity type** flow: type selector, fuzzy search, and "pick the result you mean."

## 1. Search screen (initial)

- **Entity type** dropdown first (e.g. "Artist", "Instrument", "All types").
- **Search** input: "e.g. Kacey Musgraves or Gibson".
- **Search** button.
- Subtitle: "Find any entity by type and name. Choose the result you mean."

Use this so the user can restrict by type (e.g. Instrument for "Gibson" the company) or search all types.

**Image:** `mockup-search-screen.png` (generated; stored in Cursor project assets.)

---

## 2. Results list – pick one (choose correct spelling)

- Same header and search row; query e.g. "Gibson" with "All types".
- Section: **"Matches – pick the one you mean"**.
- List of rows, each:
  - Primary text: display name (e.g. "Debbie Gibson", "Gibson", "Gibson Les Paul").
  - Pill/badge: entity type (Artist, Instrument, Equipment).
  - Optional "View" action per row.
- User must pick one row so they can choose the intended entity and correct spelling.

**Image:** `mockup-results-pick-one.png` (generated; stored in Cursor project assets.)

---

## 3. After selection – Artist vs non-Artist

- **Artist:** Full card as today: name, track count, track list with albums, "Enrich artist", "View in graph".
- **Non-Artist (e.g. Studio):** Minimal card: name, type, key property (e.g. location), "View in graph" only.

**Image:** `mockup-after-selection.png` (generated; stored in Cursor project assets.)

---

## Where to find the images

The mockup images were generated in this session and are stored under the Cursor project assets path, e.g.:

- `mockup-search-screen.png`
- `mockup-results-pick-one.png`
- `mockup-after-selection.png`

You can view them in Cursor’s asset/output panel. To keep them in the repo, copy them into e.g. `docs/images/` and reference them from this file.
