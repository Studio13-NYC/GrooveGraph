from __future__ import annotations

from typing import Any

import httpx


def _json_body(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _healthish_ok(response: httpx.Response) -> bool:
    if response.status_code != 200:
        return False
    body = _json_body(response)
    if not body:
        return True
    return body.get("ok") is True


def _docs_ok(response: httpx.Response) -> bool:
    if response.status_code != 200:
        return False
    content_type = (response.headers.get("content-type") or "").lower()
    return "text/html" in content_type or "application/json" in content_type


def check_entity_service_liveness(
    base_url: str,
    *,
    timeout_s: float = 10.0,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, object]:
    """
    Prefer ``GET /health``, then ``GET /ready``, then legacy ``GET /docs`` (FastAPI OpenAPI UI).

    Matches entity-service punch list: production may disable ``/docs`` while keeping health routes.
    """
    root = base_url.rstrip("/")
    client_kw: dict[str, Any] = {"timeout": timeout_s, "follow_redirects": True}
    if transport is not None:
        client_kw["transport"] = transport

    probes: list[tuple[str, str, object]] = [
        ("/health", "health", _healthish_ok),
        ("/ready", "ready", _healthish_ok),
        ("/docs", "docs", _docs_ok),
    ]

    last: dict[str, object] = {"ok": False, "url": root, "error": "no_probe_matched"}

    with httpx.Client(**client_kw) as client:
        for path, name, predicate in probes:
            url = f"{root}{path}"
            try:
                response = client.get(url)
            except Exception as exc:  # noqa: BLE001
                last = {
                    "ok": False,
                    "url": url,
                    "probe": name,
                    "error": "request_failed",
                    "detail": str(exc),
                }
                continue

            if predicate(response):
                body = _json_body(response)
                out: dict[str, object] = {
                    "ok": True,
                    "url": url,
                    "probe": name,
                    "status_code": response.status_code,
                    "content_type": response.headers.get("content-type"),
                }
                if body:
                    out["body"] = body
                return out

            last = {
                "ok": False,
                "url": url,
                "probe": name,
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type"),
            }

    failed = dict(last)
    failed["ok"] = False
    failed.setdefault("error", "all_probes_failed")
    return failed
