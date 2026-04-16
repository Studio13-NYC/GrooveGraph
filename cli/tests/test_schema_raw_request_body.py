from __future__ import annotations

import httpx
import pytest

import groovegraph.schema_pipeline as sp


def test_post_schema_raw_sends_assumptions_entity_types(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeClient:
        def __init__(self, **kwargs: object) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, url: str, json: dict | None = None, timeout: float = 60.0) -> httpx.Response:
            captured["url"] = url
            captured["json"] = json
            return httpx.Response(200, json={"typeSchemaDefine": "define\n", "assumptions": {"entityTypes": []}})

    monkeypatch.setattr(sp.httpx, "Client", lambda **kwargs: FakeClient())

    sp.post_schema_raw("http://example.test:8000")

    assert captured["json"] == {"assumptions": {"entityTypes": []}}
    assert str(captured["url"]).endswith("/schema-pipeline/raw")
