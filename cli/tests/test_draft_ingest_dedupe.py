from __future__ import annotations

from typing import Any

import pytest

import groovegraph.draft_ingest as di
from groovegraph.ingest_models import CatalogDraftEntity, IngestDraftEnvelope


def test_persist_ingest_skips_write_when_all_rows_exist_in_database(monkeypatch: pytest.MonkeyPatch) -> None:
    writes: list[list[str]] = []

    def _fake_write(driver: Any, database: str, queries: list[str]) -> None:
        writes.append(queries)

    monkeypatch.setattr(di, "run_read_query", lambda *_a, **_k: [{"e": {"kind": "entity", "type": "mo-music-artist"}}])
    monkeypatch.setattr(di, "run_write_queries", _fake_write)

    env = IngestDraftEnvelope(
        ingestion_batch_id="batch-dup-test",
        catalog_entities=[
            CatalogDraftEntity(kind="mo-music-artist", name="Already There", approval_status="pending"),
        ],
    )
    out = di.persist_ingest_envelope(driver=object(), database="db", envelope=env)
    assert writes == []
    assert out["ok"] is True
    assert out["inserted"] == []
    assert len(out["skipped_duplicate_in_database"]) == 1
    assert out["skipped_duplicate_in_database"][0]["reason"] == "already_in_database"


def test_persist_ingest_writes_when_no_database_match(monkeypatch: pytest.MonkeyPatch) -> None:
    writes: list[list[str]] = []

    def _fake_write(driver: Any, database: str, queries: list[str]) -> None:
        writes.append(queries)

    monkeypatch.setattr(di, "run_read_query", lambda *_a, **_k: [])
    monkeypatch.setattr(di, "run_write_queries", _fake_write)

    env = IngestDraftEnvelope(
        ingestion_batch_id="batch-new-test",
        catalog_entities=[
            CatalogDraftEntity(kind="mo-music-artist", name="Brand New Artist", approval_status="pending"),
        ],
    )
    out = di.persist_ingest_envelope(driver=object(), database="db", envelope=env)
    assert len(writes) == 1
    assert len(writes[0]) == 2
    assert out["ok"] is True
    assert len(out["inserted"]) == 1
    assert "skipped_duplicate_in_database" not in out


def test_build_exists_by_name_query_escapes_quotes() -> None:
    q = di._build_exists_by_name_query(typedb_entity="mo-music-artist", name='He said "hi"')
    assert '\\"hi\\"' in q or '\\\"hi\\\"' in q
    assert "mo-music-artist" in q
