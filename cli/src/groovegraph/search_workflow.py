from __future__ import annotations

from typing import Any

from groovegraph.brave_search import brave_web_search
from groovegraph.catalog_search import search_catalog_in_typedb
from groovegraph.catalog_types import CatalogEntityKind
from groovegraph.env_loader import brave_api_key, ner_service_url
from groovegraph.extract_client import post_extract
from groovegraph.logging_setup import get_logger
from groovegraph.schema_pipeline import run_schema_pipeline_chain
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_session import open_typedb_driver, run_read_query

log = get_logger("search_workflow")


def _first_brave_title(web: dict[str, Any]) -> str | None:
    body = web.get("body")
    if not isinstance(body, dict):
        return None
    results = body.get("web", {}).get("results", []) if isinstance(body.get("web"), dict) else []
    if not isinstance(results, list) or not results:
        return None
    first = results[0]
    if not isinstance(first, dict):
        return None
    title = first.get("title")
    return str(title) if title else None


def run_gg_search(
    *,
    needle: str,
    kinds: list[CatalogEntityKind],
    include_web: bool,
    brave_count: int,
    include_extract: bool,
) -> dict[str, Any]:
    """
    DB-first search, optional Brave web enrichment, optional schema-aware extraction.

    This function never raises for "expected" upstream gaps — it returns structured JSON instead.
    """
    log.info(
        "run_gg_search begin needle=%r kinds=%s include_web=%s brave_count=%s include_extract=%s",
        needle,
        [k.kind for k in kinds],
        include_web,
        brave_count,
        include_extract,
    )
    out: dict[str, Any] = {
        "ok": True,
        "query": needle,
        "typedb": {"ok": False, "hits": []},
        "web": None,
        "schema_pipeline": None,
        "extract": None,
    }

    typedb_hits: list[dict[str, Any]] = []
    try:
        params = read_typedb_connection_params()
    except TypeDbConfigError as exc:
        log.warning("typedb config missing: %s", exc)
        out["typedb"] = {"ok": False, "error": "config", "detail": str(exc), "hits": []}
        out["ok"] = False
        return out

    with open_typedb_driver(params) as driver:
        if not driver.databases.contains(params.database):
            names = sorted(d.name for d in driver.databases.all())
            out["typedb"] = {
                "ok": False,
                "error": "database_missing",
                "database": params.database,
                "databases": names,
                "hits": [],
            }
            out["ok"] = False
            log.warning("typedb database missing name=%s available=%s", params.database, names)
            return out

        typedb_hits = search_catalog_in_typedb(
            driver=driver,
            database=params.database,
            needle=needle,
            kinds=kinds,
            run_read_query=run_read_query,
        )
        out["typedb"] = {"ok": True, "hits": typedb_hits, "database": params.database}
        log.info("typedb catalog search hits=%s", len(typedb_hits))

    web_report: dict[str, Any] | None = None
    if include_web:
        key = brave_api_key()
        if not key:
            web_report = {"ok": False, "error": "missing_api_key", "detail": "Set BRAVE_API_KEY in repo-root `.env`."}
        else:
            web_report = brave_web_search(api_key=key, query=needle, count=brave_count)
        out["web"] = web_report
        log.info("web stage ok=%s", isinstance(web_report, dict) and web_report.get("ok"))

    extract_text = needle
    if isinstance(out.get("web"), dict) and out["web"].get("ok") is True:
        title = _first_brave_title(out["web"])
        if title:
            extract_text = f"{needle}\n\n{title}"

    if include_extract:
        base = ner_service_url()
        log.info("extract stage: calling schema pipeline + /extract base=%s", base)
        chain = run_schema_pipeline_chain(base)
        out["schema_pipeline"] = chain
        if chain.get("ok") is not True:
            out["extract"] = {"ok": False, "error": "schema_pipeline_failed", "detail": chain}
            out["ok"] = False
            return out

        formatted = chain.get("formatted")
        if not isinstance(formatted, dict):
            out["extract"] = {"ok": False, "error": "schema_pipeline_missing_formatted", "detail": chain}
            out["ok"] = False
            return out

        labels = [k.kind for k in kinds]
        payload: dict[str, Any] = {
            "text": extract_text,
            "labels": labels,
            "options": {"use_aliases": True, "use_model": False},
            "schema": formatted,
        }
        resp = post_extract(base, payload)
        body: Any
        try:
            body = resp.json()
        except Exception:  # noqa: BLE001
            body = {"raw": resp.text}
        out["extract"] = {"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}
        if resp.status_code >= 400:
            out["ok"] = False

    log.info("run_gg_search end ok=%s", out.get("ok"))
    return out
