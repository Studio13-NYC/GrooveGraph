from __future__ import annotations

import json
import os
import subprocess

import pytest

from groovegraph.env_loader import ner_service_url
from groovegraph.paths import repo_root_from
from groovegraph.schema_pipeline import post_schema_raw, run_schema_pipeline_chain

pytestmark = pytest.mark.e2e

REPO_ROOT = repo_root_from()

_ENTITY_SERVICE_SCHEMA_FAILURE = (
    "entity-service must return HTTP 200 for POST /schema-pipeline/raw when TypeDB is enabled. "
    "Set TYPEDB_CONNECTION_STRING and/or TYPEDB_ADDRESSES, TYPEDB_USERNAME, TYPEDB_PASSWORD, "
    "TYPEDB_DATABASE on the **same process** that runs the API (see entity-service "
    "docs/USER_AND_AGENT_GUIDE.md section 7). "
    "Got status={status} body={body!r}"
)


@pytest.mark.entity_service
def test_entity_service_post_schema_pipeline_raw_returns_200() -> None:
    """Contract: `/schema-pipeline/raw` succeeds when the server is configured (no skip on 503)."""
    resp = post_schema_raw(ner_service_url())
    body = resp.json() if resp.content else {}
    assert resp.status_code == 200, _ENTITY_SERVICE_SCHEMA_FAILURE.format(status=resp.status_code, body=body)


@pytest.mark.entity_service
def test_entity_service_schema_pipeline_chain_succeeds() -> None:
    """End-to-end raw → validate → formatted against a running entity-service (fails if server returns 503)."""
    result = run_schema_pipeline_chain(ner_service_url())
    assert result.get("ok") is True, result
    assert isinstance(result.get("formatted"), dict), result
    assert "entityTypes" in result["formatted"]
    assert "knownEntities" in result["formatted"]


@pytest.mark.entity_service
def test_entity_service_gg_schema_validate_pipe_succeeds() -> None:
    """Subprocess `gg schema raw` → stdin → `gg schema validate` (fails if raw is not HTTP 200)."""
    raw_proc = subprocess.run(
        ["uv", "--directory", str(REPO_ROOT / "cli"), "run", "gg", "schema", "raw"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ.copy(),
    )
    outer = json.loads(raw_proc.stdout)
    status = outer.get("status_code")
    assert status == 200, _ENTITY_SERVICE_SCHEMA_FAILURE.format(status=status, body=outer.get("body"))
    assert raw_proc.returncode == 0, outer
    assert outer.get("ok") is True, outer

    validate_proc = subprocess.run(
        ["uv", "--directory", str(REPO_ROOT / "cli"), "run", "gg", "schema", "validate"],
        cwd=str(REPO_ROOT),
        input=json.dumps(outer["body"], separators=(",", ":"), ensure_ascii=False),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ.copy(),
    )
    assert validate_proc.returncode == 0, validate_proc.stderr
    validate_outer = json.loads(validate_proc.stdout)
    assert validate_outer.get("ok") is True, validate_outer
    validate_body = validate_outer["body"]
    assert isinstance(validate_body, dict)
    assert "ready" in validate_body
