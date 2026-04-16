from __future__ import annotations

from typing import Any

from groovegraph.brave_search import brave_web_search
from groovegraph.canonical_sources import fetch_canonical_enrichment
from groovegraph.catalog_search import search_catalog_in_typedb
from groovegraph.catalog_types import CatalogEntityKind, extract_request_labels
from groovegraph.env_loader import brave_api_key, ner_service_url
from groovegraph.extract_client import post_extract
from groovegraph.logging_setup import get_logger
from groovegraph.schema_pipeline import run_schema_pipeline_chain
from groovegraph.stimulus_compose import (
    build_extract_stimulus_text,
    enrichment_sufficient_for_extract,
)
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_session import open_typedb_driver, run_read_query

log = get_logger("search_workflow")


def run_gg_search(
    *,
    needle: str,
    kinds: list[CatalogEntityKind],
    include_web: bool,
    brave_count: int,
    include_extract: bool,
    require_successful_web_for_extract: bool = False,
    use_model: bool = False,
    include_reserved_generic_extract_label: bool = False,
) -> dict[str, Any]:
    """
    DB-first search, optional Brave web enrichment, optional schema-aware extraction.

    This function never raises for "expected" upstream gaps — it returns structured JSON instead.

    When ``require_successful_web_for_extract`` is true (``gg explore``), extract is skipped only
    when **both** Brave (if web was enabled) **and** canonical sources (Wikipedia / MusicBrainz /
    Discogs) fail to produce stimulus text — not on Brave alone if canonical succeeded.

    ``use_model`` forwards to ``POST /extract`` ``options.use_model`` (GLiNER path on entity-service).

    ``include_reserved_generic_extract_label`` (``gg explore``) appends ``gg-generic`` to ``labels`` so
    generic spans from entity-service are not filtered out when MO kinds are also requested.
    """
    log.info(
        "run_gg_search begin needle=%r kinds=%s include_web=%s brave_count=%s include_extract=%s "
        "require_successful_web_for_extract=%s use_model=%s include_reserved_generic_extract_label=%s",
        needle,
        [k.kind for k in kinds],
        include_web,
        brave_count,
        include_extract,
        require_successful_web_for_extract,
        use_model,
        include_reserved_generic_extract_label,
    )
    out: dict[str, Any] = {
        "ok": True,
        "query": needle,
        "typedb": {"ok": False, "hits": []},
        "web": None,
        "schema_pipeline": None,
        "extract": None,
        "canonical_sources": None,
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
    canonical = None
    if include_extract:
        canonical = fetch_canonical_enrichment(needle)
        out["canonical_sources"] = canonical.to_wire()
        web_ok = bool(include_web and isinstance(out.get("web"), dict) and out["web"].get("ok") is True)
        extract_text = build_extract_stimulus_text(
            needle,
            out.get("web"),
            include_web=include_web,
            brave_count=brave_count,
            canonical=canonical,
            context="rich",
        )

    if include_extract:
        base = ner_service_url()
        web_ok = bool(include_web and isinstance(out.get("web"), dict) and out["web"].get("ok") is True)
        if require_successful_web_for_extract and canonical is not None:
            if not enrichment_sufficient_for_extract(canonical=canonical, web_ok=web_ok):
                out["ok"] = False
                out["schema_pipeline"] = None
                out["extract"] = {
                    "ok": False,
                    "error": "insufficient_context",
                    "detail": {"web": out.get("web"), "canonical_sources": out.get("canonical_sources")},
                }
                log.warning("extract skipped: no canonical text and Brave web not ok")
                return out

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

        labels = extract_request_labels(
            kinds,
            include_reserved_generic=include_reserved_generic_extract_label,
        )
        payload: dict[str, Any] = {
            "text": extract_text,
            "labels": labels,
            "options": {
                "use_aliases": True,
                "use_model": use_model,
                "useGgGenericForUnknownCatalogLabels": True,
            },
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
