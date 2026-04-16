from __future__ import annotations

from typing import Any

from groovegraph.catalog_types import INGESTION_BATCH_ENTITY, INGESTION_BATCH_MO_CLASS_IRI, catalog_kind_or_raise
from groovegraph.ingest_models import IngestDraftEnvelope
from groovegraph.logging_setup import get_logger
from groovegraph.tql_escape import escape_tql_string
from groovegraph.typedb_session import run_write_queries

log = get_logger("draft_ingest")


def _insert_ingestion_batch(*, batch_id: str, approval_status: str) -> str:
    bid = escape_tql_string(batch_id)
    appr = escape_tql_string(approval_status)
    mo = escape_tql_string(INGESTION_BATCH_MO_CLASS_IRI)
    return "\n".join(
        [
            "insert",
            f'  $b isa {INGESTION_BATCH_ENTITY},',
            f'    has batch-id "{bid}",',
            f'    has approval-status "{appr}",',
            f'    has mo-class-iri "{mo}";',
        ]
    )


def _insert_catalog_entity(
    *,
    typedb_entity: str,
    name: str,
    approval_status: str,
    mo_class_iri: str,
    mo_property_iri: str | None,
    source_url: str | None,
    ingestion_batch_id: str,
) -> str:
    n = escape_tql_string(name)
    appr = escape_tql_string(approval_status)
    mo = escape_tql_string(mo_class_iri)
    bid = escape_tql_string(ingestion_batch_id)
    lines = [
        "insert",
        f"  $x isa {typedb_entity},",
        f'    has name "{n}",',
        f'    has approval-status "{appr}",',
        f'    has mo-class-iri "{mo}",',
        f'    has ingestion-batch-id "{bid}"',
    ]
    if mo_property_iri:
        mp = escape_tql_string(mo_property_iri)
        lines[-1] += ","
        lines.append(f'    has mo-property-iri "{mp}"')
    if source_url:
        su = escape_tql_string(source_url)
        if lines[-1].endswith('"'):
            lines[-1] += ","
        else:
            lines[-1] += ","
        lines.append(f'    has source-url "{su}"')
    lines[-1] += ";"
    return "\n".join(lines)


def persist_ingest_envelope(
    *,
    driver: Any,
    database: str,
    envelope: IngestDraftEnvelope,
) -> dict[str, Any]:
    """
    Persist an ingestion batch + catalog rows.

    Writes are executed as separate `insert` pipelines in one WRITE transaction.
    """
    log.info(
        "ingest begin batch_id=%s entities=%s",
        envelope.ingestion_batch_id,
        len(envelope.catalog_entities),
    )
    queries: list[str] = []
    queries.append(_insert_ingestion_batch(batch_id=envelope.ingestion_batch_id, approval_status="pending"))

    inserted: list[dict[str, Any]] = []
    for row in envelope.catalog_entities:
        meta = catalog_kind_or_raise(row.kind)
        mo_iri = row.mo_class_iri or meta.default_mo_class_iri
        q = _insert_catalog_entity(
            typedb_entity=meta.typedb_entity,
            name=row.name,
            approval_status=row.approval_status,
            mo_class_iri=mo_iri,
            mo_property_iri=row.mo_property_iri,
            source_url=row.source_url,
            ingestion_batch_id=envelope.ingestion_batch_id,
        )
        queries.append(q)
        inserted.append({"kind": row.kind, "typedb_entity": meta.typedb_entity, "name": row.name})
        log.debug("ingest queued row kind=%s typedb_entity=%s", row.kind, meta.typedb_entity)

    run_write_queries(driver, database=database, queries=queries)
    log.info("ingest committed batch_id=%s", envelope.ingestion_batch_id)
    return {
        "ok": True,
        "ingestion_batch_id": envelope.ingestion_batch_id,
        "inserted": inserted,
        "extract_echoed": envelope.extract is not None,
    }
