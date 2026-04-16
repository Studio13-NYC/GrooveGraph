from __future__ import annotations

import re
from typing import Final

from typedb.driver import Credentials, DriverOptions, TypeDB

from groovegraph.typedb_config import TypeDbConfigError, TypeDbConnectionParams

_TYPE_DECL_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:^|\s)(?:entity|relation|attribute)\s+([a-zA-Z0-9_-]+)\b",
    flags=re.MULTILINE,
)


def list_types_from_type_schema_define(define_text: str) -> list[str]:
    """Extract declared type names from a TypeDB `type_schema()` / define-style string."""
    found = {m.group(1) for m in _TYPE_DECL_RE.finditer(define_text)}
    return sorted(found)


def verify_typedb(params: TypeDbConnectionParams) -> dict[str, object]:
    """
    Connect to TypeDB, read the database type schema, derive a list of declared types, then close.

    Uses a short-lived driver context manager so the connection is always closed.
    """
    is_tls = params.address.lower().startswith("https://")
    try:
        with TypeDB.driver(
            params.address,
            Credentials(params.username, params.password),
            DriverOptions(is_tls_enabled=is_tls),
        ) as driver:
            if not driver.databases.contains(params.database):
                names = sorted(d.name for d in driver.databases.all())
                return {
                    "ok": False,
                    "error": "database_missing",
                    "database": params.database,
                    "databases": names,
                }

            db = driver.databases.get(params.database)
            type_schema_text = db.type_schema()
            types = list_types_from_type_schema_define(type_schema_text)

            return {
                "ok": True,
                "address": params.address,
                "database": params.database,
                "tls": is_tls,
                "types": types,
                "type_count": len(types),
            }
    except TypeDbConfigError:
        raise
    except Exception as exc:  # noqa: BLE001 — surfaced to doctor JSON
        return {"ok": False, "error": "typedb_driver_exception", "detail": str(exc)}
