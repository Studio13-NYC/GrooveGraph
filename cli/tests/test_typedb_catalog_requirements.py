from __future__ import annotations

import pytest

from groovegraph.typedb_catalog_requirements import (
    DEFAULT_REQUIRED_ENTITY_TYPES,
    missing_required_entity_types,
    parse_required_entity_types_from_env,
)


def test_parse_required_default_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES", raising=False)
    assert parse_required_entity_types_from_env() == DEFAULT_REQUIRED_ENTITY_TYPES


def test_parse_required_explicit_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES", "")
    assert parse_required_entity_types_from_env() == ()


def test_parse_required_custom_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES", " mo-music-artist , gg-generic ")
    assert parse_required_entity_types_from_env() == ("mo-music-artist", "gg-generic")


def test_missing_required_entities() -> None:
    assert missing_required_entity_types(
        declared_types=["mo-music-artist"],
        required=("gg-generic",),
    ) == ["gg-generic"]
    assert missing_required_entity_types(declared_types=["gg-generic"], required=("gg-generic",)) == []
