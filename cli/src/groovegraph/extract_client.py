from __future__ import annotations

from typing import Any

import httpx

from groovegraph.logging_setup import get_logger

log = get_logger("extract_client")


def post_extract(base_url: str, payload: dict[str, Any], *, timeout_s: float = 120.0) -> httpx.Response:
    """POST /extract on entity-service."""
    url = f"{base_url.rstrip('/')}/extract"
    labels = payload.get("labels")
    opts = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    log.info(
        "POST /extract labels=%r text_len=%s use_model=%s",
        labels,
        len(str(payload.get("text", ""))),
        opts.get("use_model"),
    )
    log.debug("POST /extract payload keys=%s", sorted(payload.keys()))
    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, json=payload)
    log.info("/extract response status=%s", resp.status_code)
    return resp
