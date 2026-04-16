from __future__ import annotations

import httpx
import pytest

import groovegraph.schema_pipeline as sp


def test_run_schema_pipeline_chain_uses_formatted_only(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict]] = []

    class FakeClient:
        def __init__(self, **kwargs: object) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, url: str, json: dict | None = None, timeout: float = 120.0) -> httpx.Response:
            calls.append((url, json or {}))
            return httpx.Response(
                200,
                json={"entityTypes": [{"name": "x"}], "knownEntities": [{"label": "y", "canonical": "z"}]},
            )

    monkeypatch.setattr(sp.httpx, "Client", lambda **kwargs: FakeClient())

    out = sp.run_schema_pipeline_chain("http://es.test:8000")

    assert len(calls) == 1
    assert calls[0][0].endswith("/schema-pipeline/formatted")
    assert calls[0][1] == {"assumptions": {"entityTypes": []}, "skipOntologyPrecheck": False}
    assert out["ok"] is True
    assert out["raw"] is None
    assert out["validate"].get("skipped") is True
    assert isinstance(out["formatted"], dict)
