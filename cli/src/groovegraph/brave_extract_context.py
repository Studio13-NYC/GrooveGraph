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


# Upper bound on web hits embedded into extract text (Brave ``count`` is capped in CLI; this
# guards malformed oversized ``results`` lists).
_MAX_WEB_RESULTS_SAFETY = 64

# Large default: we only embed Brave **SERP** title/description fields (no HTML page fetches).
DEFAULT_EXTRACT_MAX_CHARS = 500_000


def build_augmented_extract_text(
    needle: str,
    web_report: dict[str, Any],
    *,
    context: ContextMode,
    max_chars: int = DEFAULT_EXTRACT_MAX_CHARS,
    max_web_results: int | None = None,
    max_video_results: int = 10,
    prefix_needle: bool = True,
) -> str:
    """
    Build text for ``POST /extract`` from the query plus optional Brave ``web_report``.

    ``minimal`` — query plus first web result title only (legacy behavior).

    ``rich`` — query plus titles and description snippets from Brave **search JSON** (same payload
    as ``brave_web_search``). We do **not** HTTP-fetch result URLs (no full-page read, no
    MusicBrainz/Wikipedia APIs); if those sites appear, it is only as Brave-ranked hits with
    whatever title/description the index returned.

    ``max_web_results`` — when ``None``, include every web hit in ``web_report`` up to
    ``_MAX_WEB_RESULTS_SAFETY``. Pass ``brave_count`` from the caller so the extract blob uses the
    same number of hits as the Brave ``count`` request.

    ``prefix_needle`` — when ``False`` (rich mode only), omit the leading query line so callers can
    prepend Wikipedia / MusicBrainz / Discogs blocks without duplicating the needle.
    """
    base = needle.strip()
    if context == "minimal" or web_report.get("ok") is not True:
        if context == "minimal" and web_report.get("ok") is True:
            title = _first_web_title(web_report)
            if title:
                if prefix_needle:
                    return f"{base}\n\n{title}"
                return f"--- Web excerpts (Brave) ---\n{title}"
        return base

    body = web_report.get("body")
    if not isinstance(body, dict):
        return base

    if prefix_needle:
        chunks: list[str] = [base, "", "--- Web excerpts (Brave) ---", ""]
    else:
        chunks = ["--- Web excerpts (Brave) ---", ""]

    web = body.get("web")
    if isinstance(web, dict):
        results = web.get("results")
        if isinstance(results, list):
            n = len(results)
            if max_web_results is None:
                web_cap = min(n, _MAX_WEB_RESULTS_SAFETY) if n else 0
            else:
                web_cap = min(max(0, max_web_results), n, _MAX_WEB_RESULTS_SAFETY)
            for item in results[:web_cap]:
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
