from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from groovegraph.paths import repo_root_from

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_repo_root_resolution_matches_expected_groovegraph_root() -> None:
    assert repo_root_from(REPO_ROOT) == REPO_ROOT


@pytest.mark.e2e
def test_gg_repo_root_subprocess_uv_run() -> None:
    proc = subprocess.run(
        ["uv", "--directory", str(REPO_ROOT / "cli"), "run", "gg", "repo-root"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ.copy(),
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == str(REPO_ROOT)


@pytest.mark.e2e
def test_gg_doctor_subprocess_uv_run_json_shape() -> None:
    proc = subprocess.run(
        ["uv", "--directory", str(REPO_ROOT / "cli"), "run", "gg", "doctor"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ.copy(),
    )
    payload = json.loads(proc.stdout)
    assert "typedb" in payload
    assert "entity_service" in payload
    assert "brave" in payload
    assert "dotenv_path" in payload


@pytest.mark.e2e
@pytest.mark.entity_service
def test_gg_schema_run_subprocess_uv_run_json_shape() -> None:
    proc = subprocess.run(
        ["uv", "--directory", str(REPO_ROOT / "cli"), "run", "gg", "schema", "run"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ.copy(),
    )
    payload = json.loads(proc.stdout)
    assert "ok" in payload
    if payload.get("ok") is not True and payload.get("error") == "typedb_not_configured_on_entity_service":
        pytest.skip(
            "blocked: entity-service schema pipeline is not TypeDB-enabled on the server process. "
            "Tags: upstream blocked, typedb_not_configured_on_entity_service. "
            "See docs/ENTITY_SERVICE_PUNCH_LIST.md, then re-run entity_service tests."
        )
    assert proc.returncode == 0, (proc.returncode, proc.stdout, proc.stderr)
    assert payload.get("ok") is True, payload
