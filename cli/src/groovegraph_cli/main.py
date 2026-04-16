from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

import typer

from groovegraph.doctor import run_doctor
from groovegraph.env_loader import load_repo_dotenv, ner_service_url
from groovegraph.paths import repo_root_from
from groovegraph.schema_pipeline import post_schema_formatted, post_schema_raw, post_schema_validate, run_schema_pipeline_chain

app = typer.Typer(no_args_is_help=True, add_completion=False)


def _dump_json(data: Any, *, pretty: bool) -> None:
    if pretty:
        typer.echo(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False))
    else:
        typer.echo(json.dumps(data, separators=(",", ":"), ensure_ascii=False))


@app.callback()
def _global(
    ctx: typer.Context,
    pretty: Annotated[
        bool,
        typer.Option("--pretty", help="Human-readable JSON output (default is compact JSON)."),
    ] = False,
) -> None:
    ctx.ensure_object(dict)
    ctx.obj["pretty"] = pretty
    # Always load repo-root `.env` for every subcommand.
    dotenv_path = load_repo_dotenv()
    ctx.obj["dotenv_path"] = str(dotenv_path)


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
) -> None:
    """Readiness checks: TypeDB (types via type_schema), entity-service GET /docs, Brave one search when key is set."""
    root = Path.cwd()
    report = run_doctor(repo_start=root, probe_brave=probe)
    report = {**report, "dotenv_path": ctx.obj.get("dotenv_path")}
    _dump_json(report, pretty=bool(ctx.obj.get("pretty")))
    raise typer.Exit(code=0 if bool(report.get("ok")) else 2)


schema_app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(schema_app, name="schema")


@schema_app.command("raw")
def schema_raw(ctx: typer.Context) -> None:
    """POST /schema-pipeline/raw (requires entity-service + server-side TypeDB env)."""
    base = ner_service_url()
    resp = post_schema_raw(base)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    _dump_json({"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}, pretty=bool(ctx.obj.get("pretty")))
    raise typer.Exit(code=0 if resp.status_code < 400 else 2)


@schema_app.command("validate")
def schema_validate(ctx: typer.Context) -> None:
    """POST /schema-pipeline/validate (reads prior raw JSON from stdin)."""
    raw_text = typer.get_text_stream("stdin").read()
    if not raw_text.strip():
        typer.echo(json.dumps({"ok": False, "error": "stdin_empty"}, separators=(",", ":")))
        raise typer.Exit(code=2)
    raw = json.loads(raw_text)
    if not isinstance(raw, dict):
        typer.echo(json.dumps({"ok": False, "error": "stdin_not_object"}, separators=(",", ":")))
        raise typer.Exit(code=2)

    base = ner_service_url()
    resp = post_schema_validate(base, raw)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    _dump_json({"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}, pretty=bool(ctx.obj.get("pretty")))
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
) -> None:
    """POST /schema-pipeline/formatted (reads prior raw JSON from stdin)."""
    raw_text = typer.get_text_stream("stdin").read()
    if not raw_text.strip():
        typer.echo(json.dumps({"ok": False, "error": "stdin_empty"}, separators=(",", ":")))
        raise typer.Exit(code=2)
    raw = json.loads(raw_text)
    if not isinstance(raw, dict):
        typer.echo(json.dumps({"ok": False, "error": "stdin_not_object"}, separators=(",", ":")))
        raise typer.Exit(code=2)

    base = ner_service_url()
    resp = post_schema_formatted(base, raw, skip_ontology_precheck=skip_ontology_precheck)
    body: Any
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {"raw": resp.text}
    _dump_json({"ok": resp.status_code < 400, "status_code": resp.status_code, "body": body}, pretty=bool(ctx.obj.get("pretty")))
    raise typer.Exit(code=0 if resp.status_code < 400 else 2)


@schema_app.command("run")
def schema_run(ctx: typer.Context) -> None:
    """Run raw, validate, then formatted in one shot (same orchestration `gg` uses internally)."""
    base = ner_service_url()
    result = run_schema_pipeline_chain(base)
    _dump_json(result, pretty=bool(ctx.obj.get("pretty")))
    raise typer.Exit(code=0 if bool(result.get("ok")) else 2)


@app.command("repo-root")
def repo_root_cmd() -> None:
    """Print resolved GrooveGraph repository root (useful for tests and tooling)."""
    typer.echo(str(repo_root_from(Path.cwd())))


def entrypoint() -> None:
    app(obj={})
