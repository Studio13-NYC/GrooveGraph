# Groovegraph Domain Model

This document is the single source of truth for the recorded-music property graph: node labels (entity types), properties, and edge types (relationships). It harmonizes ontology and data structures from prior music knowledge-graph work into Groovegraph’s property-graph form.

---

## 1. Node Labels (Entity Types)

Nodes represent music-domain entities. Each node has one or more **labels** and a **properties** map. Labels below are the canonical set; property names use `snake_case`.

### 1.1 Artist

Individual musicians or groups.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Artist name (required) |
| `biography` | string | Biography and background |
| `genres` | string[] | Musical genres |
| `active_years` | string | Time periods when active (e.g. "1981-present") |
| `country` | string | Country of origin |
| `image_url` | string | URL to artist image |
| `influences` | string[] | Artist names who influenced this artist |
| `popularity` | number | Popularity score (e.g. 0–100) |
| `followers` | number | Follower count |
| `spotify_uri` | string | Spotify URI |
| `spotify_url` | string | Spotify URL |

### 1.2 Album

A collection of tracks (studio, live, or compilation).

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Album title (required) |
| `release_date` | string | Release date (ISO or partial) |
| `album_type` | string | studio, live, compilation |
| `total_tracks` | number | Number of tracks |
| `catalog_number` | string | Label catalog reference |
| `images` | object[] | Artwork URLs (e.g. `{ url, width?, height? }`) |
| `release_date_precision` | string | day, month, year |
| `spotify_uri` | string | Spotify URI |
| `spotify_url` | string | Spotify URL |

### 1.3 Track

An individual song or recorded piece.

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Track title (required) |
| `duration_ms` | number | Duration in milliseconds |
| `explicit` | boolean | Explicit content flag |
| `popularity` | number | Popularity score |
| `preview_url` | string | Audio preview URL |
| `isrc` | string | International Standard Recording Code |
| `lyrics` | string | Song lyrics |
| `tempo` | number | Beats per minute |
| `key` | string | Musical key |
| `genre` | string | Genre of the track |
| `spotify_uri` | string | Spotify URI |
| `spotify_url` | string | Spotify URL |

### 1.4 Equipment

Recording gear, outboard, software (non-instrument gear). For musical instruments, use the **Instrument** node (§1.5).

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Equipment name (required) |
| `type` | string | recording gear, software, etc. |
| `manufacturer` | string | Manufacturer |
| `model` | string | Model designation |
| `year` | number | Year of manufacture |
| `specifications` | object | Technical specs (key/value) |
| `notable_users` | string[] | Artists known for using it |

### 1.5 Instrument

Musical instruments: all aspects of type, brand, model, and manufacture. Use for guitars, synths, drums, pianos, orchestral instruments, etc.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Instrument name or designation (required) |
| `type` | string | Instrument type (e.g. guitar, synthesizer, piano, drum kit, violin, bass) |
| `brand` | string | Brand name |
| `manufacturer` | string | Manufacturer (same as brand when no distinction) |
| `model` | string | Model designation |
| `year_of_manufacture` | number | Year of manufacture |
| `year` | number | Shorthand for year_of_manufacture |
| `family` | string | High-level family (e.g. Strings, Woodwinds, Percussion, Keyboards) |
| `sub_family` | string | Sub-family (e.g. Bowed Strings, Plucked Strings, Analog Synths) |
| `serial_number` | string | Serial number if known |
| `specifications` | object | Technical specifications (key/value) |
| `condition` | string | e.g. mint, used, vintage |
| `notable_users` | string[] | Artists known for using this instrument |
| `image_url` | string | URL to image |
| `notes` | string | Free-form notes |

### 1.6 Studio

Recording facilities.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Studio name (required) |
| `location` | string | Physical location |
| `founding_date` | string | When established |
| `specifications` | object | Technical specs |
| `notable_recordings` | string[] | Famous recordings made there |

### 1.7 Person

Producers, engineers, songwriters, and other non-performing contributors.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Person's name (required) |
| `roles` | string[] | producer, engineer, songwriter, etc. |
| `biography` | string | Biographical information |
| `specialties` | string[] | Areas of expertise |
| `notable_works` | string[] | Well-known contributions |

### 1.8 Credit

Role attribution (often used as an edge payload or a small node for complex credit graphs).

| Property | Type | Description |
|----------|------|-------------|
| `role_name` | string | songwriter, composer, lyricist, producer, etc. |
| `contribution_details` | string | Specific contribution |
| `primary_credit` | boolean | Primary vs secondary |
| `contribution_percentage` | number | e.g. for royalty splits |

### 1.9 Label

Music publishing / record companies.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Label name (required) |
| `founding_date` | string | When established |
| `parent_company` | string | Parent corporation |
| `roster` | string[] | Artist names signed |
| `genre_focus` | string[] | Genre specialization |

### 1.10 Performance

Live shows / events.

| Property | Type | Description |
|----------|------|-------------|
| `venue` | string | Performance location (required) |
| `date` | string | Performance date |
| `setlist` | string[] | Songs performed |
| `lineup` | string[] | Artists who performed |
| `recordings` | string[] | Available recordings of the performance |

### 1.11 Effect

Audio effects and processing.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Effect name (required) |
| `type` | string | reverb, delay, distortion, etc. |
| `parameters` | object | Effect parameters/settings |
| `position` | string | Position in signal chain |
| `context` | string | recording, live, etc. |

### 1.12 Genre

Musical styles and categories.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Genre name (required) |

### 1.13 Playlist

User- or curator-created collections of tracks.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Playlist name (required) |
| `description` | string | Optional description |

### 1.14 Venue

Concert venues (physical places for performances).

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Venue name (required) |
| `location` | string | Physical location |
| `capacity` | number | Maximum audience capacity |
| `opening_date` | string | When the venue opened |
| `website` | string | Venue website |

### 1.15 SongWork (optional abstraction)

Abstract composition distinct from a specific recording. Use when modeling publishing / composition separately from recordings.

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Composition title |
| `composers` | string[] | Composer names |
| `lyricists` | string[] | Lyricist names |
| `publishing` | string | Publishing information |

Track nodes represent specific recordings (duration, performers, producer, studio, date); SongWork represents the underlying work.

### 1.16 Session

A recording session (time-bounded activity at a place).

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Session identifier or name |
| `date` | string | Session date or range |
| `studio_id` / `studio_name` | string | Link to Studio (or denormalized name) |

### 1.17 Release

A release product (e.g. vinyl, CD, digital) — can be used alongside or instead of Album when distinguishing release formats.

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Release title |
| `release_date` | string | Release date |
| `format` | string | vinyl, cd, digital, etc. |
| `catalog_number` | string | Catalog reference |

---

## 2. Edge Types (Relationships)

Edges are directed and typed. They connect two nodes and can carry their own **properties** (e.g. role, order, date). Common semantics:

| Edge type | Typical from → to | Description |
|-----------|-------------------|-------------|
| `PERFORMED_BY` | Track → Artist | Artist performed on the track |
| `WRITTEN_BY` | Track / SongWork → Person | Person wrote (e.g. lyrics, music) |
| `PRODUCED_BY` | Track / Album → Person | Producer |
| `RELEASED_ON` | Track → Album | Track appears on album |
| `RECORDED_AT` | Track → Studio | Where the track was recorded |
| `RECORDED_IN_SESSION` | Track → Session | Session that produced the track |
| `USED_EQUIPMENT` | Artist / Track → Equipment / Instrument | Equipment or instrument used |
| `PLAYED_INSTRUMENT` | Person / Artist → Instrument (or Track) | Instrument played on a track or in general |
| `RELEASED_BY` | Album / Release → Label | Label that released |
| `ISSUED_BY_LABEL` | Album / Release → Label | Same as RELEASED_BY (alias) |
| `FEATURES` | Track → Artist | Guest / featured artist |
| `MASTERED_BY` | Track / Album → Person | Mastering engineer |
| `ENGINEERED_BY` | Track / Album → Person | Sound engineer |
| `PLAYED_ON` | Person / Artist → Instrument / Equipment | Instrument or equipment played on track (use edge properties for role/track) |
| `MEMBER_OF` | Person → Artist | Person is member of group/band |
| `CONTAINS` | Album / Playlist → Track | Album or playlist contains track |
| `COLLABORATED_WITH` | Artist → Artist | Collaboration relationship |
| `INFLUENCED_BY` | Artist → Artist | Influence |
| `COVERS` | Track → Track | Cover version → original |
| `REMIXES` | Track → Track | Remix → original |
| `CREDITS_PERSON` | Track / Album → Person | Generic credit; use edge properties for role |
| `HAS_VERSION` | Track → Track / SongWork | Recording is a version of another work |
| `PART_OF_GENRE` | Artist / Track → Genre | Genre association |
| `PERFORMED_AT` | Performance → Venue | Performance took place at venue |
| `PARTICIPATED_IN` | Artist / Person → Performance | Participation in a performance |

---

## 3. Advanced Structures (Concepts)

### 3.1 SongWork vs Track

- **Track**: A specific recording (duration, performers, studio, date).
- **SongWork**: The abstract composition (title, composers, lyricists, publishing). Use `HAS_VERSION` or similar to link a Track to a SongWork when modeling both.

### 3.2 Instrument and Equipment Hierarchy

**Instrument** nodes (§1.5) carry the full hierarchy and make/model details: `family`, `sub_family`, `type`, `brand`, `manufacturer`, `model`, `year_of_manufacture`, `serial_number`, `specifications`, `condition`, and `notable_users`. Use them for any musical instrument (guitars, synths, drums, pianos, orchestral instruments).

Optional hierarchy semantics:

- **Family**: Strings, Woodwinds, Percussion, Keyboards (store in `family`).
- **Sub-family**: Bowed Strings, Plucked Strings, Analog Synths (store in `sub_family`).
- **Type**: guitar, violin, synthesizer, drum kit (store in `type`).
- A specific physical instance can be one Instrument node (e.g. with `serial_number`); use `PLAYED_ON` / `PLAYED_INSTRUMENT` edges to link artists or tracks to that instrument.

**Equipment** (§1.4) remains for non-instrument gear (recording gear, software). Use `USED_EQUIPMENT` for both Instrument and Equipment when the distinction is not needed at the edge level.

### 3.3 Effects and Processing

Effects are nodes that can connect to both Equipment and performers (e.g. “reverb on vocal”). Use `Effect` node and edge types such as `USES_EFFECT` (Track/Equipment → Effect) with properties for parameters and signal-chain position.

### 3.4 Provenance and Enrichment

For **Connection Curator** enrichment, store provenance in node/edge `meta` or in properties such as:

- `enrichment_source` (e.g. web, article, official site)
- `enrichment_url`
- `enrichment_date` (ISO)
- `enrichment_excerpt` or `citation`
- `enrichment_confidence`

---

## 4. Base Graph Conventions

- **Node**: `id`, `labels[]`, `properties{}`, `meta?`.
- **Edge**: `id`, `type`, `fromNodeId`, `toNodeId`, `properties{}`, `meta?`.
- **Labels**: PascalCase in this doc (e.g. `Artist`, `Track`). Storage can normalize to lowercase if needed.
- **Edge types**: UPPER_SNAKE_CASE.
- All properties are optional unless marked “required” in the table; required fields are enforced at the application or schema layer.

This domain model is sufficient to drop dependency on the old projects’ entity docs; Groovegraph implementations should use this document as the single reference for labels, properties, and relationship types.
