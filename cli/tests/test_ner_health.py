from __future__ import annotations

import httpx

from groovegraph.ner_health import check_entity_service_liveness


def test_liveness_prefers_health() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    r = check_entity_service_liveness("http://es.example", transport=transport)
    assert r["ok"] is True
    assert r["probe"] == "health"


def test_liveness_falls_back_to_docs_when_health_missing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(404)
        if request.url.path == "/ready":
            return httpx.Response(404)
        if request.url.path == "/docs":
            return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text="<html/>")
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    r = check_entity_service_liveness("http://es.example", transport=transport)
    assert r["ok"] is True
    assert r["probe"] == "docs"


def test_liveness_uses_ready_when_health_not_ok_but_ready_ok() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"ok": False})
        if request.url.path == "/ready":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    r = check_entity_service_liveness("http://es.example", transport=transport)
    assert r["ok"] is True
    assert r["probe"] == "ready"


def test_liveness_all_failed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    r = check_entity_service_liveness("http://es.example", transport=transport)
    assert r["ok"] is False
    assert r.get("error") == "all_probes_failed"
