# Reference Data

Collected datasets used for ingestion testing, adapter development, and graph population. The **production graph store** is **Neo4j Aura**. Data is loaded into Aura via `npm run load:neo4j`, which reads from the sources below (or from `data/graph-store.json` if present).

## Datasets

### Last.fm (cleaned)

- **`cleaned_lastfm_sample.json`** — Sample of cleaned Last.fm listening data.
- **`cleaned_lastfm_full.json`** — Full cleaned export.

Structure:

- `user`: username, display_name, total_plays, and optional profile fields (bio, join_date, location, etc.).
- `artists`: list of artists with `artist_name` and placeholder fields aligned to music entities (biography, genres, active_years, country, image_url, influences, popularity, followers, spotify_uri, spotify_url). Many are null and intended for enrichment.
- Additional sections may include tracks, albums, and play counts.

Use for: building Artist/Track/Album nodes and PLAYED_BY / LISTENED_TO-style edges; identifying entities that need Researcher-led enrichment (e.g. biography, genres).

### Play history (bobdobbsnyc)

- **`bobdobbsnyc.csv`** — Play history: artist, album, track, and play timestamp.

Columns (conceptually): Artist, Album, Track, Played At (date/time).

Use for: user listening timeline, linking Track → Album → Artist and optional temporal edges for discovery. This is the primary source for `npm run load:neo4j` when `data/graph-store.json` does not exist.

### Spotify track lists

- **`all_spotify_tracks.txt`** — List of track lines (title, artist, optional ID).
- **`all_spotify_tracks_deduped.txt`** — Deduplicated list; each line format: `Title - Artist (ID: <spotify_id>)`.

Use for: Track/Artist node creation and stable external IDs; linking to Spotify-backed enrichment or playback.

## Provenance

When ingesting into the graph, source adapter should record provenance in node/edge `meta` (e.g. `source: "lastfm"`, `source_file`, `imported_at`) so Researchers can later layer web-sourced enrichment with their own provenance. Enrichment from MusicBrainz and Wikipedia writes directly to Neo4j Aura via the enrichment pipeline.
