from __future__ import annotations

from groovegraph.canonical_sources import (
    CanonicalEnrichmentResult,
    SourceChunk,
    _musicbrainz_release_recording_titles,
)


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


def test_musicbrainz_release_recording_titles_top_level_recordings() -> None:
    data = {"recordings": [{"title": "Track A"}, {"title": "Track B"}, {"title": "  "}]}
    assert _musicbrainz_release_recording_titles(data, 2) == ["Track A", "Track B"]


def test_musicbrainz_release_recording_titles_media_tracks() -> None:
    data = {
        "media": [
            {
                "tracks": [
                    {"recording": {"title": "One"}},
                    {"recording": {"title": "Two"}},
                ]
            }
        ]
    }
    assert _musicbrainz_release_recording_titles(data, 5) == ["One", "Two"]


def test_ok_any_false_when_all_empty() -> None:
    r = CanonicalEnrichmentResult(
        needle="x",
        wikipedia=SourceChunk("wikipedia", True, "", None),
        musicbrainz=SourceChunk("musicbrainz", True, "", None),
        discogs=SourceChunk("discogs", True, "", None),
    )
    assert r.ok_any is False
    assert r.combined_text() == ""
