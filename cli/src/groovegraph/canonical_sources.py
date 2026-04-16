"""Fetch Wikipedia + MusicBrainz + Discogs text for ``POST /extract`` stimulus (API-first, no page scrape)."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from groovegraph.env_loader import (
    discogs_token,
    groovegraph_canonical_deep_artist_enabled,
    groovegraph_http_user_agent,
    groovegraph_mb_deep_recording_cap,
    groovegraph_mb_deep_release_cap,
    groovegraph_wikipedia_section_max_chars,
    load_repo_dotenv,
)
from groovegraph.logging_setup import get_logger

log = get_logger("canonical_sources")

_MB_GAP_S = 1.15


@dataclass
class SourceChunk:
    """One upstream source outcome."""

    source: str
    ok: bool
    text: str = ""
    detail: str | None = None
    reference_urls: tuple[str, ...] = field(default_factory=tuple)

    def to_wire(self) -> dict[str, Any]:
        w: dict[str, Any] = {
            "source": self.source,
            "ok": self.ok,
            "chars": len(self.text),
            "detail": self.detail,
        }
        if self.reference_urls:
            w["reference_urls"] = list(self.reference_urls)
        return w


@dataclass
class CanonicalEnrichmentResult:
    """Aggregated canonical fetch for one operator query."""

    needle: str
    wikipedia: SourceChunk
    musicbrainz: SourceChunk
    discogs: SourceChunk
    max_section_chars: int = 24_000

    def to_wire(self) -> dict[str, Any]:
        return {
            "needle": self.needle,
            "wikipedia": self.wikipedia.to_wire(),
            "musicbrainz": self.musicbrainz.to_wire(),
            "discogs": self.discogs.to_wire(),
            "ok_any": self.ok_any,
            "max_section_chars": self.max_section_chars,
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
                parts.append(f"--- {label} ---\n{_truncate(t, self.max_section_chars)}")
        if len(parts) == 1:
            return ""
        return "\n\n".join(parts)


def _truncate(s: str, max_chars: int) -> str:
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1].rstrip() + "…"


def _musicbrainz_release_recording_titles(data: object, cap: int) -> list[str]:
    """Parse MusicBrainz ``release?inc=recordings`` JSON for display titles (defensive to schema variants)."""
    if not isinstance(data, dict) or cap <= 0:
        return []
    out: list[str] = []
    top_recs = data.get("recordings")
    if isinstance(top_recs, list):
        for rec in top_recs:
            if len(out) >= cap:
                break
            if isinstance(rec, dict):
                t = str(rec.get("title") or "").strip()
                if t:
                    out.append(t)
        return out
    media = data.get("media")
    if isinstance(media, list):
        for medium in media:
            if not isinstance(medium, dict):
                continue
            for key in ("tracks", "track-list"):
                tracks = medium.get(key)
                if not isinstance(tracks, list):
                    continue
                for tr in tracks:
                    if len(out) >= cap:
                        return out
                    if not isinstance(tr, dict):
                        continue
                    rec = tr.get("recording")
                    if isinstance(rec, dict):
                        t = str(rec.get("title") or "").strip()
                        if t:
                            out.append(t)
                            continue
                    t2 = str(tr.get("title") or "").strip()
                    if t2:
                        out.append(t2)
    return out


def _wiki_lang() -> str:
    raw = (os.environ.get("WIKIPEDIA_LANG") or "en").strip().lower()
    return raw if raw.isalnum() and len(raw) <= 10 else "en"


def _fetch_wikipedia(client: httpx.Client, needle: str, lang: str, *, max_section_chars: int) -> SourceChunk:
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
                "prop": "extracts|info",
                "exintro": "true",
                "explaintext": "true",
                "redirects": "1",
                "inprop": "url",
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
        ref_urls: tuple[str, ...] = ()
        fullurl = str(first.get("fullurl") or "").strip()
        if fullurl.startswith(("http://", "https://")):
            ref_urls = (fullurl,)
        if not extract:
            return SourceChunk("wikipedia", True, "", "empty_extract", reference_urls=ref_urls)
        return SourceChunk(
            "wikipedia",
            True,
            _truncate(extract, max_section_chars),
            None,
            reference_urls=ref_urls,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("wikipedia fetch failed: %s", exc)
        return SourceChunk("wikipedia", False, "", str(exc))


def _fetch_musicbrainz(
    client: httpx.Client,
    needle: str,
    *,
    deep_artist_context: bool,
    mb_deep_release_cap: int,
    mb_deep_recording_cap: int,
    max_section_chars: int,
) -> SourceChunk:
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
        top: dict[str, Any] | None = None
        for a in artists[:3]:
            if not isinstance(a, dict):
                continue
            if top is None:
                top = a
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
        ref_urls: tuple[str, ...] = ()
        if top and isinstance(top.get("id"), str) and top["id"].strip():
            aid = top["id"].strip()
            ref_urls = (f"https://musicbrainz.org/artist/{aid}",)
        if deep_artist_context and top and isinstance(top.get("id"), str) and mb_deep_release_cap > 0:
            aid = str(top["id"]).strip()
            time.sleep(_MB_GAP_S)
            r2 = client.get(
                f"https://musicbrainz.org/ws/2/artist/{aid}",
                params={"fmt": "json", "inc": "releases"},
                headers={"User-Agent": groovegraph_http_user_agent(), "Accept": "application/json"},
            )
            r2.raise_for_status()
            dj = r2.json()
            rels = dj.get("releases") if isinstance(dj, dict) else None
            rel_lines: list[str] = []
            first_release_id: str | None = None
            if isinstance(rels, list):
                for rel in rels:
                    if first_release_id is None and isinstance(rel, dict) and rel.get("id"):
                        first_release_id = str(rel["id"]).strip()
                        break
                for rel in rels[: max(mb_deep_release_cap, 0)]:
                    if not isinstance(rel, dict):
                        continue
                    t = str(rel.get("title") or "").strip()
                    if not t:
                        continue
                    status = rel.get("status")
                    date = rel.get("date")
                    bits2 = [t]
                    if status:
                        bits2.append(f"status={status}")
                    if date:
                        bits2.append(f"date={date}")
                    rel_lines.append(" · ".join(bits2))
            if rel_lines:
                body = (
                    body
                    + "\n\n--- MusicBrainz releases (sample; rate-limited) ---\n"
                    + "\n".join(rel_lines)
                )
            if (
                deep_artist_context
                and first_release_id
                and mb_deep_recording_cap > 0
            ):
                time.sleep(_MB_GAP_S)
                try:
                    r3 = client.get(
                        f"https://musicbrainz.org/ws/2/release/{first_release_id}",
                        params={"fmt": "json", "inc": "recordings"},
                        headers={"User-Agent": groovegraph_http_user_agent(), "Accept": "application/json"},
                    )
                    r3.raise_for_status()
                    rec_titles = _musicbrainz_release_recording_titles(r3.json(), mb_deep_recording_cap)
                except Exception as exc:  # noqa: BLE001
                    log.info("musicbrainz release recording fetch skipped: %s", exc)
                    rec_titles = []
                if rec_titles:
                    body = body + "\n\n--- MusicBrainz recordings (sample; rate-limited) ---\n" + "\n".join(
                        rec_titles,
                    )
        return SourceChunk(
            "musicbrainz",
            True,
            _truncate(body, max_section_chars * 2),
            None,
            reference_urls=ref_urls,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("musicbrainz fetch failed: %s", exc)
        return SourceChunk("musicbrainz", False, "", str(exc))


def _fetch_discogs(
    client: httpx.Client,
    needle: str,
    token: str | None,
    *,
    deep_artist_context: bool,
    max_section_chars: int,
) -> SourceChunk:
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
        first_resource: str | None = None
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
                ru = str(row.get("resource_url"))
                extra.append(ru)
                if first_resource is None and ru.startswith("http"):
                    first_resource = ru
            lines.append(title + (" · " + " · ".join(extra) if extra else ""))
        body = "\n".join(lines).strip()
        if not body:
            return SourceChunk("discogs", True, "", "empty_format")
        ref_urls: tuple[str, ...] = (first_resource,) if first_resource else ()
        if deep_artist_context and first_resource and token:
            time.sleep(1.0)
            r2 = client.get(
                first_resource,
                headers={
                    "User-Agent": groovegraph_http_user_agent(),
                    "Authorization": f"Discogs token={token}",
                },
            )
            r2.raise_for_status()
            dj = r2.json()
            prof = str((dj.get("profile") if isinstance(dj, dict) else "") or "").strip()
            if prof:
                body = body + "\n\n--- Discogs artist profile (truncated) ---\n" + _truncate(prof, max_section_chars)
        return SourceChunk(
            "discogs",
            True,
            _truncate(body, max_section_chars * 2),
            None,
            reference_urls=ref_urls,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("discogs fetch failed: %s", exc)
        return SourceChunk("discogs", False, "", str(exc))


def fetch_canonical_enrichment(
    needle: str,
    *,
    timeout_s: float = 14.0,
    deep_artist_context: bool | None = None,
    max_section_chars: int | None = None,
    mb_deep_release_cap: int | None = None,
    mb_deep_recording_cap: int | None = None,
) -> CanonicalEnrichmentResult:
    """
    Run Wikipedia → (pause) → MusicBrainz → Discogs sequentially.

    Callers should attach ``combined_text()`` ahead of Brave snippets in the extract stimulus.

    Loads repo-root ``.env`` via ``load_repo_dotenv`` so ``DISCOGS_TOKEN`` and
    ``GROOVEGRAPH_HTTP_USER_AGENT`` are picked up even when this function is invoked outside
    the main ``gg`` Typer entrypoint.

    Optional **deep** artist context (env ``GROOVEGRAPH_CANONICAL_DEEP_ARTIST`` or the
    ``deep_artist_context`` argument) adds bounded MusicBrainz release lines, optional recording
    titles from the first matched release, and a truncated Discogs artist ``profile`` after a match.
    """
    load_repo_dotenv(Path.cwd())
    n = (needle or "").strip()
    sec = groovegraph_wikipedia_section_max_chars() if max_section_chars is None else max_section_chars
    deep = groovegraph_canonical_deep_artist_enabled() if deep_artist_context is None else deep_artist_context
    mb_cap = groovegraph_mb_deep_release_cap() if mb_deep_release_cap is None else mb_deep_release_cap
    mb_rec = groovegraph_mb_deep_recording_cap() if mb_deep_recording_cap is None else mb_deep_recording_cap
    if not n:
        return CanonicalEnrichmentResult(
            needle="",
            wikipedia=SourceChunk("wikipedia", True, "", "empty_needle"),
            musicbrainz=SourceChunk("musicbrainz", True, "", "empty_needle"),
            discogs=SourceChunk("discogs", True, "", "empty_needle"),
            max_section_chars=sec,
        )
    lang = _wiki_lang()
    token = discogs_token()
    with httpx.Client(timeout=timeout_s, follow_redirects=True) as client:
        wp = _fetch_wikipedia(client, n, lang, max_section_chars=sec)
        time.sleep(_MB_GAP_S)
        mb = _fetch_musicbrainz(
            client,
            n,
            deep_artist_context=deep,
            mb_deep_release_cap=mb_cap,
            mb_deep_recording_cap=mb_rec,
            max_section_chars=sec,
        )
        dg = _fetch_discogs(client, n, token, deep_artist_context=deep, max_section_chars=sec)
    log.info(
        "canonical enrichment needle_len=%s wiki_ok=%s mb_ok=%s discogs_ok=%s ok_any=%s deep=%s",
        len(n),
        bool(wp.text.strip()),
        bool(mb.text.strip()),
        bool(dg.text.strip()),
        bool(
            wp.text.strip() or mb.text.strip() or dg.text.strip(),
        ),
        deep,
    )
    return CanonicalEnrichmentResult(
        needle=n,
        wikipedia=wp,
        musicbrainz=mb,
        discogs=dg,
        max_section_chars=sec,
    )
