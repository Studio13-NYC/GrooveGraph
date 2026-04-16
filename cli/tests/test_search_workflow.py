from __future__ import annotations

import contextlib
from typing import Any

import httpx
import pytest

from groovegraph.canonical_sources import CanonicalEnrichmentResult, SourceChunk
from groovegraph.catalog_types import parse_kind_list
from groovegraph.typedb_config import TypeDbConnectionParams


@pytest.fixture(autouse=True)
def _stub_canonical_sources_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid live Wikipedia/MB/Discogs during search_workflow tests."""

    import groovegraph.search_workflow as sw_mod

    def _stub(needle: str, *, timeout_s: float = 14.0) -> CanonicalEnrichmentResult:
        n = (needle or "").strip()
        return CanonicalEnrichmentResult(
            needle=n,
            wikipedia=SourceChunk("wikipedia", True, "", "test_stub"),
            musicbrainz=SourceChunk("musicbrainz", True, "", "test_stub"),
            discogs=SourceChunk("discogs", True, "", "test_stub"),
        )

    monkeypatch.setattr(sw_mod, "fetch_canonical_enrichment", _stub)


def test_run_gg_search_extract_passes_rich_web_text_to_extract(monkeypatch: pytest.MonkeyPatch) -> None:
    """``--extract`` must send Brave titles/snippets as one ``text`` blob (POST /extract), not query + first title only."""
    import groovegraph.search_workflow as sw

    params = TypeDbConnectionParams(
        address="https://example.invalid:443",
        username="u",
        password="p",
        database="db",
    )

    class _FakeDatabases:
        def contains(self, _name: str) -> bool:
            return True

        def all(self) -> list[Any]:
            return []

    class _FakeDriver:
        databases = _FakeDatabases()

    @contextlib.contextmanager
    def _fake_open(_params: TypeDbConnectionParams):
        yield _FakeDriver()

    monkeypatch.setattr(sw, "read_typedb_connection_params", lambda: params)
    monkeypatch.setattr(sw, "open_typedb_driver", _fake_open)
    monkeypatch.setattr(sw, "search_catalog_in_typedb", lambda **kwargs: [])
    monkeypatch.setattr(sw, "brave_api_key", lambda: "fake-key")
    monkeypatch.setattr(
        sw,
        "brave_web_search",
        lambda **kwargs: {
            "ok": True,
            "body": {
                "web": {
                    "results": [
                        {"title": "Nick Lowe — bio", "description": "<b>English</b> singer-songwriter."},
                        {"title": "Second hit", "description": "More context here."},
                    ]
                }
            },
        },
    )
    monkeypatch.setattr(
        sw,
        "run_schema_pipeline_chain",
        lambda _base: {"ok": True, "formatted": {"entityTypes": [], "knownEntities": []}},
    )

    captured: dict[str, Any] = {}

    def _fake_post_extract(_base_url: str, payload: dict[str, Any], *, timeout_s: float = 120.0) -> httpx.Response:
        captured["text"] = payload["text"]
        captured["options"] = payload.get("options")
        return httpx.Response(200, json={"entities": []})

    monkeypatch.setattr(sw, "post_extract", _fake_post_extract)

    kinds = parse_kind_list(None, default_all=True)
    out = sw.run_gg_search(
        needle="Nick Lowe",
        kinds=kinds,
        include_web=True,
        brave_count=5,
        include_extract=True,
        require_successful_web_for_extract=False,
    )

    assert out.get("ok") is True
    text = captured["text"]
    assert "Nick Lowe" in text
    assert "--- Web excerpts (Brave) ---" in text
    assert "English" in text or "singer-songwriter" in text
    opts = captured.get("options") or {}
    assert opts.get("useGgGenericForUnknownCatalogLabels") is True


def test_run_gg_search_require_web_skips_extract_when_brave_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    import groovegraph.search_workflow as sw

    params = TypeDbConnectionParams(
        address="https://example.invalid:443",
        username="u",
        password="p",
        database="db",
    )

    class _FakeDatabases:
        def contains(self, _name: str) -> bool:
            return True

        def all(self) -> list[Any]:
            return []

    class _FakeDriver:
        databases = _FakeDatabases()

    @contextlib.contextmanager
    def _fake_open(_params: TypeDbConnectionParams):
        yield _FakeDriver()

    monkeypatch.setattr(sw, "read_typedb_connection_params", lambda: params)
    monkeypatch.setattr(sw, "open_typedb_driver", _fake_open)
    monkeypatch.setattr(sw, "search_catalog_in_typedb", lambda **kwargs: [])
    monkeypatch.setattr(sw, "brave_api_key", lambda: "fake-key")
    monkeypatch.setattr(sw, "brave_web_search", lambda **kwargs: {"ok": False, "error": "rate_limited"})
    called: list[str] = []

    def _no_schema(_base: str) -> dict[str, Any]:
        called.append("schema")
        return {"ok": True}

    monkeypatch.setattr(sw, "run_schema_pipeline_chain", _no_schema)

    kinds = parse_kind_list(None, default_all=True)
    out = sw.run_gg_search(
        needle="x",
        kinds=kinds,
        include_web=True,
        brave_count=5,
        include_extract=True,
        require_successful_web_for_extract=True,
    )

    assert out.get("ok") is False
    assert out.get("extract", {}).get("error") == "insufficient_context"
    assert called == []
