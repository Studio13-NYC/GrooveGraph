from __future__ import annotations

import httpx


def check_entity_service_docs(base_url: str, *, timeout_s: float = 10.0) -> dict[str, object]:
    """GET `/docs` (FastAPI OpenAPI UI) as a live connectivity check for entity-service."""
    url = f"{base_url.rstrip('/')}/docs"
    try:
        with httpx.Client(timeout=timeout_s, follow_redirects=True) as client:
            response = client.get(url)
            content_type = (response.headers.get("content-type") or "").lower()
            ok = response.status_code == 200 and (
                "text/html" in content_type or "application/json" in content_type
            )
            return {
                "ok": ok,
                "url": url,
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type"),
            }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "url": url, "error": "request_failed", "detail": str(exc)}
