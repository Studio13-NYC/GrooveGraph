from __future__ import annotations

from groovegraph.canonical_sources import CanonicalEnrichmentResult, SourceChunk


def test_combined_text_joins_nonempty_sections() -> None:
    r = CanonicalEnrichmentResult(
        needle="Topic",
        wikipedia=SourceChunk("wikipedia", True, "Intro paragraph.", None),
        musicbrainz=SourceChunk("musicbrainz", True, "Artist line", None),
        discogs=SourceChunk("discogs", True, "", None),
    )
    t = r.combined_text()
    assert t.startswith("--- Query ---\nTopic")
    assert "--- Wikipedia ---" in t
    assert "Intro paragraph." in t
    assert "--- MusicBrainz ---" in t
    assert "Artist line" in t
    assert "Discogs" not in t


def test_ok_any_false_when_all_empty() -> None:
    r = CanonicalEnrichmentResult(
        needle="x",
        wikipedia=SourceChunk("wikipedia", True, "", None),
        musicbrainz=SourceChunk("musicbrainz", True, "", None),
        discogs=SourceChunk("discogs", True, "", None),
    )
    assert r.ok_any is False
    assert r.combined_text() == ""
