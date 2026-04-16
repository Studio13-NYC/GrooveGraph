# Music Ontology — coverage matrix (GrooveGraph v2)

**MO-first:** this matrix leads TypeQL design. Update it in parallel with [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql).

**Reference:** upstream ontology per [`ontology-location.mc`](ontology-location.mc).

| MO class / property (IRI or label) | TypeQL entity label (v2) | MVP | Later | Out of scope | Notes |
|-------------------------------------|--------------------------|-----|-------|----------------|-------|
| `mo:MusicArtist` (`http://purl.org/ontology/mo/MusicArtist`) | `mo-music-artist` | Yes | | | CLI kind `mo-music-artist`. |
| `mo:Record` (`http://purl.org/ontology/mo/Record`) | `mo-record` | Yes | | | Release / “album” intent without using the colloquial word *album* as the type name. |
| `mo:Track` (`http://purl.org/ontology/mo/Track`) | `mo-track` | Yes | | | |
| `mo:Instrument` (`http://purl.org/ontology/mo/Instrument`) | `mo-instrument` | Yes | | | |
| `mo:Label` (`http://purl.org/ontology/mo/Label`) | `mo-label` | Yes | | | |
| `foaf:Agent` (`http://xmlns.com/foaf/0.1/Agent`) | `foaf-agent` | Partial | Yes | | Companion to MO for people/agents; split producer/engineer later if MO dictates. |
| `mo:Studio` / venue modelling | — | | Yes | | Not in the first TypeQL slice; add when MO matrix + queries need it. |
| Provenance / batch grouping | `ingestion-batch` | Yes | | | Operational provenance (not an MO catalog class); `mo-class-iri` documents GG namespace. |
| `approval-status` (product field) | attribute | Yes | | | Values like `pending`, `test` per Q2–Q3 in [`docs/v2-product-qa-log.md`](../docs/v2-product-qa-log.md). |
| `mo-property-iri` on writes | attribute | Yes | | | Optional property-level traceability (Q12–Q13). |
| Performance / work keys | — | | Yes | | Defer `mo:Performance`, `mo:Lyrics`, etc. until search/ingest stabilises. |
