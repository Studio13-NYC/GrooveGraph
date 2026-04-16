from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from typedb.api.connection.transaction import TransactionType
from typedb.api.concept.concept import Concept
from typedb.driver import Credentials, DriverOptions, TypeDB

from groovegraph.logging_setup import get_logger
from groovegraph.typedb_config import TypeDbConnectionParams

log = get_logger("typedb_session")


@contextmanager
def open_typedb_driver(params: TypeDbConnectionParams):
    """Open a short-lived TypeDB driver (TLS inferred from address scheme)."""
    is_tls = params.address.lower().startswith("https://")
    log.debug("typedb driver open address=%s tls=%s database=%s", params.address, is_tls, params.database)
    driver = TypeDB.driver(
        params.address,
        Credentials(params.username, params.password),
        DriverOptions(is_tls_enabled=is_tls),
    )
    try:
        yield driver
    finally:
        driver.close()
        log.debug("typedb driver closed")


def _concept_to_json(concept: Concept) -> dict[str, Any]:
    if concept.is_entity():
        ent = concept.as_entity()
        return {"kind": "entity", "type": ent.get_type().get_label()}
    if concept.is_attribute():
        attr = concept.as_attribute()
        return {
            "kind": "attribute",
            "type": attr.get_type().get_label(),
            "value": attr.get_value(),
        }
    return {"kind": "other"}


def collect_concept_row_maps(answer: Any) -> list[dict[str, Any]]:
    """Turn a concept-row query answer into plain JSON-friendly dicts."""
    if not getattr(answer, "is_concept_rows", lambda: False)():
        log.debug("query answer is not concept rows: %r", type(answer))
        return []

    rows: list[dict[str, Any]] = []
    iterator = answer.as_concept_rows()
    for row in iterator:
        row_out: dict[str, Any] = {}
        for col in list(row.column_names()):
            concept = row.get(col)
            if concept is None:
                continue
            row_out[col] = _concept_to_json(concept)
        rows.append(row_out)
    return rows


def run_read_query(driver: Any, *, database: str, query: str) -> list[dict[str, Any]]:
    log.debug("typedb READ begin database=%s", database)
    with driver.transaction(database, TransactionType.READ) as tx:
        answer = tx.query(query).resolve()
        rows = collect_concept_row_maps(answer)
    log.debug("typedb READ end database=%s rows=%s", database, len(rows))
    return rows


def run_schema_define(driver: Any, *, database: str, define_typeql: str) -> None:
    """
    Run a single **define** (or other schema) pipeline in a SCHEMA transaction.

    Caller supplies full TypeQL from the canonical repo file (see ``schema_bootstrap``).
    """
    text = define_typeql.strip()
    if not text:
        raise ValueError("run_schema_define requires non-empty TypeQL")
    log.info("typedb SCHEMA define begin database=%s chars=%s", database, len(text))
    log.debug("typedb SCHEMA define body=\n%s", text)
    with driver.transaction(database, TransactionType.SCHEMA) as tx:
        tx.query(text).resolve()
        tx.commit()
    log.info("typedb SCHEMA define committed database=%s", database)


def run_write_queries(driver: Any, *, database: str, queries: list[str]) -> None:
    """
    Run one or more write pipelines in a single WRITE transaction, then commit.

    Each query string should be a full pipeline ending with `insert` (or other write stage)
    as required by TypeDB. Commits even when `queries` is empty is not allowed — pass at
    least one statement.
    """
    if not queries:
        raise ValueError("run_write_queries requires at least one query")
    log.info("typedb WRITE begin database=%s statements=%s", database, len(queries))
    for i, q in enumerate(queries):
        log.debug("typedb WRITE statement[%s]=\n%s", i, q)
    with driver.transaction(database, TransactionType.WRITE) as tx:
        for q in queries:
            tx.query(q).resolve()
        tx.commit()
    log.info("typedb WRITE committed database=%s", database)
