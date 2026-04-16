"""Fetch Wikipedia + MusicBrainz + Discogs text for ``POST /extract`` stimulus (API-first, no page scrape)."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from groovegraph.env_loader import discogs_token, groovegraph_http_user_agent, load_repo_dotenv
from groovegraph.logging_setup import get_logger

log = get_logger("canonical_sources")

_MAX_SECTION_CHARS = 24_000
_MB_GAP_S = 1.15


@dataclass
class SourceChunk:
    """One upstream source outcome."""

    source: str
    ok: bool
    text: str = ""
    detail: str | None = None

    def to_wire(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "ok": self.ok,
            "chars": len(self.text),
            "detail": self.detail,
        }


@dataclass
class CanonicalEnrichmentResult:
    """Aggregated canonical fetch for one operator query."""

    needle: str
    wikipedia: SourceChunk
    musicbrainz: SourceChunk
    discogs: SourceChunk

    def to_wire(self) -> dict[str, Any]:
        return {
            "needle": self.needle,
            "wikipedia": self.wikipedia.to_wire(),
            "musicbrainz": self.musicbrainz.to_wire(),
            "discogs": self.discogs.to_wire(),
            "ok_any": self.ok_any,
        }

    @property
    def ok_any(self) -> bool:
        return bool(
            (self.wikipedia.text or "").strip()
            or (self.musicbrainz.text or "").strip()
            or (self.discogs.text or "").strip(),
        )

    def combined_text(self) -> str:
        """Plain text block for stimulus (includes query line)."""
        parts: list[str] = [f"--- Query ---\n{self.needle.strip()}"]
        for label, chunk in (
            ("Wikipedia", self.wikipedia),
            ("MusicBrainz", self.musicbrainz),
            ("Discogs", self.discogs),
        ):
            t = (chunk.text or "").strip()
            if t:
                parts.append(f"--- {label} ---\n{_truncate(t, _MAX_SECTION_CHARS)}")
        if len(parts) == 1:
            return ""
        return "\n\n".join(parts)


def _truncate(s: str, max_chars: int) -> str:
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1].rstrip() + "…"


def _wiki_lang() -> str:
    raw = (os.environ.get("WIKIPEDIA_LANG") or "en").strip().lower()
    return raw if raw.isalnum() and len(raw) <= 10 else "en"


def _fetch_wikipedia(client: httpx.Client, needle: str, lang: str) -> SourceChunk:
    base = f"https://{lang}.wikipedia.org/w/api.php"
    try:
        r = client.get(
            base,
            params={
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": needle,
                "srlimit": 1,
                "srnamespace": 0,
            },
            headers={"User-Agent": groovegraph_http_user_agent()},
        )
        r.raise_for_status()
        data = r.json()
        hits = (((data.get("query") or {}).get("search")) or []) if isinstance(data, dict) else []
        if not hits or not isinstance(hits[0], dict):
            return SourceChunk("wikipedia", True, "", "no_search_hits")
        title = str(hits[0].get("title") or "").strip()
        if not title:
            return SourceChunk("wikipedia", True, "", "empty_title")
        r2 = client.get(
            base,
            params={
                "action": "query",
                "format": "json",
                "prop": "extracts",
                "exintro": "true",
                "explaintext": "true",
                "redirects": "1",
                "titles": title,
            },
            headers={"User-Agent": groovegraph_http_user_agent()},
        )
        r2.raise_for_status()
        data2 = r2.json()
        pages = ((data2.get("query") or {}).get("pages")) or {}
        if not isinstance(pages, dict) or not pages:
            return SourceChunk("wikipedia", True, "", "no_pages")
        first = next(iter(pages.values()))
        if not isinstance(first, dict):
            return SourceChunk("wikipedia", True, "", "bad_page_shape")
        extract = str(first.get("extract") or "").strip()
        if not extract:
            return SourceChunk("wikipedia", True, "", "empty_extract")
        return SourceChunk("wikipedia", True, extract, None)
    except Exception as exc:  # noqa: BLE001
        log.warning("wikipedia fetch failed: %s", exc)
        return SourceChunk("wikipedia", False, "", str(exc))


def _fetch_musicbrainz(client: httpx.Client, needle: str) -> SourceChunk:
    try:
        r = client.get(
            "https://musicbrainz.org/ws/2/artist/",
            params={"query": needle, "fmt": "json", "limit": 3},
            headers={"User-Agent": groovegraph_http_user_agent(), "Accept": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
        artists = data.get("artists") if isinstance(data, dict) else None
        if not isinstance(artists, list) or not artists:
            return SourceChunk("musicbrainz", True, "", "no_artists")
        lines: list[str] = []
        for a in artists[:3]:
            if not isinstance(a, dict):
                continue
            name = str(a.get("name") or "").strip()
            if not name:
                continue
            bits = [name]
            if a.get("disambiguation"):
                bits.append(f"({a.get('disambiguation')})")
            if a.get("country"):
                bits.append(f"country={a.get('country')}")
            if a.get("score") is not None:
                bits.append(f"score={a.get('score')}")
            tags = a.get("tags")
            if isinstance(tags, list) and tags:
                tag_names = [str(t.get("name")) for t in tags[:8] if isinstance(t, dict) and t.get("name")]
                if tag_names:
                    bits.append("tags=" + ", ".join(tag_names))
            lines.append(" · ".join(bits))
        body = "\n".join(lines).strip()
        if not body:
            return SourceChunk("musicbrainz", True, "", "empty_format")
        return SourceChunk("musicbrainz", True, body, None)
    except Exception as exc:  # noqa: BLE001
        log.warning("musicbrainz fetch failed: %s", exc)
        return SourceChunk("musicbrainz", False, "", str(exc))


def _fetch_discogs(client: httpx.Client, needle: str, token: str | None) -> SourceChunk:
    if not token:
        return SourceChunk(
            "discogs",
            True,
            "",
            "missing_DISCOGS_TOKEN (set in repo-root .env; see https://www.discogs.com/developers/)",
        )
    try:
        r = client.get(
            "https://api.discogs.com/database/search",
            params={"q": needle, "type": "artist", "per_page": 3},
            headers={
                "User-Agent": groovegraph_http_user_agent(),
                "Authorization": f"Discogs token={token}",
            },
        )
        r.raise_for_status()
        data = r.json()
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list) or not results:
            return SourceChunk("discogs", True, "", "no_results")
        lines: list[str] = []
        for row in results[:3]:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()
            if not title:
                continue
            extra: list[str] = []
            if row.get("country"):
                extra.append(f"country={row.get('country')}")
            if row.get("year"):
                extra.append(f"year={row.get('year')}")
            if row.get("resource_url"):
                extra.append(str(row.get("resource_url")))
            lines.append(title + (" · " + " · ".join(extra) if extra else ""))
        body = "\n".join(lines).strip()
        if not body:
            return SourceChunk("discogs", True, "", "empty_format")
        return SourceChunk("discogs", True, body, None)
    except Exception as exc:  # noqa: BLE001
        log.warning("discogs fetch failed: %s", exc)
        return SourceChunk("discogs", False, "", str(exc))


def fetch_canonical_enrichment(needle: str, *, timeout_s: float = 14.0) -> CanonicalEnrichmentResult:
    """
    Run Wikipedia → (pause) → MusicBrainz → Discogs sequentially.

    Callers should attach ``combined_text()`` ahead of Brave snippets in the extract stimulus.

    Loads repo-root ``.env`` via ``load_repo_dotenv`` so ``DISCOGS_TOKEN`` and
    ``GROOVEGRAPH_HTTP_USER_AGENT`` are picked up even when this function is invoked outside
    the main ``gg`` Typer entrypoint.
    """
    load_repo_dotenv(Path.cwd())
    n = (needle or "").strip()
    if not n:
        return CanonicalEnrichmentResult(
            needle="",
            wikipedia=SourceChunk("wikipedia", True, "", "empty_needle"),
            musicbrainz=SourceChunk("musicbrainz", True, "", "empty_needle"),
            discogs=SourceChunk("discogs", True, "", "empty_needle"),
        )
    lang = _wiki_lang()
    token = discogs_token()
    with httpx.Client(timeout=timeout_s, follow_redirects=True) as client:
        wp = _fetch_wikipedia(client, n, lang)
        time.sleep(_MB_GAP_S)
        mb = _fetch_musicbrainz(client, n)
        dg = _fetch_discogs(client, n, token)
    log.info(
        "canonical enrichment needle_len=%s wiki_ok=%s mb_ok=%s discogs_ok=%s ok_any=%s",
        len(n),
        bool(wp.text.strip()),
        bool(mb.text.strip()),
        bool(dg.text.strip()),
        bool(
            wp.text.strip() or mb.text.strip() or dg.text.strip(),
        ),
    )
    return CanonicalEnrichmentResult(needle=n, wikipedia=wp, musicbrainz=mb, discogs=dg)
