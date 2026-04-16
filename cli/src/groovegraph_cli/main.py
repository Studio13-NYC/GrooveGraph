from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any, cast

import typer

from groovegraph.analyze_workflow import run_analyze_query
from groovegraph.brave_extract_context import ContextMode
from groovegraph.catalog_types import CatalogEntityKind, parse_kind_list
from groovegraph.doctor import run_doctor
from groovegraph.draft_ingest import persist_ingest_envelope
from groovegraph.env_loader import brave_api_key, load_repo_dotenv, ner_service_url, openai_api_key
from groovegraph.explore_ingest import (
    build_ingest_rows_from_extract,
    catalog_labels_from_kinds,
    default_explore_batch_id,
)
from groovegraph.extract_client import post_extract
from groovegraph.ingest_models import IngestDraftEnvelope
from groovegraph.logging_setup import get_logger, setup_gg_logging
from groovegraph.paths import repo_root_from
from groovegraph.pending_queries import list_pending_hits
from groovegraph.schema_pipeline import post_schema_formatted, post_schema_raw, post_schema_validate, run_schema_pipeline_chain
from groovegraph.schema_bootstrap import ensure_groovegraph_catalog_schema
from groovegraph.search_workflow import run_gg_search
from groovegraph.stimulus_assembly_options import StimulusAssemblyOptions
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_session import open_typedb_driver, run_read_query

app = typer.Typer(no_args_is_help=True, add_completion=False)


def _dump_json(data: Any, *, pretty: bool) -> None:
    if pretty:
        raw = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False)
    else:
        raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    try:
        typer.echo(raw)
    except UnicodeEncodeError:
        # Windows consoles often default to cp1252; Brave snippets may contain emoji.
        if pretty:
            typer.echo(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=True))
        else:
            typer.echo(json.dumps(data, separators=(",", ":"), ensure_ascii=True))


def _pretty(ctx: typer.Context, pretty_cmd: bool) -> bool:
    """Per-command `--pretty` **or** global `gg --pretty <cmd> …` (Typer callback)."""
    return bool(pretty_cmd) or bool(ctx.obj.get("pretty"))


@app.callback()
def _global(
    ctx: typer.Context,
    pretty: Annotated[
        bool,
        typer.Option("--pretty", help="Human-readable JSON for commands that emit JSON (place **before** subcommand)."),
    ] = False,
) -> None:
    ctx.ensure_object(dict)
    ctx.obj["pretty"] = pretty
    dotenv_path = load_repo_dotenv()
    ctx.obj["dotenv_path"] = str(dotenv_path)

    repo_root = repo_root_from(Path.cwd())
    setup_gg_logging(repo_root)
    log = get_logger("cli")
    log.info("gg startup cwd=%s dotenv=%s global_pretty=%s", Path.cwd(), dotenv_path, pretty)
    if openai_api_key():
        log.info("OPENAI_API_KEY is set (value not logged)")


@app.command()
def doctor(
    ctx: typer.Context,
    probe: Annotated[
        bool,
        typer.Option(
            "--probe",
            help="If set without BRAVE_API_KEY, fail Brave section (normally absent keys are ignored).",
        ),
    ] = False,
    pretty_cmd: Annotated[
        bool,
        typer.Option("--pretty", help="Pretty-print JSON (use this after subcommand args, or `gg --pretty doctor`)."),
    ] = False,
) -> None:
    """Readiness checks: TypeDB (types via type_schema), entity-service GET /health|/ready|/docs, Brave one search when key is set."""
    root = Path.cwd()
    report = run_doctor(repo_start=root, probe_brave=probe)
    report = {**report, "dotenv_path": ctx.obj.get("dotenv_path")}
    _dump_json(report, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if bool(report.get("ok")) else 2)


schema_app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(schema_app, name="schema")


@schema_app.command("raw")
def schema_raw(
    ctx: typer.Context,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """POST /schema-pipeline/raw (initial testing / define inspection; normal ``gg`` flows use ``formatted`` only)."""
    base = ner_service_url()
    resp = post_schema_raw(base)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    _dump_json({"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if resp.status_code < 400 else 2)


@schema_app.command("validate")
def schema_validate(
    ctx: typer.Context,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """POST /schema-pipeline/validate (reads prior raw JSON from stdin)."""
    raw_text = typer.get_text_stream("stdin").read()
    if not raw_text.strip():
        _dump_json({"ok": False, "error": "stdin_empty"}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2)
    raw = json.loads(raw_text)
    if not isinstance(raw, dict):
        _dump_json({"ok": False, "error": "stdin_not_object"}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2)

    base = ner_service_url()
    resp = post_schema_validate(base, raw)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    _dump_json({"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if resp.status_code < 400 else 2)


@schema_app.command("formatted")
def schema_formatted(
    ctx: typer.Context,
    skip_ontology_precheck: Annotated[
        bool,
        typer.Option(
            "--skip-ontology-precheck/--no-skip-ontology-precheck",
            help="Forwarded as skipOntologyPrecheck (only use true if you already validated).",
        ),
    ] = False,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """POST /schema-pipeline/formatted (reads prior raw JSON from stdin)."""
    raw_text = typer.get_text_stream("stdin").read()
    if not raw_text.strip():
        _dump_json({"ok": False, "error": "stdin_empty"}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2)
    raw = json.loads(raw_text)
    if not isinstance(raw, dict):
        _dump_json({"ok": False, "error": "stdin_not_object"}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2)

    base = ner_service_url()
    resp = post_schema_formatted(base, raw, skip_ontology_precheck=skip_ontology_precheck)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    _dump_json({"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if resp.status_code < 400 else 2)


@schema_app.command("run")
def schema_run(
    ctx: typer.Context,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """Fetch DB-backed ``schema`` via ``POST /schema-pipeline/formatted`` (same path as ``extract`` / ``analyze --schema``)."""
    base = ner_service_url()
    result = run_schema_pipeline_chain(base)
    _dump_json(result, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if bool(result.get("ok")) else 2)


@app.command("repo-root")
def repo_root_cmd() -> None:
    """Print resolved GrooveGraph repository root (useful for tests and tooling)."""
    typer.echo(str(repo_root_from(Path.cwd())))


@app.command()
def search(
    ctx: typer.Context,
    query: Annotated[str, typer.Argument(help="Substring to match against catalog `name` in TypeDB (DB-first).")],
    types: Annotated[
        str | None,
        typer.Option(
            "--types",
            "-t",
            help="Comma-separated catalog kinds: mo-music-artist,mo-record,mo-track,mo-instrument,mo-label,foaf-agent,gg-generic (default: all).",
        ),
    ] = None,
    web: Annotated[
        bool | None,
        typer.Option(
            "--web/--no-web",
            help="Run Brave web search after DB (default: on when BRAVE_API_KEY is set).",
        ),
    ] = None,
    brave_count: Annotated[int, typer.Option("--brave-count", min=1, max=20)] = 20,
    extract: Annotated[
        bool,
        typer.Option("--extract", help="Run schema pipeline + POST /extract (requires configured entity-service)."),
    ] = False,
    max_stimulus_chars: Annotated[
        int | None,
        typer.Option(
            "--max-stimulus-chars",
            help="Hard cap on POST /extract text size (overrides GROOVEGRAPH_STIMULUS_MAX_CHARS for this run).",
        ),
    ] = None,
    fetch_supplementary_pages: Annotated[
        bool | None,
        typer.Option(
            "--fetch-supplementary-pages/--no-fetch-supplementary-pages",
            help="Optional HTTP GET + readability-style merge (overrides GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH).",
        ),
    ] = None,
    deep_artist_context: Annotated[
        bool | None,
        typer.Option(
            "--deep-artist-context/--no-deep-artist-context",
            help="Extra MusicBrainz/Discogs artist detail (overrides GROOVEGRAPH_CANONICAL_DEEP_ARTIST).",
        ),
    ] = None,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """DB-first catalog search, optional Brave enrichment, optional schema-aware extraction."""
    get_logger("cli").info("search begin query=%r types=%r web=%r extract=%r", query, types, web, extract)
    try:
        kinds = parse_kind_list(types, default_all=True)
    except ValueError as exc:
        _dump_json({"ok": False, "error": "invalid_types", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    include_web = brave_api_key() is not None if web is None else bool(web)
    stim_opts = StimulusAssemblyOptions.from_env().with_cli_overrides(
        stimulus_max_chars=max_stimulus_chars,
        fetch_supplementary_pages=fetch_supplementary_pages,
        deep_artist_context=deep_artist_context,
    )
    report = run_gg_search(
        needle=query,
        kinds=kinds,
        include_web=include_web,
        brave_count=brave_count,
        include_extract=extract,
        stimulus_options=stim_opts,
    )
    report = {**report, "dotenv_path": ctx.obj.get("dotenv_path")}
    get_logger("cli").info("search end ok=%s typedb_hits=%s", report.get("ok"), len((report.get("typedb") or {}).get("hits") or []))
    _dump_json(report, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if bool(report.get("ok")) else 2)


@app.command()
def explore(
    ctx: typer.Context,
    query: Annotated[str, typer.Argument(help="Topic: TypeDB catalog match + Brave excerpts + schema pipeline + POST /extract.")],
    types: Annotated[
        str | None,
        typer.Option(
            "--types",
            "-t",
            help="Comma-separated catalog kinds incl. gg-generic (default: all). Forwarded as /extract labels filter.",
        ),
    ] = None,
    brave_count: Annotated[int, typer.Option("--brave-count", min=1, max=20)] = 20,
    auto_catalog_schema: Annotated[
        bool,
        typer.Option(
            "--auto-catalog-schema/--no-auto-catalog-schema",
            help="If MO catalog types are missing in TypeDB, apply typedb/groovegraph-schema.tql (SCHEMA tx) before calling entity-service.",
        ),
    ] = True,
    use_model: Annotated[
        bool,
        typer.Option(
            "--use-model/--no-use-model",
            help="Forward options.use_model=true on POST /extract (GLiNER when enabled on entity-service).",
        ),
    ] = False,
    ingest: Annotated[
        bool,
        typer.Option(
            "--ingest",
            help="After a successful extract, persist mapped entities as pending drafts (same shape as gg ingest-draft).",
        ),
    ] = False,
    batch_id: Annotated[
        str | None,
        typer.Option(
            "--batch-id",
            help="ingestion_batch_id for --ingest (default: explore-YYYYMMDD-slug from query).",
        ),
    ] = None,
    max_stimulus_chars: Annotated[
        int | None,
        typer.Option("--max-stimulus-chars", help="Cap extract stimulus size for this run."),
    ] = None,
    fetch_supplementary_pages: Annotated[
        bool | None,
        typer.Option(
            "--fetch-supplementary-pages/--no-fetch-supplementary-pages",
            help="Optional HTTP page text merge (overrides env for this run).",
        ),
    ] = None,
    deep_artist_context: Annotated[
        bool | None,
        typer.Option(
            "--deep-artist-context/--no-deep-artist-context",
            help="Extra canonical artist detail (overrides env for this run).",
        ),
    ] = None,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """Explore: doctor (Brave probe) → optional catalog **define** in TypeDB → Brave rich text → /formatted → /extract → optional ingest."""
    log = get_logger("cli")
    log.info(
        "explore begin query=%r types=%r auto_catalog_schema=%s use_model=%s ingest=%s",
        query,
        types,
        auto_catalog_schema,
        use_model,
        ingest,
    )
    root = Path.cwd()
    doctor_report = run_doctor(repo_start=root, probe_brave=True)
    if not bool(doctor_report.get("ok")):
        log.warning(
            "explore FAILED stage=doctor ok=False (fix TypeDB, entity-service, or Brave; see gg doctor --probe)"
        )
        _dump_json(
            {
                "ok": False,
                "error": "doctor_failed",
                "detail": "Explore requires TypeDB, entity-service, and a working Brave API key (see `gg doctor --probe`).",
                "doctor": doctor_report,
                "dotenv_path": ctx.obj.get("dotenv_path"),
            },
            pretty=_pretty(ctx, pretty_cmd),
        )
        raise typer.Exit(code=2)
    log.info("explore stage=doctor ok=True")

    try:
        kinds = parse_kind_list(types, default_all=True)
    except ValueError as exc:
        _dump_json({"ok": False, "error": "invalid_types", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    schema_bootstrap: dict[str, Any] | None = None
    if not auto_catalog_schema:
        log.info("explore stage=schema_bootstrap skipped (--no-auto-catalog-schema)")
    if auto_catalog_schema:
        try:
            params = read_typedb_connection_params()
        except TypeDbConfigError as exc:
            _dump_json(
                {"ok": False, "error": "typedb_config", "detail": str(exc), "dotenv_path": ctx.obj.get("dotenv_path")},
                pretty=_pretty(ctx, pretty_cmd),
            )
            raise typer.Exit(code=2) from exc
        try:
            with open_typedb_driver(params) as driver:
                if not driver.databases.contains(params.database):
                    names = sorted(d.name for d in driver.databases.all())
                    _dump_json(
                        {
                            "ok": False,
                            "error": "database_missing",
                            "database": params.database,
                            "databases": names,
                            "dotenv_path": ctx.obj.get("dotenv_path"),
                        },
                        pretty=_pretty(ctx, pretty_cmd),
                    )
                    raise typer.Exit(code=2)
                repo = repo_root_from(root)
                schema_bootstrap = ensure_groovegraph_catalog_schema(
                    driver=driver,
                    database=params.database,
                    repo_root=repo,
                )
        except typer.Exit:
            raise
        except Exception as exc:  # noqa: BLE001
            get_logger("cli").exception("explore catalog schema bootstrap failed")
            _dump_json(
                {
                    "ok": False,
                    "error": "schema_bootstrap_exception",
                    "detail": str(exc),
                    "dotenv_path": ctx.obj.get("dotenv_path"),
                },
                pretty=_pretty(ctx, pretty_cmd),
            )
            raise typer.Exit(code=2) from exc

        if not bool(schema_bootstrap.get("ok")):
            log.warning(
                "explore FAILED stage=schema_bootstrap ok=False detail=%s",
                schema_bootstrap.get("detail"),
            )
            _dump_json(
                {
                    "ok": False,
                    "error": "schema_bootstrap_failed",
                    "schema_bootstrap": schema_bootstrap,
                    "dotenv_path": ctx.obj.get("dotenv_path"),
                },
                pretty=_pretty(ctx, pretty_cmd),
            )
            raise typer.Exit(code=2)
        log.info(
            "explore stage=schema_bootstrap ok=True action=%s",
            schema_bootstrap.get("action"),
        )

    stim_opts = StimulusAssemblyOptions.from_env().with_cli_overrides(
        stimulus_max_chars=max_stimulus_chars,
        fetch_supplementary_pages=fetch_supplementary_pages,
        deep_artist_context=deep_artist_context,
    )
    report = run_gg_search(
        needle=query,
        kinds=kinds,
        include_web=True,
        brave_count=brave_count,
        include_extract=True,
        require_successful_web_for_extract=True,
        use_model=use_model,
        include_reserved_generic_extract_label=True,
        stimulus_options=stim_opts,
    )
    report = {
        **report,
        "mode": "explore",
        "doctor": {"ok": True, "note": "Preflight passed at start of explore."},
        "schema_bootstrap": schema_bootstrap,
        "dotenv_path": ctx.obj.get("dotenv_path"),
    }

    ex_body = (report.get("extract") or {}).get("body") if isinstance((report.get("extract") or {}).get("body"), dict) else {}
    ent_list = ex_body.get("entities") if isinstance(ex_body.get("entities"), list) else []
    log.info(
        "explore stage=search_extract ok=%s typedb_hits=%s extract_http_ok=%s entities_count=%s",
        report.get("ok"),
        len((report.get("typedb") or {}).get("hits") or []),
        (report.get("extract") or {}).get("ok"),
        len(ent_list),
    )
    if ent_list:
        sample_labels = [str(e.get("label", "")) for e in ent_list[:8] if isinstance(e, dict)]
        log.info("explore extract sample_labels(first8)=%s", sample_labels)

    fmt = (report.get("schema_pipeline") or {}).get("formatted")
    if isinstance(fmt, dict):
        ne = fmt.get("knownEntities")
        et = fmt.get("entityTypes")
        n_empty = not isinstance(ne, list) or len(ne) == 0
        t_empty = not isinstance(et, list) or len(et) == 0
        if n_empty and t_empty and (report.get("extract") or {}).get("ok"):
            log.warning(
                "explore pipeline note: POST /schema-pipeline/formatted returned empty entityTypes and "
                "knownEntities - weak DB-backed schema slice for /extract (check TYPEDB_* on entity-service "
                "process vs gg; see docs/AGENT_ENTITY_SERVICE_ISSUES.md)"
            )

    ingest_report: dict[str, Any] | None = None
    if ingest:
        if not bool(report.get("ok")):
            ingest_report = {"ok": False, "error": "explore_not_ok", "detail": "Fix explore before --ingest."}
            report["ok"] = False
            log.warning(
                "explore FAILED stage=ingest reason=explore_not_ok (upstream search/extract not ok; see JSON extract/schema_pipeline)"
            )
        else:
            ex = report.get("extract") or {}
            body = ex.get("body") if isinstance(ex.get("body"), dict) else {}
            entities_raw = body.get("entities")
            entities = entities_raw if isinstance(entities_raw, list) else []
            allowed = catalog_labels_from_kinds(kinds)
            catalog_rows, skipped = build_ingest_rows_from_extract(entities=entities, allowed_labels=allowed)
            if not catalog_rows:
                ingest_report = {
                    "ok": False,
                    "error": "no_mappable_entities",
                    "skipped": skipped,
                    "entities_count": len(entities),
                }
                report["ok"] = False
                raw_labels = [str(e.get("label")) for e in entities if isinstance(e, dict) and e.get("label")]
                log.warning(
                    "explore FAILED stage=ingest reason=no_mappable_entities entities_count=%s "
                    "allowlisted_labels=%s raw_labels_from_es=%s skipped_count=%s",
                    len(entities),
                    sorted(allowed),
                    raw_labels[:20],
                    len(skipped),
                )
            else:
                bid = (batch_id or "").strip() or default_explore_batch_id(query)
                envelope = IngestDraftEnvelope(
                    ingestion_batch_id=bid,
                    catalog_entities=catalog_rows,
                    extract=body,
                    notes="gg explore --ingest",
                )
                try:
                    params = read_typedb_connection_params()
                except TypeDbConfigError as exc:
                    ingest_report = {"ok": False, "error": "typedb_config", "detail": str(exc)}
                    report["ok"] = False
                    log.warning("explore FAILED stage=ingest reason=typedb_config detail=%s", exc)
                else:
                    try:
                        with open_typedb_driver(params) as driver:
                            if not driver.databases.contains(params.database):
                                ingest_report = {"ok": False, "error": "database_missing"}
                                report["ok"] = False
                                log.warning(
                                    "explore FAILED stage=ingest reason=database_missing database=%s",
                                    params.database,
                                )
                            else:
                                ingest_report = persist_ingest_envelope(
                                    driver=driver,
                                    database=params.database,
                                    envelope=envelope,
                                )
                                ingest_report = {**ingest_report, "skipped": skipped, "ingestion_batch_id": bid}
                                dup_db = ingest_report.get("skipped_duplicate_in_database") or []
                                log.info(
                                    "explore stage=ingest ok=True batch_id=%s catalog_rows=%s inserted=%s "
                                    "skipped_non_rows=%s skipped_duplicate_in_database=%s",
                                    bid,
                                    len(catalog_rows),
                                    len((ingest_report.get("inserted") or [])),
                                    len(skipped),
                                    len(dup_db) if isinstance(dup_db, list) else 0,
                                )
                    except Exception as exc:  # noqa: BLE001
                        log.exception("explore FAILED stage=ingest reason=typedb_write_failed")
                        ingest_report = {"ok": False, "error": "typedb_write_failed", "detail": str(exc)}
                        report["ok"] = False

        report["ingest"] = ingest_report

    if bool(report.get("ok")):
        log.info("explore end ok=True (all requested stages succeeded)")
    else:
        err = (report.get("ingest") or {}).get("error") if isinstance(report.get("ingest"), dict) else None
        log.warning(
            "explore end ok=False (see JSON; ingest_error=%s extract_ok=%s)",
            err,
            (report.get("extract") or {}).get("ok"),
        )
    _dump_json(report, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if bool(report.get("ok")) else 2)


@app.command()
def analyze(
    ctx: typer.Context,
    query: Annotated[str, typer.Argument(help="Topic or string to send to entity-service POST /extract (after optional web context).")],
    typedb: Annotated[
        bool,
        typer.Option(
            "--typedb/--no-typedb",
            help="Also run catalog name search in TypeDB (MO allowlist); default off for greenfield discovery.",
        ),
    ] = False,
    types: Annotated[
        str | None,
        typer.Option(
            "--types",
            "-t",
            help="With --typedb: comma-separated MO kinds (default: all allowlisted).",
        ),
    ] = None,
    web: Annotated[
        bool | None,
        typer.Option(
            "--web/--no-web",
            help="Brave web search for extra context (default: on when BRAVE_API_KEY is set).",
        ),
    ] = None,
    brave_count: Annotated[int, typer.Option("--brave-count", min=1, max=20)] = 20,
    schema: Annotated[
        bool,
        typer.Option(
            "--schema/--no-schema",
            help="Run entity-service schema pipeline and pass schema to /extract (needs TypeDB on entity-service).",
        ),
    ] = False,
    context: Annotated[
        str,
        typer.Option(
            "--context",
            help="When Brave is on: `rich` (top titles + description snippets, capped) or `minimal` (query + first title only).",
        ),
    ] = "rich",
    use_model: Annotated[
        bool,
        typer.Option(
            "--use-model/--no-use-model",
            help="Set POST /extract options.use_model (needs entity-service + model configuration).",
        ),
    ] = False,
    emit_stimulus: Annotated[
        bool,
        typer.Option(
            "--emit-stimulus/--no-emit-stimulus",
            help="Include full stimulus text in JSON under stimulus.text (can be large).",
        ),
    ] = False,
    max_stimulus_chars: Annotated[
        int | None,
        typer.Option("--max-stimulus-chars", help="Cap combined stimulus size for this run."),
    ] = None,
    fetch_supplementary_pages: Annotated[
        bool | None,
        typer.Option(
            "--fetch-supplementary-pages/--no-fetch-supplementary-pages",
            help="Optional HTTP page text merge (overrides env for this run).",
        ),
    ] = None,
    deep_artist_context: Annotated[
        bool | None,
        typer.Option(
            "--deep-artist-context/--no-deep-artist-context",
            help="Extra canonical artist detail (overrides env for this run).",
        ),
    ] = None,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """
    Discovery: optional web + optional TypeDB catalog context, then POST /extract with **no label filter**
    and **no schema** by default — use returned `entities` (labels, spans) to decide what types to model next.
    """
    get_logger("cli").info(
        "analyze begin query=%r typedb=%r types=%r web=%r schema=%r context=%r use_model=%r",
        query,
        typedb,
        types,
        web,
        schema,
        context,
        use_model,
    )
    ctx_mode = context.strip().lower()
    if ctx_mode not in ("minimal", "rich"):
        _dump_json(
            {"ok": False, "error": "invalid_context", "detail": "Use --context minimal or --context rich."},
            pretty=_pretty(ctx, pretty_cmd),
        )
        raise typer.Exit(code=2)
    kinds: list[CatalogEntityKind] = []
    if typedb:
        try:
            kinds = parse_kind_list(types, default_all=True)
        except ValueError as exc:
            _dump_json({"ok": False, "error": "invalid_types", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
            raise typer.Exit(code=2) from exc

    include_web = brave_api_key() is not None if web is None else bool(web)
    stim_opts = StimulusAssemblyOptions.from_env().with_cli_overrides(
        stimulus_max_chars=max_stimulus_chars,
        fetch_supplementary_pages=fetch_supplementary_pages,
        deep_artist_context=deep_artist_context,
    )
    report = run_analyze_query(
        needle=query,
        include_typedb=typedb,
        kinds=kinds,
        include_web=include_web,
        brave_count=brave_count,
        include_schema=schema,
        extract_context=cast(ContextMode, ctx_mode),
        use_model=use_model,
        emit_stimulus=emit_stimulus,
        stimulus_options=stim_opts,
    )
    report = {**report, "dotenv_path": ctx.obj.get("dotenv_path")}
    get_logger("cli").info("analyze end ok=%s", report.get("ok"))
    _dump_json(report, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if bool(report.get("ok")) else 2)


@app.command("extract")
def extract_cmd(
    ctx: typer.Context,
    text: Annotated[str, typer.Option("--text", help="Free text to send to POST /extract.")],
    labels: Annotated[
        str | None,
        typer.Option("--labels", help="Optional comma-separated label filter forwarded to entity-service."),
    ] = None,
    no_schema: Annotated[bool, typer.Option("--no-schema", help="Do not run /schema-pipeline/* before /extract.")] = False,
    use_model: Annotated[
        bool,
        typer.Option("--use-model/--no-use-model", help="Forward use_model to entity-service POST /extract."),
    ] = False,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """Call entity-service POST /extract (optionally schema-aware via /schema-pipeline/*)."""
    base = ner_service_url()
    labels_list = [t.strip() for t in labels.split(",")] if labels else []
    labels_list = [t for t in labels_list if t]

    schema: dict[str, Any] | None = None
    if not no_schema:
        chain = run_schema_pipeline_chain(base)
        if chain.get("ok") is not True:
            _dump_json(
                {"ok": False, "error": "schema_pipeline_failed", "detail": chain, "dotenv_path": ctx.obj.get("dotenv_path")},
                pretty=_pretty(ctx, pretty_cmd),
            )
            raise typer.Exit(code=2)
        formatted = chain.get("formatted")
        if not isinstance(formatted, dict):
            _dump_json(
                {
                    "ok": False,
                    "error": "schema_pipeline_missing_formatted",
                    "detail": chain,
                    "dotenv_path": ctx.obj.get("dotenv_path"),
                },
                pretty=_pretty(ctx, pretty_cmd),
            )
            raise typer.Exit(code=2)
        schema = formatted

    payload: dict[str, Any] = {
        "text": text,
        "labels": labels_list,
        "options": {"use_aliases": True, "use_model": use_model},
    }
    if schema is not None:
        payload["schema"] = schema

    resp = post_extract(base, payload)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    out = {
        "ok": resp.status_code < 400,
        "status_code": resp.status_code,
        "body": body,
        "dotenv_path": ctx.obj.get("dotenv_path"),
    }
    _dump_json(out, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if out["ok"] else 2)


@app.command("ingest-draft")
def ingest_draft_cmd(
    ctx: typer.Context,
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """Persist draft catalog rows from JSON on stdin (see docs in `cli/README.md`)."""
    raw_text = typer.get_text_stream("stdin").read()
    if not raw_text.strip():
        _dump_json({"ok": False, "error": "stdin_empty"}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2)
    try:
        data = json.loads(raw_text)
        envelope = IngestDraftEnvelope.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        _dump_json({"ok": False, "error": "invalid_json_envelope", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    if not envelope.catalog_entities:
        _dump_json({"ok": False, "error": "empty_catalog_entities"}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2)

    try:
        params = read_typedb_connection_params()
    except TypeDbConfigError as exc:
        _dump_json({"ok": False, "error": "typedb_config", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    try:
        with open_typedb_driver(params) as driver:
            if not driver.databases.contains(params.database):
                names = sorted(d.name for d in driver.databases.all())
                _dump_json(
                    {
                        "ok": False,
                        "error": "database_missing",
                        "database": params.database,
                        "databases": names,
                    },
                    pretty=_pretty(ctx, pretty_cmd),
                )
                raise typer.Exit(code=2)
            result = persist_ingest_envelope(driver=driver, database=params.database, envelope=envelope)
    except Exception as exc:  # noqa: BLE001
        get_logger("cli").exception("ingest-draft failed")
        _dump_json({"ok": False, "error": "typedb_write_failed", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    _dump_json({**result, "dotenv_path": ctx.obj.get("dotenv_path")}, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0 if bool(result.get("ok")) else 2)


pending_app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(pending_app, name="pending")


@pending_app.command("list")
def pending_list_cmd(
    ctx: typer.Context,
    types: Annotated[
        str | None,
        typer.Option(
            "--types",
            "-t",
            help="Comma-separated catalog kinds (default: all).",
        ),
    ] = None,
    approval: Annotated[str, typer.Option("--approval", help="approval-status filter (default: pending).")] = "pending",
    pretty_cmd: Annotated[bool, typer.Option("--pretty", help="Pretty-print JSON.")] = False,
) -> None:
    """List catalog entities in a draft approval state (bounded)."""
    try:
        kinds = parse_kind_list(types, default_all=True)
    except ValueError as exc:
        _dump_json({"ok": False, "error": "invalid_types", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    try:
        params = read_typedb_connection_params()
    except TypeDbConfigError as exc:
        _dump_json({"ok": False, "error": "typedb_config", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    try:
        with open_typedb_driver(params) as driver:
            if not driver.databases.contains(params.database):
                names = sorted(d.name for d in driver.databases.all())
                _dump_json(
                    {
                        "ok": False,
                        "error": "database_missing",
                        "database": params.database,
                        "databases": names,
                    },
                    pretty=_pretty(ctx, pretty_cmd),
                )
                raise typer.Exit(code=2)
            hits = list_pending_hits(
                driver=driver,
                database=params.database,
                kinds=kinds,
                run_read_query=run_read_query,
                approval=approval,
            )
    except Exception as exc:  # noqa: BLE001
        get_logger("cli").exception("pending list failed")
        _dump_json({"ok": False, "error": "typedb_read_failed", "detail": str(exc)}, pretty=_pretty(ctx, pretty_cmd))
        raise typer.Exit(code=2) from exc

    out = {"ok": True, "approval": approval, "hits": hits, "dotenv_path": ctx.obj.get("dotenv_path")}
    _dump_json(out, pretty=_pretty(ctx, pretty_cmd))
    raise typer.Exit(code=0)


def entrypoint() -> None:
    app(obj={})
