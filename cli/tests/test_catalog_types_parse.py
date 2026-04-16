from __future__ import annotations

import pytest

from groovegraph.catalog_types import parse_kind_list


def test_parse_kind_list_default_all_includes_mo_music_artist() -> None:
    kinds = parse_kind_list(None, default_all=True)
    labels = {k.kind for k in kinds}
    assert "mo-music-artist" in labels
    assert "mo-record" in labels


def test_parse_kind_list_explicit_tokens() -> None:
    kinds = parse_kind_list("mo-music-artist, mo-label", default_all=False)
    assert [k.kind for k in kinds] == ["mo-music-artist", "mo-label"]


def test_parse_kind_list_unknown_raises() -> None:
    with pytest.raises(ValueError):
        parse_kind_list("mo-music-artist, not-a-kind", default_all=False)
