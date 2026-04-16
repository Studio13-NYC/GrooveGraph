from __future__ import annotations

from typing import Any

import httpx

from groovegraph.entity_service_errors import entity_service_pipeline_error_code
from groovegraph.logging_setup import get_logger

log = get_logger("schema_pipeline")


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
    url = f"{base_url.rstrip('/')}/schema-pipeline/formatted"
    payload: dict[str, Any] = {
        "typeSchemaDefine": _pick_type_schema_define(raw),
        "assumptions": _pick_assumptions(raw),
        "skipOntologyPrecheck": skip_ontology_precheck,
    }
    log.debug("POST %s skipOntologyPrecheck=%s", url, skip_ontology_precheck)
    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, json=payload)
    log.info("schema-pipeline/formatted status=%s", resp.status_code)
    return resp


def run_schema_pipeline_chain(base_url: str) -> dict[str, Any]:
    """
    End-to-end chain against a running entity-service:
    raw, then validate, then formatted (skipOntologyPrecheck tracks validate readiness).
    """
    log.info("schema pipeline chain begin base_url=%s", base_url.rstrip("/"))
    raw_resp = post_schema_raw(base_url)
    raw_body = raw_resp.json() if raw_resp.content else {}
    if not isinstance(raw_body, dict):
        raw_body = {"_non_object_json": raw_body}

    if raw_resp.status_code == 503:
        err = entity_service_pipeline_error_code(raw_body) or "typedb_not_configured_on_entity_service"
        log.warning("schema pipeline stopped at raw: 503 %s", err)
        return {
            "ok": False,
            "stage": "raw",
            "status_code": raw_resp.status_code,
            "body": raw_body,
            "error": err,
        }
    if raw_resp.status_code >= 400:
        log.warning("schema pipeline stopped at raw: status=%s", raw_resp.status_code)
        return {
            "ok": False,
            "stage": "raw",
            "status_code": raw_resp.status_code,
            "body": raw_body,
        }

    validate_resp = post_schema_validate(base_url, raw_body)
    validate_body = validate_resp.json() if validate_resp.content else {}
    if not isinstance(validate_body, dict):
        validate_body = {"_non_object_json": validate_body}
    if validate_resp.status_code >= 400:
        log.warning("schema pipeline stopped at validate: status=%s", validate_resp.status_code)
        return {
            "ok": False,
            "stage": "validate",
            "status_code": validate_resp.status_code,
            "raw": raw_body,
            "validate": validate_body,
        }

    ready = bool(validate_body.get("ready"))
    log.info("schema pipeline validate ready=%s", ready)
    formatted_resp = post_schema_formatted(base_url, raw_body, skip_ontology_precheck=ready)
    formatted_body = formatted_resp.json() if formatted_resp.content else {}
    if not isinstance(formatted_body, dict):
        formatted_body = {"_non_object_json": formatted_body}

    if formatted_resp.status_code >= 400:
        log.warning("schema pipeline stopped at formatted: status=%s", formatted_resp.status_code)
        return {
            "ok": False,
            "stage": "formatted",
            "status_code": formatted_resp.status_code,
            "raw": raw_body,
            "validate": validate_body,
            "formatted": formatted_body,
        }

    schema_ok = "entityTypes" in formatted_body and "knownEntities" in formatted_body
    log.info("schema pipeline chain end ok=%s", schema_ok)
    return {
        "ok": schema_ok,
        "raw": raw_body,
        "validate": validate_body,
        "formatted": formatted_body,
    }
