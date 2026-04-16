from __future__ import annotations

import pytest

from groovegraph.ingest_models import CatalogDraftEntity, IngestDraftEnvelope


def test_ingest_envelope_roundtrip_minimal() -> None:
    env = IngestDraftEnvelope.model_validate(
        {
            "ingestion_batch_id": "batch-1",
            "catalog_entities": [{"kind": "mo-music-artist", "name": "Talking Heads"}],
        }
    )
    assert env.ingestion_batch_id == "batch-1"
    assert env.catalog_entities[0].kind == "mo-music-artist"


def test_catalog_entity_rejects_empty_name() -> None:
    with pytest.raises(ValueError):
        CatalogDraftEntity(kind="mo-music-artist", name="   ")
