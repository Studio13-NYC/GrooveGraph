from __future__ import annotations

from typing import Any

from groovegraph.brave_extract_context import ContextMode, build_augmented_extract_text
from groovegraph.brave_search import brave_web_search
from groovegraph.catalog_search import search_catalog_in_typedb
from groovegraph.catalog_types import CatalogEntityKind
from groovegraph.env_loader import brave_api_key, ner_service_url
from groovegraph.extract_client import post_extract
from groovegraph.logging_setup import get_logger
from groovegraph.schema_pipeline import run_schema_pipeline_chain
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_session import open_typedb_driver, run_read_query

log = get_logger("analyze_workflow")


def run_analyze_query(
    *,
    needle: str,
    include_typedb: bool,
    kinds: list[CatalogEntityKind],
    include_web: bool,
    brave_count: int,
    include_schema: bool,
    extract_context: ContextMode = "rich",
    use_model: bool = False,
    emit_stimulus: bool = False,
    stimulus_max_chars: int = 12_000,
) -> dict[str, Any]:
    """
    Discovery-oriented path: optional catalog + optional web, then POST /extract with **no label filter**
    (``labels: []``) so entity-service can surface whatever labels it finds.

    By default **no** ``schema`` is sent (no TypeDB schema slice on the server) unless ``include_schema`` is true.
    """
    log.info(
        "run_analyze_query needle=%r include_typedb=%s kinds=%s include_web=%s include_schema=%s "
        "extract_context=%s use_model=%s",
        needle,
        include_typedb,
        [k.kind for k in kinds],
        include_web,
        include_schema,
        extract_context,
        use_model,
    )
    out: dict[str, Any] = {
        "ok": True,
        "mode": "analyze",
        "query": needle,
        "typedb": None,
        "web": None,
        "schema_pipeline": None,
        "extract": None,
        "stimulus": None,
    }

    if include_typedb:
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
                return out

            typedb_hits = search_catalog_in_typedb(
                driver=driver,
                database=params.database,
                needle=needle,
                kinds=kinds,
                run_read_query=run_read_query,
            )
            out["typedb"] = {"ok": True, "hits": typedb_hits, "database": params.database}
    else:
        out["typedb"] = {"ok": True, "skipped": True, "hits": [], "detail": "no catalog search (use --typedb to enable)"}

    web_report: dict[str, Any] | None = None
    if include_web:
        key = brave_api_key()
        if not key:
            web_report = {"ok": False, "error": "missing_api_key", "detail": "Set BRAVE_API_KEY in repo-root `.env`."}
        else:
            web_report = brave_web_search(api_key=key, query=needle, count=brave_count)
        out["web"] = web_report

    extract_text = needle
    web_ok = isinstance(out.get("web"), dict) and out["web"].get("ok") is True
    if include_web and web_ok and isinstance(out["web"], dict):
        extract_text = build_augmented_extract_text(
            needle,
            out["web"],
            context=extract_context,
            max_chars=stimulus_max_chars,
        )

    base = ner_service_url()
    schema: dict[str, Any] | None = None
    if include_schema:
        log.info("analyze: schema pipeline begin base=%s", base)
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
        schema = formatted

    payload: dict[str, Any] = {
        "text": extract_text,
        "labels": [],
        "options": {"use_aliases": True, "use_model": use_model},
    }
    if schema is not None:
        payload["schema"] = schema

    stim: dict[str, Any] = {
        "context": extract_context if include_web else "none",
        "use_model": use_model,
        "char_len": len(extract_text),
    }
    if emit_stimulus:
        stim["text"] = extract_text
    else:
        prev = extract_text[:400]
        stim["preview"] = prev + ("…" if len(extract_text) > 400 else "")

    out["stimulus"] = stim

    log.info(
        "analyze: POST /extract text_len=%s has_schema=%s labels=[] use_model=%s",
        len(extract_text),
        schema is not None,
        use_model,
    )
    resp = post_extract(base, payload)
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    out["extract"] = {"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}
    if resp.status_code >= 400:
        out["ok"] = False

    log.info("run_analyze_query end ok=%s", out.get("ok"))
    return out
