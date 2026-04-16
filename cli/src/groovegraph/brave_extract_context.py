from __future__ import annotations

import re
from typing import Any, Literal

ContextMode = Literal["minimal", "rich"]


def strip_html_basic(fragment: str) -> str:
    """Remove simple HTML tags for safer plain-text NER input."""
    if not fragment:
        return ""
    no_tags = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", no_tags).strip()


def build_augmented_extract_text(
    needle: str,
    web_report: dict[str, Any],
    *,
    context: ContextMode,
    max_chars: int = 12_000,
    max_web_results: int = 8,
    max_video_results: int = 4,
) -> str:
    """
    Build text for ``POST /extract`` from the query plus optional Brave ``web_report``.

    ``minimal`` — query plus first web result title only (legacy behavior).

    ``rich`` — query plus titles and description snippets from top web (and some video) results.
    """
    base = needle.strip()
    if context == "minimal" or web_report.get("ok") is not True:
        if context == "minimal" and web_report.get("ok") is True:
            title = _first_web_title(web_report)
            if title:
                return f"{base}\n\n{title}"
        return base

    body = web_report.get("body")
    if not isinstance(body, dict):
        return base

    chunks: list[str] = [base, "", "--- Web excerpts ---", ""]

    web = body.get("web")
    if isinstance(web, dict):
        results = web.get("results")
        if isinstance(results, list):
            for item in results[:max_web_results]:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()
                desc = strip_html_basic(str(item.get("description") or ""))
                if not title and not desc:
                    continue
                block = title
                if desc:
                    block = f"{title}\n{desc}" if title else desc
                chunks.append(block)
                chunks.append("")

    videos = body.get("videos")
    if isinstance(videos, dict):
        vres = videos.get("results")
        if isinstance(vres, list):
            chunks.append("--- Video titles ---")
            chunks.append("")
            for item in vres[:max_video_results]:
                if not isinstance(item, dict):
                    continue
                t = str(item.get("title") or "").strip()
                if t:
                    chunks.append(t)
                    chunks.append("")

    joined = "\n".join(c for c in chunks if c is not None).strip()
    if len(joined) <= max_chars:
        return joined
    return joined[: max_chars - 1].rstrip() + "…"


def _first_web_title(web_report: dict[str, Any]) -> str | None:
    body = web_report.get("body")
    if not isinstance(body, dict):
        return None
    web = body.get("web")
    if not isinstance(web, dict):
        return None
    results = web.get("results")
    if not isinstance(results, list) or not results:
        return None
    first = results[0]
    if not isinstance(first, dict):
        return None
    title = first.get("title")
    return str(title).strip() if title else None
