from __future__ import annotations

from pathlib import Path

from groovegraph.typedb_verify import list_types_from_type_schema_define

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_groovegraph_schema_define_lists_core_catalog_types() -> None:
    text = (REPO_ROOT / "typedb" / "groovegraph-schema.tql").read_text(encoding="utf-8")
    names = list_types_from_type_schema_define(text)
    for required in (
        "mo-music-artist",
        "mo-record",
        "mo-track",
        "mo-instrument",
        "mo-label",
        "foaf-agent",
        "ingestion-batch",
        "name",
        "approval-status",
        "mo-class-iri",
        "ingestion-batch-id",
    ):
        assert required in names
