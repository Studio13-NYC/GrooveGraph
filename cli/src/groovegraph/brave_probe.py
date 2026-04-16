from __future__ import annotations

import httpx

BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


def probe_brave_search(api_key: str, *, timeout_s: float = 20.0) -> dict[str, object]:
    """One real Brave Search request (quota-consuming). Used by `gg doctor` when a key is set."""
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": api_key,
    }
    params = {"q": "GrooveGraph connectivity probe", "count": 1}
    try:
        with httpx.Client(timeout=timeout_s) as client:
            response = client.get(BRAVE_WEB_SEARCH_URL, headers=headers, params=params)
            body: object
            try:
                body = response.json()
            except Exception:  # noqa: BLE001
                body = {"raw": response.text}
            if response.status_code == 200:
                ok = isinstance(body, dict) and body.get("type") == "search"
            elif response.status_code == 429:
                # Key reached the API; quota / burst limit (common when several probes run back-to-back).
                ok = True
            else:
                ok = False
            return {
                "ok": ok,
                "status_code": response.status_code,
                "url": BRAVE_WEB_SEARCH_URL,
                "body_type": body.get("type") if isinstance(body, dict) else None,
                "rate_limited": response.status_code == 429,
            }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "url": BRAVE_WEB_SEARCH_URL, "error": "request_failed", "detail": str(exc)}
