"""Required catalog ``entity`` labels in the live TypeDB define (readiness checks)."""

from __future__ import annotations

import os


DEFAULT_REQUIRED_ENTITY_TYPES: tuple[str, ...] = ("gg-generic",)


def parse_required_entity_types_from_env() -> tuple[str, ...]:
    """
    Parse ``GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES`` (comma-separated type names).

    - **Unset:** defaults to ``DEFAULT_REQUIRED_ENTITY_TYPES`` (includes ``gg-generic``).
    - **Explicit empty string:** no required types (advanced / transitional installs).
    - **Non-empty:** exact list after trimming and dropping blanks.
    """
    if "GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES" not in os.environ:
        return DEFAULT_REQUIRED_ENTITY_TYPES
    raw = (os.environ.get("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES") or "").strip()
    if not raw:
        return ()
    parts = [p.strip() for p in raw.split(",")]
    return tuple(p for p in parts if p)


def missing_required_entity_types(*, declared_types: list[str], required: tuple[str, ...]) -> list[str]:
    """Return required labels not present in ``declared_types`` (from ``type_schema()`` parsing)."""
    declared = set(declared_types)
    return [name for name in required if name not in declared]
