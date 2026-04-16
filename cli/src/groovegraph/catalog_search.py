from __future__ import annotations

from typing import Any

from groovegraph.catalog_types import CatalogEntityKind
from groovegraph.logging_setup import get_logger

log = get_logger("catalog_search")


def build_match_name_select_query(*, entity_type: str, limit: int | None) -> str:
    """
    TypeDB 3 read pipeline: match → select, optional limit stage.

    Some server builds reject certain ``limit`` placements; callers may retry without ``limit``.
    """
    lines = [
        "match",
        f"  $e isa {entity_type}, has name $n;",
        "select $e, $n;",
    ]
    if limit is not None:
        lim = max(1, min(int(limit), 500))
        lines.append(f"limit {lim};")
    return "\n".join(lines)


def normalize_hits(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten concept-row maps into stable `{entity_type,name}` hits."""
    hits: list[dict[str, Any]] = []
    for row in rows:
        e = row.get("e")
        n = row.get("n")
        if not isinstance(e, dict) or e.get("kind") != "entity":
            continue
        if not isinstance(n, dict) or n.get("kind") != "attribute":
            continue
        hits.append(
            {
                "entity_type": str(e.get("type")),
                "name": str(n.get("value")),
            }
        )
    return hits


def search_catalog_in_typedb(
    *,
    driver: Any,
    database: str,
    needle: str,
    kinds: list[CatalogEntityKind],
    run_read_query,
) -> list[dict[str, Any]]:
    """
    DB-first search across allowlisted entity kinds.

    Strategy: pull a bounded slice of rows per kind (when ``limit`` works), then do
    case-insensitive substring filtering in Python. This avoids brittle ``contains`` TypeQL
    differences across TypeDB minor versions.

    `run_read_query` is injectable for tests.
    """
    if not needle.strip():
        return []

    hits: list[dict[str, Any]] = []
    for kind in kinds:
        rows: list[dict[str, Any]] = []
        for attempt_limit in (200, None):
            q = build_match_name_select_query(entity_type=kind.typedb_entity, limit=attempt_limit)
            log.debug("typedb read kind=%s limit=%s query=\n%s", kind.kind, attempt_limit, q)
            try:
                rows = run_read_query(driver, database=database, query=q)
                log.info("typedb read ok kind=%s limit=%s row_maps=%s", kind.kind, attempt_limit, len(rows))
                break
            except Exception:
                log.exception("typedb read failed kind=%s limit=%s", kind.kind, attempt_limit)
                rows = []

        normalized = [
            h
            for h in normalize_hits(rows)
            if needle.casefold() in str(h.get("name", "")).casefold()
        ]
        log.debug("post-filter kind=%s hits=%s", kind.kind, len(normalized))

        for h in normalized:
            hits.append({**h, "kind": kind.kind})
    return hits
