from __future__ import annotations

from typing import Any

from groovegraph.catalog_types import CatalogEntityKind
from groovegraph.logging_setup import get_logger
from groovegraph.tql_escape import escape_tql_string

log = get_logger("pending_queries")


def build_pending_query(*, entity_type: str, approval: str = "pending", limit: int | None = 200) -> str:
    """List pending catalog rows for one entity type (optional bounded limit)."""
    appr = escape_tql_string(approval)
    lines = [
        "match",
        f"  $e isa {entity_type}, has name $n, has approval-status $s;",
        f'  {{ $s == "{appr}"; }};',
        "select $e, $n, $s;",
    ]
    if limit is not None:
        lim = max(1, min(int(limit), 500))
        lines.append(f"limit {lim};")
    return "\n".join(lines)


def list_pending_hits(
    *,
    driver: Any,
    database: str,
    kinds: list[CatalogEntityKind],
    run_read_query,
    approval: str = "pending",
) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for kind in kinds:
        rows: list[dict[str, Any]] = []
        for attempt_limit in (200, None):
            q = build_pending_query(entity_type=kind.typedb_entity, approval=approval, limit=attempt_limit)
            log.debug("pending query kind=%s limit=%s\n%s", kind.kind, attempt_limit, q)
            try:
                rows = run_read_query(driver, database=database, query=q)
                log.info("pending read ok kind=%s limit=%s rows=%s", kind.kind, attempt_limit, len(rows))
                break
            except Exception:
                log.exception("pending read failed kind=%s limit=%s", kind.kind, attempt_limit)
                rows = []

        for row in rows:
            e = row.get("e")
            n = row.get("n")
            s = row.get("s")
            if not isinstance(e, dict) or e.get("kind") != "entity":
                continue
            if not isinstance(n, dict) or n.get("kind") != "attribute":
                continue
            status_val = None
            if isinstance(s, dict) and s.get("kind") == "attribute":
                status_val = s.get("value")
            hits.append(
                {
                    "kind": kind.kind,
                    "entity_type": str(e.get("type")),
                    "name": str(n.get("value")),
                    "approval_status": status_val,
                }
            )
    return hits
