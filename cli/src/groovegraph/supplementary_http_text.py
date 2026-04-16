"""Optional HTTP GET + main-text extraction for ranked URLs (Brave / canonical pointers)."""

from __future__ import annotations

from typing import Any, Sequence
from urllib.parse import urlparse

import httpx
import trafilatura

from groovegraph.brave_extract_context import iter_brave_web_result_urls
from groovegraph.canonical_sources import CanonicalEnrichmentResult
from groovegraph.env_loader import groovegraph_http_user_agent
from groovegraph.logging_setup import get_logger

log = get_logger("supplementary_http_text")

_DEFAULT_PER_URL_TIMEOUT_S = 18.0
_DEFAULT_PER_URL_MAX_BYTES = 1_500_000


def _allowed_http_url(url: str) -> bool:
    try:
        p = urlparse(url.strip())
    except Exception:  # noqa: BLE001
        return False
    return p.scheme in {"http", "https"} and bool(p.netloc)


def collect_supplementary_candidate_urls(
    *,
    web_report: dict[str, Any] | None,
    canonical: CanonicalEnrichmentResult | None,
    max_urls: int,
) -> list[str]:
    """Merge Brave result URLs with canonical ``reference_urls``; dedupe; preserve order."""
    if max_urls <= 0:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for url in iter_brave_web_result_urls(web_report, limit=max_urls * 3):
        if not _allowed_http_url(url) or url in seen:
            continue
        seen.add(url)
        out.append(url)
        if len(out) >= max_urls:
            return out
    if canonical is not None:
        for chunk in (canonical.wikipedia, canonical.musicbrainz, canonical.discogs):
            for u in getattr(chunk, "reference_urls", ()):
                if not isinstance(u, str) or not _allowed_http_url(u) or u in seen:
                    continue
                seen.add(u)
                out.append(u)
                if len(out) >= max_urls:
                    return out
    return out


def fetch_supplementary_page_blocks(
    urls: Sequence[str],
    *,
    client: httpx.Client,
    per_url_timeout_s: float = _DEFAULT_PER_URL_TIMEOUT_S,
    per_url_max_bytes: int = _DEFAULT_PER_URL_MAX_BYTES,
    total_max_chars: int,
) -> tuple[str, list[dict[str, Any]]]:
    """
    GET each URL, extract readable main text with trafilatura, return one markdown-ish section + wire meta.

    Returns ``(combined_text, per_url_reports)``. Empty string when nothing usable was extracted.
    """
    reports: list[dict[str, Any]] = []
    blocks: list[str] = []
    budget = max(0, total_max_chars)
    ua = groovegraph_http_user_agent()
    for url in urls:
        if budget <= 0:
            break
        detail: dict[str, Any] = {"url": url, "ok": False}
        try:
            with client.stream(
                "GET",
                url,
                headers={"User-Agent": ua, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"},
                timeout=per_url_timeout_s,
                follow_redirects=True,
            ) as resp:
                resp.raise_for_status()
                chunks: list[bytes] = []
                total = 0
                for raw in resp.iter_bytes():
                    if not raw:
                        continue
                    chunks.append(raw)
                    total += len(raw)
                    if total >= per_url_max_bytes:
                        break
                raw_html = b"".join(chunks)
        except Exception as exc:  # noqa: BLE001
            log.info("supplementary fetch failed url=%s err=%s", url, exc)
            detail["detail"] = str(exc)
            reports.append(detail)
            continue
        try:
            text = trafilatura.extract(
                raw_html.decode("utf-8", errors="replace"),
                url=url,
                include_comments=False,
                include_tables=False,
            )
        except Exception as exc:  # noqa: BLE001
            log.info("trafilatura extract failed url=%s err=%s", url, exc)
            detail["detail"] = str(exc)
            reports.append(detail)
            continue
        cleaned = (text or "").strip()
        if not cleaned:
            detail["detail"] = "empty_extract"
            reports.append(detail)
            continue
        take = cleaned[:budget]
        blocks.append(f"URL: {url}\n{take}")
        budget -= len(take)
        detail["ok"] = True
        detail["chars"] = len(take)
        reports.append(detail)

    if not blocks:
        return "", reports
    body = "\n\n---\n\n".join(blocks)
    header = "--- Supplementary HTTP (readability-style extraction) ---\n\n"
    combined = header + body
    if len(combined) > total_max_chars:
        combined = combined[: total_max_chars - 1].rstrip() + "…"
    return combined, reports
