from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest

import groovegraph.canonical_sources as cs


def test_fetch_canonical_enrichment_wikipedia_happy_path_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISCOGS_TOKEN", raising=False)
    monkeypatch.setenv("DISCOGS_PERSONAL_ACCESS_TOKEN", "")
    monkeypatch.setattr(cs, "discogs_token", lambda: None)

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        if "wikipedia.org" in u and "list=search" in u:
            return httpx.Response(200, json={"query": {"search": [{"title": "Elvis"}]}})
        if "wikipedia.org" in u and "titles=Elvis" in u and "extracts" in u:
            return httpx.Response(
                200,
                json={
                    "query": {
                        "pages": {
                            "1": {
                                "title": "Elvis",
                                "extract": "Rock and roll artist.",
                                "fullurl": "https://en.wikipedia.org/wiki/Elvis",
                            }
                        }
                    }
                },
            )
        if "musicbrainz.org/ws/2/artist/" in u and "query=" in u:
            return httpx.Response(200, json={"artists": []})
        return httpx.Response(404, text=u)

    transport = httpx.MockTransport(handler)
    _RealClient = httpx.Client

    def _client_factory(**kw: object) -> httpx.Client:
        return _RealClient(
            transport=transport,
            timeout=kw.get("timeout", 14.0),  # type: ignore[arg-type]
            follow_redirects=kw.get("follow_redirects", True),  # type: ignore[arg-type]
        )

    monkeypatch.setattr(cs, "httpx", SimpleNamespace(Client=_client_factory))

    out = cs.fetch_canonical_enrichment("Elvis", deep_artist_context=False)
    assert "Rock and roll" in out.wikipedia.text
    assert out.wikipedia.reference_urls
    assert "wikipedia.org/wiki/Elvis" in out.wikipedia.reference_urls[0]
