from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from groovegraph.brave_probe import probe_brave_search
from groovegraph.entity_service_schema_probe import probe_db_backed_formatted_schema
from groovegraph.env_loader import (
    brave_api_key,
    discogs_token,
    groovegraph_http_user_agent_is_explicit,
    ner_service_url,
)
from groovegraph.logging_setup import get_logger
from groovegraph.ner_health import check_entity_service_liveness
from groovegraph.paths import repo_root_from
from groovegraph.typedb_catalog_requirements import (
    missing_required_entity_types,
    parse_required_entity_types_from_env,
)
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_verify import verify_typedb

log = get_logger("doctor")


def run_doctor(*, repo_start: Path | None, probe_brave: bool) -> dict[str, object]:
    root = repo_root_from(repo_start)
    log.info("doctor begin repo_root=%s probe_brave=%s", root, probe_brave)
    typedb_report: dict[str, Any]
    try:
        params = read_typedb_connection_params()
        typedb_report = dict(verify_typedb(params))
    except TypeDbConfigError as exc:
        typedb_report = {"ok": False, "error": "config", "detail": str(exc)}

    required_entity_types = parse_required_entity_types_from_env()
    typedb_types_list: list[str] = []
    if typedb_report.get("ok") is True and isinstance(typedb_report.get("types"), list):
        typedb_types_list = [str(x) for x in cast(list[Any], typedb_report["types"])]
    missing_required = missing_required_entity_types(
        declared_types=typedb_types_list,
        required=required_entity_types,
    )
    typedb_report["required_entity_types"] = list(required_entity_types)
    typedb_report["required_entity_types_missing"] = missing_required
    typedb_report["required_entity_types_ok"] = len(missing_required) == 0
    if missing_required and typedb_report.get("ok") is True:
        typedb_report["ok"] = False
        typedb_report["error"] = "required_entity_types_missing"

    ner_url = ner_service_url()
    ner_report = check_entity_service_liveness(ner_url)

    entity_service_schema: dict[str, Any] = {"skipped": True, "reason": "entity_service_not_ok"}
    if ner_report.get("ok") is True:
        entity_service_schema = probe_db_backed_formatted_schema(
            ner_url,
            typedb_type_names=typedb_types_list if typedb_types_list else None,
        )

    warnings: list[str] = []
    if entity_service_schema.get("status_code") == 503:
        warnings.append(
            "entity-service returned 503 for POST /schema-pipeline/formatted — "
            "TypeDB is likely not configured on the entity-service process "
            "(schema-aware extract still fails until TYPEDB_* is set there)."
        )
    if not discogs_token():
        warnings.append(
            "DISCOGS_TOKEN is unset — Discogs enrichment will be empty "
            "(see repo-root .env.example and docs/WEB_ENRICHMENT.md)."
        )
    if not groovegraph_http_user_agent_is_explicit():
        warnings.append(
            "GROOVEGRAPH_HTTP_USER_AGENT is unset — using the built-in default; "
            "set a unique value for Discogs/MusicBrainz policy."
        )

    brave_key = brave_api_key()
    brave_report: dict[str, object] = {
        "configured": brave_key is not None,
        "probed": False,
    }
    if brave_key:
        brave_report["search"] = probe_brave_search(brave_key)
        brave_report["probed"] = True
        brave_report["ok"] = bool(brave_report["search"].get("ok"))
    elif probe_brave:
        brave_report["ok"] = False
        brave_report["error"] = "missing_api_key"
    else:
        brave_report["ok"] = True

    dual_suspect = bool(entity_service_schema.get("dual_typedb_env_suspected"))
    overall_ok = (
        bool(typedb_report.get("ok"))
        and bool(ner_report.get("ok"))
        and bool(brave_report.get("ok"))
        and not dual_suspect
    )
    log.info(
        "doctor end ok=%s typedb_ok=%s ner_ok=%s brave_ok=%s dual_typedb_suspected=%s",
        overall_ok,
        typedb_report.get("ok"),
        ner_report.get("ok"),
        brave_report.get("ok"),
        dual_suspect,
    )

    canonical_enrichment = {
        "discogs_token_configured": discogs_token() is not None,
        "http_user_agent_explicit": groovegraph_http_user_agent_is_explicit(),
        "ready_for_full_discogs_policy": discogs_token() is not None
        and groovegraph_http_user_agent_is_explicit(),
    }

    return {
        "ok": overall_ok,
        "repo_root": str(root),
        "typedb": typedb_report,
        "entity_service": ner_report,
        "entity_service_schema": entity_service_schema,
        "canonical_enrichment": canonical_enrichment,
        "warnings": warnings,
        "brave": brave_report,
    }
