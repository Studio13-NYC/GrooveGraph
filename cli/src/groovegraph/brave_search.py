from __future__ import annotations

from typing import Any

import httpx

from groovegraph.brave_probe import BRAVE_WEB_SEARCH_URL
from groovegraph.logging_setup import get_logger

log = get_logger("brave_search")


def brave_web_search(*, api_key: str, query: str, count: int = 5, timeout_s: float = 30.0) -> dict[str, Any]:
    """
    Run a Brave Web Search request (quota-consuming).

    Returns a JSON-serialisable summary suitable for `gg search` output.
    """
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": api_key,
    }
    params = {"q": query, "count": str(max(1, min(count, 20)))}
    log.info("Brave web search q=%r count=%s", query, params["count"])
    try:
        with httpx.Client(timeout=timeout_s) as client:
            response = client.get(BRAVE_WEB_SEARCH_URL, headers=headers, params=params)
            body: object
            try:
                body = response.json()
            except Exception:  # noqa: BLE001
                body = {"raw": response.text}

            ok = response.status_code == 200 and isinstance(body, dict) and body.get("type") == "search"
            log.debug("Brave response status=%s ok=%s", response.status_code, ok)
            return {
                "ok": ok,
                "status_code": response.status_code,
                "url": BRAVE_WEB_SEARCH_URL,
                "rate_limited": response.status_code == 429,
                "body": body if isinstance(body, dict) else {"raw": body},
            }
    except Exception as exc:  # noqa: BLE001
        log.exception("Brave web search request failed")
        return {"ok": False, "url": BRAVE_WEB_SEARCH_URL, "error": "request_failed", "detail": str(exc)}
