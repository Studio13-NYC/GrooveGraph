"""Probe entity-service ``POST /schema-pipeline/formatted`` (DB-backed slice) for operator diagnostics."""

from __future__ import annotations

from typing import Any

import httpx

from groovegraph.entity_service_errors import entity_service_pipeline_error_code
from groovegraph.logging_setup import get_logger
from groovegraph.schema_pipeline import post_schema_formatted_db_backed

log = get_logger("entity_service_schema_probe")


def _gg_suggests_catalog_define_applied(typedb_type_names: list[str]) -> bool:
    return any(
        t == "gg-generic" or t.startswith("mo-") or t.startswith("foaf-") for t in typedb_type_names
    )


def probe_db_backed_formatted_schema(
    base_url: str,
    *,
    typedb_type_names: list[str] | None,
    timeout_s: float = 45.0,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """
    Call **only** ``POST /schema-pipeline/formatted`` with default assumptions (same as ``gg`` extract).

    When **GrooveGraph** TypeDB lists catalog define types but the response has **empty**
    ``entityTypes`` and ``knownEntities``, the entity-service process is likely pointed at a
    **different** TypeDB than ``gg`` (see ``docs/AGENT_ENTITY_SERVICE_ISSUES.md``).
    """
    try:
        resp = post_schema_formatted_db_backed(
            base_url,
            skip_ontology_precheck=False,
            timeout_s=timeout_s,
            transport=transport,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("schema probe request failed: %s", exc)
        return {
            "ok": False,
            "error": "request_failed",
            "detail": str(exc),
            "dual_typedb_env_suspected": False,
        }

    body: dict[str, Any]
    try:
        parsed = resp.json()
    except Exception:  # noqa: BLE001
        parsed = {}
    body = parsed if isinstance(parsed, dict) else {"_non_object": parsed}

    if resp.status_code == 503:
        code = entity_service_pipeline_error_code(body) or "typedb_not_configured_on_entity_service"
        return {
            "ok": False,
            "status_code": resp.status_code,
            "error": code,
            "body": body,
            "dual_typedb_env_suspected": False,
        }

    if resp.status_code >= 400:
        return {
            "ok": False,
            "status_code": resp.status_code,
            "error": "http_error",
            "body": body,
            "dual_typedb_env_suspected": False,
        }

    et = body.get("entityTypes")
    ne = body.get("knownEntities")
    et_empty = not isinstance(et, list) or len(et) == 0
    ne_empty = not isinstance(ne, list) or len(ne) == 0
    formatted_empty = et_empty and ne_empty

    gg_types = typedb_type_names or []
    suspect = bool(
        formatted_empty
        and _gg_suggests_catalog_define_applied(gg_types),
    )

    out: dict[str, Any] = {
        "ok": not formatted_empty,
        "status_code": resp.status_code,
        "entity_types_count": len(et) if isinstance(et, list) else None,
        "known_entities_count": len(ne) if isinstance(ne, list) else None,
        "dual_typedb_env_suspected": suspect,
    }
    if suspect:
        out["note"] = (
            "GrooveGraph TypeDB lists catalog types, but entity-service returned an empty DB-backed "
            "schema slice. Align TYPEDB_* on the entity-service process with gg's TypeDB database "
            "(see docs/AGENT_ENTITY_SERVICE_ISSUES.md)."
        )
    return out
