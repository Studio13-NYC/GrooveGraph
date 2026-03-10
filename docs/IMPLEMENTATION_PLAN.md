# Implementation Plan: Domain types and OOP

Implement GrooveGraph domain layer in TypeScript with strict OOP: base entity/relationship classes, one file per type under entities/ and relationships/, and a Cursor rule that enforces this. Then add a minimal data pipeline to populate the graph from existing data/ assets.

---

## 1. Scope

- **Code**: TypeScript only. No runtime dependency on Graphiti or agent memory.
- **Rule**: Applies only to the domain layer (`src/domain/**/*.ts`).
- **Layout**: `src/domain/entities/` (one file per entity type), `src/domain/relationships/` (one file per relationship type). Shared base types in `src/domain/` (e.g. `GraphNode.ts`, `GraphEdge.ts`).

---

## 2. Cursor rule (create first)

Add `.cursor/rules/oop-domain.mdc`:

- **Frontmatter**: `description`: e.g. "OOP domain layer: entities and relationships as classes, one file per type"; `globs`: `src/domain/**/*.ts`; `alwaysApply`: false.
- **Content** (under ~50 lines, actionable):
  - Model every **entity** (Artist, Track, Album, …) and every **relationship** (PerformedBy, RecordedAt, …) as a **class** in its own file.
  - **Entities** live in `src/domain/entities/`; **relationships** in `src/domain/relationships/`.
  - Use **inheritance**: domain entity classes extend a base graph node type; relationship classes extend a base graph edge type. Use further inheritance where it clarifies the model (e.g. a base for "physical artifact" for Instrument/Equipment).
  - One **file per type**: `Artist.ts`, `Track.ts`, `PerformedBy.ts`, `RecordedAt.ts`, etc. No multi-type files in the domain layer.
  - Prefer **typed properties** on the class (no loose property bags for core fields). Use a `properties`/`meta` map only for extensibility (e.g. provenance) as in the spec.
  - Keep each file focused and under a reasonable line count; reference [DOMAIN_MODEL.md](DOMAIN_MODEL.md) for property lists and edge semantics.

---

## 3. TypeScript project setup

- Add **package.json** (name, type module, scripts: build, test; devDependencies: typescript, @types/node; no runtime deps required for domain-only step).
- Add **tsconfig.json** (target ES2022+, module NodeNext or ESNext, strict, outDir dist, rootDir src).
- Ensure **.gitignore** already ignores `dist/` and `node_modules/` (already present).

---

## 4. Base graph primitives (domain layer)

Under `src/domain/`:

- **GraphNode.ts** (or **Entity.ts**): Abstract base for all node-like domain objects. Fields: `id`, `labels: string[]`, `properties: Record<string, unknown>`, `meta?: Record<string, unknown>`. Constructor and optional helper to add labels/properties. Align with [ARCHITECTURE](ARCHITECTURE.md) §4 (Node).
- **GraphEdge.ts** (or **Relationship.ts**): Abstract base for all edge-like domain objects. Fields: `id`, `type: string`, `fromNodeId`, `toNodeId`, `properties`, `meta?`. Constructor enforces directed link. Align with ARCHITECTURE §4 (Edge).

Naming: use **GraphNode**/**GraphEdge** if you want to reserve "Entity"/"Relationship" for domain-specific subclasses; or **Entity**/**Relationship** as the base names. Be consistent.

---

## 5. Entity classes (one file per type)

Under `src/domain/entities/`. Each class **extends** the base graph node type and declares **typed fields** matching [DOMAIN_MODEL.md](DOMAIN_MODEL.md).

**Phase 1 (minimal set for "basic steps" + data population):**

- **Artist.ts** — props: name (required), biography, genres, active_years, country, image_url, influences, popularity, followers, spotify_uri, spotify_url. Label: `Artist`.
- **Album.ts** — title (required), release_date, album_type, total_tracks, catalog_number, images, release_date_precision, spotify_uri, spotify_url. Label: `Album`.
- **Track.ts** — title (required), duration_ms, explicit, popularity, preview_url, isrc, lyrics, tempo, key, genre, spotify_uri, spotify_url. Label: `Track`.
- **Instrument.ts** — name (required), type, brand, manufacturer, model, year_of_manufacture, year, family, sub_family, serial_number, specifications, condition, notable_users, image_url, notes. Label: `Instrument`.

**Optional for Phase 1:**

- **Equipment.ts** — extend a small base (e.g. `PhysicalArtifact`) or GraphNode; props per DOMAIN_MODEL §1.4. Label: `Equipment`.
- **Studio.ts** — name (required), location, founding_date, specifications, notable_recordings. Label: `Studio`.

Each entity file exports a single class. Constructor accepts required fields plus optional partial for the rest; assigns a stable `id` (or accepts one) and sets `labels` to the single canonical label.

---

## 6. Relationship classes (one file per type)

Under `src/domain/relationships/`. Each class **extends** the base graph edge type with a fixed `type` string and optionally **typed edge properties**.

**Phase 1 (enough to express play history / recording lineage):**

- **PerformedBy.ts** — type `PERFORMED_BY`; from: Track, to: Artist. Optional edge props: role, order.
- **ReleasedOn.ts** — type `RELEASED_ON`; from: Track, to: Album. Optional: track_number, disc_number.
- **RecordedAt.ts** — type `RECORDED_AT`; from: Track, to: Studio. Optional: date, session_id.
- **Contains.ts** — type `CONTAINS`; from: Album, to: Track. Optional: track_number.

Each relationship file exports one class; constructor takes `id?`, `fromNodeId`, `toNodeId`, and optional properties object.

---

## 7. Barrel exports and index

- **src/domain/entities/index.ts** — re-export all entity classes.
- **src/domain/relationships/index.ts** — re-export all relationship classes.
- **src/domain/index.ts** — re-export base types + entities + relationships so consumers can import from `domain`.

---

## 8. Data gathering and population (basic step)

- Add a **data-loading** entry that reads from existing `data/` assets and produces **instances** of the domain classes.
  - **Preferred first source**: `data/bobdobbsnyc.csv` (columns: artist, album, track, played-at). Parse CSV, normalize artist/album/track names, create **Artist**, **Album**, **Track** entities (dedupe by name or by a generated id), and **ReleasedOn** / **Contains** relationships between them.
  - Optional: read `data/cleaned_lastfm_sample.json` to create **Artist** (and optionally **Track**) entities from `artists` array; link to play history where names match.
- **Recommendation**: A small script under `scripts/` (e.g. `scripts/load-play-history.ts`) that reads CSV/JSON, builds entity and relationship instances, and outputs a JSON summary or returns them. No persistence in this step—just prove we can parse data and instantiate domain objects.

---

## 9. Order of work

1. Add the **Cursor rule** `.cursor/rules/oop-domain.mdc`.
2. Add **docs/RULES_AND_STANDARDS.md** (catalog Cursor rules + coding/layout standards) and link it from README.
3. Add **package.json** and **tsconfig.json**; run `npm install`.
4. Implement **GraphNode** and **GraphEdge** in `src/domain/`.
5. Implement Phase 1 **entities** (Artist, Album, Track, Instrument; optionally Equipment, Studio) in `src/domain/entities/`, each in its own file.
6. Implement Phase 1 **relationships** (PerformedBy, ReleasedOn, RecordedAt, Contains) in `src/domain/relationships/`, each in its own file.
7. Add **barrel exports** (entities/index, relationships/index, domain/index).
8. Add **scripts/load-play-history.ts** (or equivalent) that parses `data/bobdobbsnyc.csv`, dedupes artists/albums/tracks by name, creates entity and relationship instances, and logs or returns them.

**Update:** GraphStore is implemented. Production uses **Neo4j Aura** (`Neo4jGraphStore`); `InMemoryGraphStore` remains for scripts and tests. Run `npm run load:neo4j` to import the graph into Aura. See [STORAGE_ABSTRACTION.md](STORAGE_ABSTRACTION.md) and [neo4j.md](neo4j.md).

---

## 10. Document all rules and standards

Create **docs/RULES_AND_STANDARDS.md** that catalogs every rule and standard:

- **Cursor rules** (`.cursor/rules/`): List each rule file with its purpose and scope (mermaid-diagrams.mdc, oop-domain.mdc).
- **Coding and layout standards**: TypeScript strict mode; domain layer one-class-per-file, entities/ vs relationships/ layout; extend GraphNode/GraphEdge; typed properties; reference DOMAIN_MODEL; Mermaid image-first + collapsible source.
- **Link from README**: Add a row for `docs/RULES_AND_STANDARDS.md` in the README "Project status and docs" table.
