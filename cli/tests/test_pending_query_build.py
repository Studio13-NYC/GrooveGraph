from __future__ import annotations

from groovegraph.catalog_types import parse_kind_list
from groovegraph.pending_queries import build_pending_query


def test_build_pending_query_contains_expected_tokens() -> None:
    q = build_pending_query(entity_type="mo-music-artist", approval="pending")
    assert "isa mo-music-artist" in q
    assert "approval-status" in q
    assert '== "pending"' in q


def test_parse_kind_list_for_pending_default_all() -> None:
    kinds = parse_kind_list(None, default_all=True)
    assert len(kinds) >= 6
