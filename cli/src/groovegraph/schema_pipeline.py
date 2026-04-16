from __future__ import annotations

from typing import Any

import httpx

from groovegraph.entity_service_errors import entity_service_pipeline_error_code
from groovegraph.logging_setup import get_logger

log = get_logger("schema_pipeline")

# Default ER slice: empty list = entity-service uses TypeDB types already in the database.
DEFAULT_ER_ASSUMPTIONS: dict[str, Any] = {"entityTypes": []}


def _pick_assumptions(raw: dict[str, Any]) -> dict[str, Any]:
    for key in ("assumptions", "erAssumptions", "er_assumptions"):
        val = raw.get(key)
        if isinstance(val, dict):
            return val
    return {}


def _pick_type_schema_define(raw: dict[str, Any]) -> str | None:
    for key in ("typeSchemaDefine", "type_schema_define"):
        val = raw.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return None


def post_schema_raw(base_url: str, *, timeout_s: float = 60.0) -> httpx.Response:
    """
    ``POST /schema-pipeline/raw``.

    Entity-service expects a body with ``assumptions`` (Pydantic). An empty
    ``entityTypes`` list means “use server defaults / discover from TypeDB”
    for the raw pipeline slice.
    """
    url = f"{base_url.rstrip('/')}/schema-pipeline/raw"
    payload = {"assumptions": {"entityTypes": []}}
    log.debug("POST %s", url)
    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, json=payload)
    log.info("schema-pipeline/raw status=%s", resp.status_code)
    return resp


def post_schema_validate(base_url: str, raw: dict[str, Any], *, timeout_s: float = 60.0) -> httpx.Response:
    url = f"{base_url.rstrip('/')}/schema-pipeline/validate"
    payload = {
        "typeSchemaDefine": _pick_type_schema_define(raw),
        "assumptions": _pick_assumptions(raw),
    }
    log.debug("POST %s", url)
    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, json=payload)
    log.info("schema-pipeline/validate status=%s", resp.status_code)
    return resp


def post_schema_formatted(
    base_url: str,
    raw: dict[str, Any],
    *,
    skip_ontology_precheck: bool,
    timeout_s: float = 120.0,
) -> httpx.Response:
    """``POST /schema-pipeline/formatted`` (stdin-driven). Omits ``typeSchemaDefine`` when absent."""
    url = f"{base_url.rstrip('/')}/schema-pipeline/formatted"
    assumptions = _pick_assumptions(raw)
    if not assumptions:
        assumptions = dict(DEFAULT_ER_ASSUMPTIONS)
    payload: dict[str, Any] = {
        "assumptions": assumptions,
        "skipOntologyPrecheck": skip_ontology_precheck,
    }
    tsd = _pick_type_schema_define(raw)
    if tsd is not None:
        payload["typeSchemaDefine"] = tsd
    log.debug("POST %s skipOntologyPrecheck=%s", url, skip_ontology_precheck)
    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, json=payload)
    log.info("schema-pipeline/formatted status=%s", resp.status_code)
    return resp


def post_schema_formatted_db_backed(
    base_url: str,
    *,
    skip_ontology_precheck: bool = False,
    timeout_s: float = 120.0,
) -> httpx.Response:
    """
    ``POST /schema-pipeline/formatted`` with **assumptions only** — entity-service reads
    live TypeDB and builds ``{ entityTypes, knownEntities }``. Does **not** call ``/raw``.
    """
    url = f"{base_url.rstrip('/')}/schema-pipeline/formatted"
    payload: dict[str, Any] = {
        "assumptions": dict(DEFAULT_ER_ASSUMPTIONS),
        "skipOntologyPrecheck": skip_ontology_precheck,
    }
    log.debug("POST %s (db-backed formatted) skipOntologyPrecheck=%s", url, skip_ontology_precheck)
    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, json=payload)
    log.info("schema-pipeline/formatted (db-backed) status=%s", resp.status_code)
    return resp


def run_schema_pipeline_chain(base_url: str) -> dict[str, Any]:
    """
    Resolve ``schema`` for ``POST /extract`` using **TypeDB types already deployed**.

    Calls **only** ``POST /schema-pipeline/formatted`` with default ER assumptions (empty
    ``entityTypes`` → server default slice). The ``/schema-pipeline/raw`` route is **not**
    used here; use ``post_schema_raw`` / ``gg schema raw`` for offline define inspection.
    """
    log.info("schema slice begin base_url=%s (formatted-only, DB-backed)", base_url.rstrip("/"))
    formatted_resp = post_schema_formatted_db_backed(base_url, skip_ontology_precheck=False)
    formatted_body = formatted_resp.json() if formatted_resp.content else {}
    if not isinstance(formatted_body, dict):
        formatted_body = {"_non_object_json": formatted_body}

    if formatted_resp.status_code == 503:
        err = entity_service_pipeline_error_code(formatted_body) or "typedb_not_configured_on_entity_service"
        log.warning("schema slice stopped at formatted: 503 %s", err)
        return {
            "ok": False,
            "stage": "formatted",
            "status_code": formatted_resp.status_code,
            "body": formatted_body,
            "error": err,
            "raw": None,
            "validate": {"skipped": True},
            "formatted": formatted_body,
        }
    if formatted_resp.status_code >= 400:
        log.warning("schema slice stopped at formatted: status=%s", formatted_resp.status_code)
        return {
            "ok": False,
            "stage": "formatted",
            "status_code": formatted_resp.status_code,
            "body": formatted_body,
            "raw": None,
            "validate": {"skipped": True},
            "formatted": formatted_body,
        }

    schema_ok = "entityTypes" in formatted_body and "knownEntities" in formatted_body
    log.info("schema slice end ok=%s", schema_ok)
    return {
        "ok": schema_ok,
        "raw": None,
        "validate": {"skipped": True, "detail": "POST /schema-pipeline/formatted only (no /raw)."},
        "formatted": formatted_body,
    }
