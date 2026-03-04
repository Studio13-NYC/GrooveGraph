# Enrichment Data Sources

Catalog of 20+ sources (core + magazine/trade) for enriching graph entities. Each source has an **id** (used in the registry and provenance), **name**, **type**, **base URL**, **access method**, **auth/rate limit**, and **entity coverage**. For magazines, archive status and publication-date provenance are noted.

See [ENRICHMENT_PROCESS.md](ENRICHMENT_PROCESS.md) for collect → verify → load.

---

## Core sources (1–20)

| id | Name | Type | Base URL | Access | Auth / rate limit | Entity coverage |
|----|------|------|----------|--------|-------------------|-----------------|
| wikipedia | Wikipedia | Encyclopedic | https://en.wikipedia.org/ | API (MediaWiki) or scrape; structured via Wikidata | Optional; rate limit per IP | Artist, Person, Album, Track, Studio, Label, Instrument |
| wikidata | Wikidata | Structured knowledge | https://www.wikidata.org/ | SPARQL or REST API | No key for read | Artist, Person, Album, Track, Studio, Label, Genre |
| discogs | Discogs | Catalog / community | https://api.discogs.com/ | REST API | Auth required for higher limits | Artist, Album, Track, Label, Person |
| musicbrainz | MusicBrainz | Open music encyclopedia | https://musicbrainz.org/ | REST API | No key for read | Artist, Album, Track, Label, Person, Studio, ISRC/ISWC |
| spotify | Spotify | Streaming catalog | https://api.spotify.com/ | Web API | OAuth app | Artist, Album, Track, popularity, images, preview_url |
| lastfm | Last.fm | Listening / tags | https://www.last.fm/api | REST API | API key | Artist, Track, tags, similar artists |
| allmusic | AllMusic | Editorial / taxonomy | https://www.allmusic.com/ | Scrape or partner | No public API | Artist, Album, Genre, biography, styles |
| genius | Genius | Lyrics / annotations | https://genius.com/ | Unofficial/limited API or scrape | Rate limit | Track, lyrics, credits |
| imdb | IMDb | Film / soundtrack | https://www.imdb.com/ | REST API (optional key) or scrape | Optional key | Person, Track (soundtrack credits) |
| bbc_music | BBC Music | Editorial | https://www.bbc.co.uk/music | Scrape | Respect robots.txt | Artist, reviews |
| rym | Rate Your Music / Sonemic | Community catalog | https://rateyourmusic.com/ | Scrape or unofficial API | Rate limit | Artist, Album, Genre, ratings |
| secondhandsongs | SecondHandSongs | Covers / versions | https://secondhandsongs.com/ | Scrape | No public API | Track, covers, original artist |
| setlistfm | Setlist.fm | Live performances | https://api.setlist.fm/ | REST API | API key | Performance, Venue, Artist, setlists |
| songkick | Songkick | Concerts / venues | https://www.songkick.com/ | API (deprecated for new) | Alternatives exist | Performance, Venue, Artist |
| bandcamp | Bandcamp | Artist / label pages | https://bandcamp.com/ | Scrape or embed data | Rate limit | Artist, Label, Album |
| soundcloud | SoundCloud | Artist profiles | https://soundcloud.com/ | API (OAuth) or scrape | OAuth | Artist, Track |
| dahr | Discography of American Historical Recordings | Historical catalog | https://adp.library.ucsb.edu/ | API or bulk data | — | Artist, Track, Label, early recordings |
| riaa | RIAA | Certifications | https://www.riaa.com/ | Scrape or published data | — | Album, Track, certifications |
| grammy | Grammy.com | Awards | https://www.grammy.com/ | Scrape | No public API | Artist, Album, Track, awards |
| web | Official / curated artist sites | Web | (search-dependent) | Web search + fetch | — | Artist, Person, Studio, Equipment, credits |

---

## Magazine and trade sources (21–30)

For defunct or back-issue content, use official archives, [Internet Archive](https://archive.org/), or licensed digitized collections. **Provenance should record the publication date** (when known) so "data from the time the recording was made" is traceable.

| id | Name | Type | Base URL | Access | Auth / rate limit | Entity coverage | Archive status |
|----|------|------|----------|--------|-------------------|-----------------|----------------|
| soundonsound | Sound on Sound | Magazine / trade | https://www.soundonsound.com/ | Website + archive; scrape or partner | Rate limit | Studio, Person, Equipment, Track-era context | Current + archive |
| guitarplayer | Guitar Player | Magazine | https://www.guitarplayer.com/ | Website + archive | Rate limit | Artist, Instrument, Equipment | Print ceased 2020; online continues |
| musicianmag | Musician Magazine | Magazine (defunct) | (archive) | Archive only; scrape or digitized archives | — | Artist, Person, Equipment | Defunct; archive only |
| mixmag | Mix Magazine | Trade | https://www.mixonline.com/ | Website + archive | Rate limit | Studio, Person, Equipment | Current + archive |
| recordingmag | Recording Magazine | Trade | (archive) | Archive / scrape | — | Equipment, techniques | Archive |
| keyboardmag | Keyboard Magazine | Magazine (defunct) | (archive e.g. Internet Archive) | Archive | — | Instrument, Equipment, Artist, Person | Defunct; archive |
| nme | NME (New Musical Express) | Music press | https://www.nme.com/ | Website + archive | Rate limit | Artist, Album, Track, Label | Current + archive |
| rollingstone | Rolling Stone | Music press | https://www.rollingstone.com/ | Website + archive | Rate limit | Artist, Album, biography, credits | Current + archive |
| pitchfork | Pitchfork | Music press | https://pitchfork.com/ | Website; scrape or RSS | Rate limit | Artist, Album, Track, genre | Current |
| tapeop | Tape Op | Trade / magazine | https://tapeop.com/ | Website + archive | Rate limit | Person, Studio, Equipment | Current + archive |

---

## Summary

- **Total sources**: 30 (20 core + 10 magazine/trade).
- **Access methods**: REST API (preferred), scrape, bulk/file, web search. Magazines are predominantly scrape + archive.
- **Entity coverage**: Artist, Album, Track, Person, Studio, Label, Instrument, Equipment, Genre, Performance, Venue. Magazines add strong coverage for Studio, Person, Equipment, Instrument and era-specific context.
