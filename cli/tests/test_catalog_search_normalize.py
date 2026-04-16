from __future__ import annotations

from groovegraph.catalog_search import normalize_hits


def test_normalize_hits_maps_entity_and_name_columns() -> None:
    rows = [
        {
            "e": {"kind": "entity", "type": "mo-music-artist"},
            "n": {"kind": "attribute", "type": "name", "value": "Talking Heads"},
        }
    ]
    assert normalize_hits(rows) == [{"entity_type": "mo-music-artist", "name": "Talking Heads"}]
