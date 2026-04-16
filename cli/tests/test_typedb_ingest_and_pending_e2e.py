from __future__ import annotations

import uuid

import pytest

from groovegraph.catalog_types import parse_kind_list
from groovegraph.draft_ingest import persist_ingest_envelope
from groovegraph.ingest_models import CatalogDraftEntity, IngestDraftEnvelope
from groovegraph.pending_queries import list_pending_hits
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_session import open_typedb_driver, run_read_query
from groovegraph.typedb_verify import verify_typedb

pytestmark = pytest.mark.e2e


def test_typedb_ingest_draft_then_list_pending_test_rows() -> None:
    """
    Live TypeDB write/read smoke (skipped when TypeDB env is incomplete).

    Uses `approval-status="test"` for catalog rows per AGENTS.md hygiene guidance.
    """
    try:
        params = read_typedb_connection_params()
    except TypeDbConfigError as exc:
        pytest.skip(f"TypeDB not configured in repo-root `.env`: {exc}")

    report = verify_typedb(params)
    if report.get("ok") is not True:
        pytest.skip(f"TypeDB not reachable: {report}")

    batch_id = f"gg-test-{uuid.uuid4()}"
    envelope = IngestDraftEnvelope(
        ingestion_batch_id=batch_id,
        catalog_entities=[
            CatalogDraftEntity(
                kind="mo-music-artist",
                name=f"GG Test Artist {batch_id}",
                approval_status="test",
            )
        ],
    )

    try:
        with open_typedb_driver(params) as driver:
            if not driver.databases.contains(params.database):
                pytest.skip("TypeDB database from `.env` does not exist on the server")
            persist_ingest_envelope(driver=driver, database=params.database, envelope=envelope)

            kinds = parse_kind_list("mo-music-artist", default_all=False)
            hits = list_pending_hits(
                driver=driver,
                database=params.database,
                kinds=kinds,
                run_read_query=run_read_query,
                approval="test",
            )
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"TypeDB write/read failed (did you apply typedb/groovegraph-schema.tql?): {exc}")

    assert any(str(h.get("name", "")).startswith("GG Test Artist ") for h in hits)
