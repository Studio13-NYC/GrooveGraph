from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from groovegraph.logging_setup import get_logger
from groovegraph.typedb_session import run_read_query, run_schema_define

log = get_logger("schema_bootstrap")

CANONICAL_SCHEMA_REL = Path("typedb") / "groovegraph-schema.tql"
PROBE_QUERY = "match $e isa mo-music-artist, has name $n;\nselect $e, $n;\nlimit 1;\n"


def strip_typeql_comments(source: str) -> str:
    """Remove full-line // comments; keeps define body intact."""
    out_lines: list[str] = []
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("//"):
            continue
        out_lines.append(line)
    return "\n".join(out_lines).strip() + "\n"


def load_canonical_define_typeql(repo_root: Path) -> str:
    path = repo_root / CANONICAL_SCHEMA_REL
    if not path.is_file():
        raise FileNotFoundError(f"Missing canonical schema file: {path}")
    raw = path.read_text(encoding="utf-8")
    cleaned = strip_typeql_comments(raw)
    if "define" not in cleaned.lower():
        raise ValueError(f"Canonical schema file has no define block: {path}")
    return cleaned


def catalog_mo_schema_present(*, driver: Any, database: str) -> bool:
    """
    Return True if the GrooveGraph MO catalog root type is present (query compiles).

    Empty result is OK; missing type label means schema is not applied.
    """
    try:
        run_read_query(driver, database=database, query=PROBE_QUERY)
        return True
    except Exception as exc:  # noqa: BLE001
        log.info("catalog schema probe failed (will try define): %s", exc)
        return False


def ensure_groovegraph_catalog_schema(
    *,
    driver: Any,
    database: str,
    repo_root: Path,
) -> dict[str, Any]:
    """
    If MO catalog types are missing, apply ``typedb/groovegraph-schema.tql`` in a SCHEMA transaction.

    Safe to call when schema already exists (probe succeeds → skipped).
    """
    if catalog_mo_schema_present(driver=driver, database=database):
        log.info("catalog schema already present database=%s", database)
        return {"ok": True, "action": "skipped", "detail": "mo-music-artist query compiles"}

    typeql = load_canonical_define_typeql(repo_root)
    log.warning(
        "applying canonical GrooveGraph catalog define database=%s (SCHEMA transaction)",
        database,
    )
    try:
        run_schema_define(driver, database=database, define_typeql=typeql)
    except Exception as exc:  # noqa: BLE001
        log.exception("schema define failed")
        return {"ok": False, "action": "define_failed", "detail": str(exc)}

    if not catalog_mo_schema_present(driver=driver, database=database):
        return {
            "ok": False,
            "action": "define_applied_but_probe_failed",
            "detail": "Define committed but mo-music-artist probe still fails",
        }

    return {"ok": True, "action": "applied", "detail": "Canonical define committed"}


def slug_batch_id(needle: str) -> str:
    """ASCII-ish batch id fragment from a free-text needle."""
    s = needle.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:48] if s else "batch"
