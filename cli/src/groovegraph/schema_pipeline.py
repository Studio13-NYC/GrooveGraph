from __future__ import annotations

from typing import Any

import httpx


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
    url = f"{base_url.rstrip('/')}/schema-pipeline/raw"
    with httpx.Client(timeout=timeout_s) as client:
        return client.post(url, json={})


def post_schema_validate(base_url: str, raw: dict[str, Any], *, timeout_s: float = 60.0) -> httpx.Response:
    url = f"{base_url.rstrip('/')}/schema-pipeline/validate"
    payload = {
        "typeSchemaDefine": _pick_type_schema_define(raw),
        "assumptions": _pick_assumptions(raw),
    }
    with httpx.Client(timeout=timeout_s) as client:
        return client.post(url, json=payload)


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
    with httpx.Client(timeout=timeout_s) as client:
        return client.post(url, json=payload)


def run_schema_pipeline_chain(base_url: str) -> dict[str, Any]:
    """
    End-to-end chain against a running entity-service:
    raw, then validate, then formatted (skipOntologyPrecheck tracks validate readiness).
    """
    raw_resp = post_schema_raw(base_url)
    raw_body = raw_resp.json() if raw_resp.content else {}
    if not isinstance(raw_body, dict):
        raw_body = {"_non_object_json": raw_body}

    if raw_resp.status_code == 503:
        return {
            "ok": False,
            "stage": "raw",
            "status_code": raw_resp.status_code,
            "body": raw_body,
            "error": "typedb_not_configured_on_entity_service",
        }
    if raw_resp.status_code >= 400:
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
        return {
            "ok": False,
            "stage": "validate",
            "status_code": validate_resp.status_code,
            "raw": raw_body,
            "validate": validate_body,
        }

    ready = bool(validate_body.get("ready"))
    formatted_resp = post_schema_formatted(base_url, raw_body, skip_ontology_precheck=ready)
    formatted_body = formatted_resp.json() if formatted_resp.content else {}
    if not isinstance(formatted_body, dict):
        formatted_body = {"_non_object_json": formatted_body}

    if formatted_resp.status_code >= 400:
        return {
            "ok": False,
            "stage": "formatted",
            "status_code": formatted_resp.status_code,
            "raw": raw_body,
            "validate": validate_body,
            "formatted": formatted_body,
        }

    schema_ok = "entityTypes" in formatted_body and "knownEntities" in formatted_body
    return {
        "ok": schema_ok,
        "raw": raw_body,
        "validate": validate_body,
        "formatted": formatted_body,
    }
