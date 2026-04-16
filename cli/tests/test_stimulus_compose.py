from __future__ import annotations

from groovegraph.canonical_sources import CanonicalEnrichmentResult, SourceChunk
from groovegraph.stimulus_compose import (
    build_extract_stimulus_text,
    enrichment_sufficient_for_extract,
)


def test_compose_canonical_then_brave_no_duplicate_needle_line() -> None:
    can = CanonicalEnrichmentResult(
        needle="Elvis",
        wikipedia=SourceChunk("wikipedia", True, "Singer-songwriter from London.", None),
        musicbrainz=SourceChunk("musicbrainz", True, "", "stub"),
        discogs=SourceChunk("discogs", True, "", "stub"),
    )
    web = {
        "ok": True,
        "body": {"web": {"results": [{"title": "Brave hit", "description": "Snippet"}]}},
    }
    t = build_extract_stimulus_text(
        "Elvis",
        web,
        include_web=True,
        brave_count=3,
        canonical=can,
    )
    assert t.startswith("--- Query ---\nElvis")
    assert "--- Wikipedia ---" in t
    assert "--- Web excerpts (Brave) ---" in t
    assert "Brave hit" in t
    # Brave block should not start with the needle again
    idx = t.index("--- Web excerpts (Brave) ---")
    brave_tail = t[idx : idx + 80]
    assert not brave_tail.strip().startswith("Elvis\n")


def test_enrichment_sufficient_true_when_either_path() -> None:
    can = CanonicalEnrichmentResult(
        needle="x",
        wikipedia=SourceChunk("wikipedia", True, "hi", None),
        musicbrainz=SourceChunk("musicbrainz", True, "", None),
        discogs=SourceChunk("discogs", True, "", None),
    )
    assert enrichment_sufficient_for_extract(canonical=can, web_ok=False) is True
    assert enrichment_sufficient_for_extract(
        canonical=CanonicalEnrichmentResult(
            needle="x",
            wikipedia=SourceChunk("wikipedia", True, "", None),
            musicbrainz=SourceChunk("musicbrainz", True, "", None),
            discogs=SourceChunk("discogs", True, "", None),
        ),
        web_ok=True,
    ) is True


def test_compose_falls_back_to_needle_when_empty() -> None:
    can = CanonicalEnrichmentResult(
        needle="lonely",
        wikipedia=SourceChunk("wikipedia", True, "", None),
        musicbrainz=SourceChunk("musicbrainz", True, "", None),
        discogs=SourceChunk("discogs", True, "", None),
    )
    t = build_extract_stimulus_text(
        "lonely",
        {"ok": False},
        include_web=True,
        brave_count=5,
        canonical=can,
    )
    assert t == "lonely"
