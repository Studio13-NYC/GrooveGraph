from __future__ import annotations

from pathlib import Path

import pytest

from groovegraph import schema_bootstrap as sb


def test_strip_typeql_comments_removes_only_full_line_comments() -> None:
    src = "// head\n\ndefine\n\n  // inner\n  entity x;\n"
    out = sb.strip_typeql_comments(src)
    assert "head" not in out
    assert "define" in out
    assert "entity x" in out.replace("\n", " ")


def test_load_canonical_define_typeql_reads_repo() -> None:
    # schema_bootstrap.CANONICAL_SCHEMA_REL is under typedb/ — use real repo file via parents
    repo = Path(__file__).resolve().parents[2]
    tql = sb.load_canonical_define_typeql(repo)
    assert "define" in tql.lower()
    assert "mo-music-artist" in tql


def test_build_ingest_rows_from_extract_maps_and_skips() -> None:
    from groovegraph.catalog_types import RESERVED_GENERIC_ENTITY_LABEL
    from groovegraph.explore_ingest import build_ingest_rows_from_extract

    allowed = frozenset({"mo-music-artist", "mo-label"})
    rows, skipped = build_ingest_rows_from_extract(
        entities=[
            {"label": "mo-music-artist", "text": "Nick Lowe"},
            {"label": "mo-music-artist", "text": "Nick Lowe"},
            {"label": "person", "text": "Nobody"},
            {"text": "x"},
        ],
        allowed_labels=allowed,
    )
    assert len(rows) == 1
    assert rows[0].kind == "mo-music-artist"
    assert rows[0].name == "Nick Lowe"
    assert len(skipped) >= 2


def test_build_ingest_persists_gg_generic_when_in_allowlist() -> None:
    from groovegraph.catalog_types import RESERVED_GENERIC_ENTITY_LABEL
    from groovegraph.explore_ingest import build_ingest_rows_from_extract

    allowed = frozenset({RESERVED_GENERIC_ENTITY_LABEL, "mo-music-artist"})
    rows, skipped = build_ingest_rows_from_extract(
        entities=[{"label": RESERVED_GENERIC_ENTITY_LABEL, "text": "Some band"}],
        allowed_labels=allowed,
    )
    assert len(rows) == 1
    assert rows[0].kind == RESERVED_GENERIC_ENTITY_LABEL
    assert rows[0].name == "Some band"
    assert skipped == []
