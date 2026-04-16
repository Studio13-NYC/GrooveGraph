from __future__ import annotations

import pytest

from groovegraph.doctor import run_doctor
from groovegraph.paths import repo_root_from
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params

REPO_ROOT = repo_root_from()


def _typedb_env_configured() -> bool:
    try:
        read_typedb_connection_params()
        return True
    except TypeDbConfigError:
        return False


@pytest.mark.e2e
def test_doctor_hits_real_typedb_and_entity_service() -> None:
    if not _typedb_env_configured():
        pytest.skip("TypeDB env is not fully configured in repo-root `.env`.")

    report = run_doctor(repo_start=REPO_ROOT, probe_brave=False)
    assert report["typedb"]["ok"] is True, report
    assert report["entity_service"]["ok"] is True, report
    assert report["ok"] is True, report


@pytest.mark.e2e
def test_doctor_probe_fails_cleanly_without_brave_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not _typedb_env_configured():
        pytest.skip("TypeDB env is not fully configured in repo-root `.env`.")

    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    monkeypatch.delenv("BraveSearchApiKey", raising=False)
    report = run_doctor(repo_start=REPO_ROOT, probe_brave=True)
    assert report["ok"] is False
    assert report["brave"]["error"] == "missing_api_key"
