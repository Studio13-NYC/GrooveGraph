from __future__ import annotations

from pathlib import Path

import pytest

from groovegraph.doctor import run_doctor


def test_doctor_fails_when_required_entity_type_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES", "gg-generic")
    monkeypatch.setattr(
        "groovegraph.doctor.verify_typedb",
        lambda _p: {"ok": True, "types": ["mo-music-artist"], "database": "db", "address": "x"},
    )
    monkeypatch.setattr(
        "groovegraph.doctor.check_entity_service_liveness",
        lambda _url: {"ok": True, "probe": "health"},
    )
    monkeypatch.setattr(
        "groovegraph.doctor.probe_db_backed_formatted_schema",
        lambda *a, **k: {"ok": True, "status_code": 200, "dual_typedb_env_suspected": False},
    )
    monkeypatch.setattr("groovegraph.doctor.brave_api_key", lambda: None)
    report = run_doctor(repo_start=Path.cwd(), probe_brave=False)
    assert report["typedb"]["required_entity_types_missing"] == ["gg-generic"]
    assert report["ok"] is False


def test_doctor_fails_on_dual_typedb_suspicion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES", raising=False)
    monkeypatch.setattr(
        "groovegraph.doctor.verify_typedb",
        lambda _p: {"ok": True, "types": ["mo-music-artist", "gg-generic"], "database": "db"},
    )
    monkeypatch.setattr(
        "groovegraph.doctor.check_entity_service_liveness",
        lambda _url: {"ok": True, "probe": "health"},
    )
    monkeypatch.setattr(
        "groovegraph.doctor.probe_db_backed_formatted_schema",
        lambda *a, **k: {
            "ok": False,
            "status_code": 200,
            "entity_types_count": 0,
            "known_entities_count": 0,
            "dual_typedb_env_suspected": True,
            "note": "test",
        },
    )
    monkeypatch.setattr("groovegraph.doctor.brave_api_key", lambda: None)
    report = run_doctor(repo_start=Path.cwd(), probe_brave=False)
    assert report["entity_service_schema"]["dual_typedb_env_suspected"] is True
    assert report["ok"] is False


def test_doctor_schema_probe_skipped_when_entity_service_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES", "")
    monkeypatch.setattr(
        "groovegraph.doctor.verify_typedb",
        lambda _p: {"ok": True, "types": [], "database": "db"},
    )
    monkeypatch.setattr(
        "groovegraph.doctor.check_entity_service_liveness",
        lambda _url: {"ok": False, "error": "all_probes_failed"},
    )
    monkeypatch.setattr("groovegraph.doctor.brave_api_key", lambda: None)
    report = run_doctor(repo_start=Path.cwd(), probe_brave=False)
    assert report["entity_service_schema"]["skipped"] is True
    assert report["ok"] is False
