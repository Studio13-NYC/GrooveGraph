from __future__ import annotations

from typing import Any

from groovegraph.catalog_types import INGESTION_BATCH_ENTITY, INGESTION_BATCH_MO_CLASS_IRI, catalog_kind_or_raise
from groovegraph.ingest_models import CatalogDraftEntity, IngestDraftEnvelope
from groovegraph.logging_setup import get_logger
from groovegraph.tql_escape import escape_tql_string
from groovegraph.typedb_session import run_read_query, run_write_queries

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


def _build_exists_by_name_query(*, typedb_entity: str, name: str) -> str:
    """Bounded existence check: any catalog row of this entity type with this exact ``name`` value."""
    n = escape_tql_string(name)
    return "\n".join(
        [
            "match",
            f"  $e isa {typedb_entity}, has name $n;",
            f'  {{ $n == "{n}"; }};',
            "select $e;",
            "limit 1;",
        ]
    )


def _catalog_entity_with_name_exists(
    driver: Any,
    *,
    database: str,
    typedb_entity: str,
    name: str,
) -> bool:
    q = _build_exists_by_name_query(typedb_entity=typedb_entity, name=name)
    rows = run_read_query(driver, database=database, query=q)
    return len(rows) > 0


def _partition_new_vs_existing_catalog_rows(
    driver: Any,
    *,
    database: str,
    catalog_entities: list[CatalogDraftEntity],
) -> tuple[list[CatalogDraftEntity], list[dict[str, Any]]]:
    """
    Drop rows that already exist in TypeDB (same entity type + exact ``name``).

    Extract responses may still list duplicate spans; ingest only persists the first
    unseen ``(kind, name)`` until richer merge (relationships / extra attributes) exists.
    """
    new_rows: list[CatalogDraftEntity] = []
    skipped: list[dict[str, Any]] = []
    for row in catalog_entities:
        meta = catalog_kind_or_raise(row.kind)
        if _catalog_entity_with_name_exists(driver, database=database, typedb_entity=meta.typedb_entity, name=row.name):
            skipped.append(
                {
                    "reason": "already_in_database",
                    "kind": row.kind,
                    "name": row.name,
                    "typedb_entity": meta.typedb_entity,
                }
            )
            continue
        new_rows.append(row)
    return new_rows, skipped


def persist_ingest_envelope(
    *,
    driver: Any,
    database: str,
    envelope: IngestDraftEnvelope,
) -> dict[str, Any]:
    """
    Persist an ingestion batch + catalog rows.

    Writes are executed as separate `insert` pipelines in one WRITE transaction.

    Rows whose ``(entity type, name)`` already exist in TypeDB are skipped so operator
    extract JSON can still surface duplicate spans while persistence stays idempotent for
    catalog names. A future merge path may compare relationships or non-name attributes.
    """
    log.info(
        "ingest begin batch_id=%s entities=%s",
        envelope.ingestion_batch_id,
        len(envelope.catalog_entities),
    )
    to_write, skipped_db = _partition_new_vs_existing_catalog_rows(
        driver,
        database=database,
        catalog_entities=list(envelope.catalog_entities),
    )
    if skipped_db:
        log.info(
            "ingest skip duplicate_in_database batch_id=%s skipped_count=%s",
            envelope.ingestion_batch_id,
            len(skipped_db),
        )

    if not to_write:
        log.info("ingest noop batch_id=%s (all catalog rows already in database)", envelope.ingestion_batch_id)
        return {
            "ok": True,
            "ingestion_batch_id": envelope.ingestion_batch_id,
            "inserted": [],
            "skipped_duplicate_in_database": skipped_db,
            "extract_echoed": envelope.extract is not None,
            "note": "No inserts: every catalog row matched an existing entity name for its type.",
        }

    queries: list[str] = []
    queries.append(_insert_ingestion_batch(batch_id=envelope.ingestion_batch_id, approval_status="pending"))

    inserted: list[dict[str, Any]] = []
    for row in to_write:
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
    log.info("ingest committed batch_id=%s inserted=%s", envelope.ingestion_batch_id, len(inserted))
    out: dict[str, Any] = {
        "ok": True,
        "ingestion_batch_id": envelope.ingestion_batch_id,
        "inserted": inserted,
        "extract_echoed": envelope.extract is not None,
    }
    if skipped_db:
        out["skipped_duplicate_in_database"] = skipped_db
    return out
