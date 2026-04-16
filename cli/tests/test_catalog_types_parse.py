from __future__ import annotations

import pytest

from groovegraph.catalog_types import (
    RESERVED_GENERIC_ENTITY_LABEL,
    extract_request_labels,
    parse_kind_list,
)


def test_parse_kind_list_default_all_includes_mo_music_artist() -> None:
    kinds = parse_kind_list(None, default_all=True)
    labels = {k.kind for k in kinds}
    assert "mo-music-artist" in labels
    assert "mo-record" in labels
    assert "gg-generic" in labels


def test_parse_kind_list_explicit_tokens() -> None:
    kinds = parse_kind_list("mo-music-artist, mo-label", default_all=False)
    assert [k.kind for k in kinds] == ["mo-music-artist", "mo-label"]


def test_parse_kind_list_unknown_raises() -> None:
    with pytest.raises(ValueError):
        parse_kind_list("mo-music-artist, not-a-kind", default_all=False)


def test_extract_request_labels_without_generic() -> None:
    kinds = parse_kind_list("mo-music-artist", default_all=False)
    assert extract_request_labels(kinds, include_reserved_generic=False) == ["mo-music-artist"]


def test_extract_request_labels_appends_reserved_once() -> None:
    kinds = parse_kind_list("mo-label", default_all=False)
    out = extract_request_labels(kinds, include_reserved_generic=True)
    assert out[0] == "mo-label"
    assert out[-1] == RESERVED_GENERIC_ENTITY_LABEL
    assert out.count(RESERVED_GENERIC_ENTITY_LABEL) == 1
