from __future__ import annotations

import httpx
import pytest

import groovegraph.analyze_workflow as aw
from groovegraph.canonical_sources import CanonicalEnrichmentResult, SourceChunk


@pytest.fixture(autouse=True)
def _stub_canonical_sources_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def _stub(needle: str, *, timeout_s: float = 14.0) -> CanonicalEnrichmentResult:
        n = (needle or "").strip()
        return CanonicalEnrichmentResult(
            needle=n,
            wikipedia=SourceChunk("wikipedia", True, "", "test_stub"),
            musicbrainz=SourceChunk("musicbrainz", True, "", "test_stub"),
            discogs=SourceChunk("discogs", True, "", "test_stub"),
        )

    monkeypatch.setattr(aw, "fetch_canonical_enrichment", _stub)


def test_analyze_default_no_typedb_no_schema_empty_labels(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_post_extract(base_url: str, payload: dict, *, timeout_s: float = 120.0) -> httpx.Response:
        captured["base"] = base_url
        captured["payload"] = payload
        return httpx.Response(200, json={"entities": [{"label": "person", "text": "x", "start": 0, "end": 1, "confidence": 0.9}]})

    monkeypatch.setattr(aw, "post_extract", fake_post_extract)

    out = aw.run_analyze_query(
        needle="hello world",
        include_typedb=False,
        kinds=[],
        include_web=False,
        brave_count=5,
        include_schema=False,
    )

    assert out["ok"] is True
    assert out["typedb"] is not None
    assert out["typedb"].get("skipped") is True
    assert captured["payload"]["labels"] == []
    assert "schema" not in captured["payload"]
    assert captured["payload"]["text"] == "hello world"
    assert out["extract"]["ok"] is True
    assert out["extract"]["body"]["entities"]
    assert out["stimulus"]["context"] == "none"
    assert out["stimulus"]["use_model"] is False


def test_analyze_use_model_forwards_to_extract(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_post_extract(base_url: str, payload: dict, *, timeout_s: float = 120.0) -> httpx.Response:
        captured["payload"] = payload
        return httpx.Response(200, json={"entities": []})

    monkeypatch.setattr(aw, "post_extract", fake_post_extract)

    aw.run_analyze_query(
        needle="x",
        include_typedb=False,
        kinds=[],
        include_web=False,
        brave_count=5,
        include_schema=False,
        use_model=True,
    )
    assert captured["payload"]["options"]["use_model"] is True


def test_analyze_appends_first_web_title(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_post_extract(base_url: str, payload: dict, *, timeout_s: float = 120.0) -> httpx.Response:
        captured["payload"] = payload
        return httpx.Response(200, json={"entities": []})

    monkeypatch.setattr(aw, "post_extract", fake_post_extract)
    monkeypatch.setattr(aw, "brave_api_key", lambda: "k")
    monkeypatch.setattr(
        aw,
        "brave_web_search",
        lambda **kw: {
            "ok": True,
            "body": {"web": {"results": [{"title": "Result Title"}]}},
        },
    )

    out = aw.run_analyze_query(
        needle="query",
        include_typedb=False,
        kinds=[],
        include_web=True,
        brave_count=5,
        include_schema=False,
    )

    assert out["ok"] is True
    assert "query" in captured["payload"]["text"]
    assert "Result Title" in captured["payload"]["text"]


def test_analyze_schema_path_calls_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_post_extract(base_url: str, payload: dict, *, timeout_s: float = 120.0) -> httpx.Response:
        captured["payload"] = payload
        return httpx.Response(200, json={"entities": []})

    monkeypatch.setattr(aw, "post_extract", fake_post_extract)
    monkeypatch.setattr(
        aw,
        "run_schema_pipeline_chain",
        lambda base: {"ok": True, "formatted": {"entityTypes": [], "knownEntities": []}},
    )

    out = aw.run_analyze_query(
        needle="x",
        include_typedb=False,
        kinds=[],
        include_web=False,
        brave_count=5,
        include_schema=True,
    )

    assert out["ok"] is True
    assert "schema" in captured["payload"]
    assert captured["payload"]["labels"] == []
