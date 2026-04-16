from __future__ import annotations

from pathlib import Path

from groovegraph.brave_probe import probe_brave_search
from groovegraph.env_loader import brave_api_key, ner_service_url
from groovegraph.ner_health import check_entity_service_docs
from groovegraph.paths import repo_root_from
from groovegraph.typedb_config import read_typedb_connection_params, TypeDbConfigError
from groovegraph.typedb_verify import verify_typedb


def run_doctor(*, repo_start: Path | None, probe_brave: bool) -> dict[str, object]:
    root = repo_root_from(repo_start)
    typedb_report: dict[str, object]
    try:
        params = read_typedb_connection_params()
        typedb_report = verify_typedb(params)
    except TypeDbConfigError as exc:
        typedb_report = {"ok": False, "error": "config", "detail": str(exc)}

    ner_url = ner_service_url()
    ner_report = check_entity_service_docs(ner_url)

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

    overall_ok = bool(typedb_report.get("ok")) and bool(ner_report.get("ok")) and bool(brave_report.get("ok"))

    return {
        "ok": overall_ok,
        "repo_root": str(root),
        "typedb": typedb_report,
        "entity_service": ner_report,
        "brave": brave_report,
    }
