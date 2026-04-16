from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from groovegraph.paths import repo_root_from


def load_repo_dotenv(start: Path | None = None) -> Path:
    """Load repo-root `.env` into the process (default for all `gg` commands)."""
    root = repo_root_from(start)
    dotenv_path = root / ".env"
    load_dotenv(dotenv_path, override=False)
    return dotenv_path


def ner_service_url() -> str:
    return os.environ.get("NER_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")


def openai_api_key() -> str | None:
    """Return OpenAI API key when set (used by future LLM tooling; never log the raw value)."""
    raw = os.environ.get("OPENAI_API_KEY")
    if raw is None:
        return None
    stripped = raw.strip()
    return stripped or None


# Sent to Wikipedia, MusicBrainz, and Discogs API requests (Discogs requires a unique UA; see their docs).
_DEFAULT_HTTP_USER_AGENT = "GrooveGraph/2.0 (+https://github.com/) python-httpx"


def groovegraph_http_user_agent() -> str:
    """Return ``GROOVEGRAPH_HTTP_USER_AGENT`` from env or a conservative default."""
    raw = os.environ.get("GROOVEGRAPH_HTTP_USER_AGENT") or ""
    stripped = raw.strip()
    return stripped or _DEFAULT_HTTP_USER_AGENT


def discogs_token() -> str | None:
    """
    Personal access token for Discogs API (``Authorization: Discogs token=…``).

    Create at https://www.discogs.com/settings/developers — see
    https://www.discogs.com/developers/page:authentication,header:authentication
    """
    raw = os.environ.get("DISCOGS_TOKEN") or os.environ.get("DISCOGS_PERSONAL_ACCESS_TOKEN") or ""
    stripped = raw.strip()
    return stripped or None


def groovegraph_http_user_agent_is_explicit() -> bool:
    """True when ``GROOVEGRAPH_HTTP_USER_AGENT`` is set to a non-empty value (Discogs / MusicBrainz policy)."""
    raw = os.environ.get("GROOVEGRAPH_HTTP_USER_AGENT")
    return raw is not None and bool(raw.strip())


def _truthy_env(raw: str | None) -> bool:
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int, *, min_v: int, max_v: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        v = int(raw, 10)
    except ValueError:
        return default
    return max(min_v, min(max_v, v))


def groovegraph_stimulus_max_chars() -> int:
    """Max characters for combined extract stimulus (canonical + web + optional HTTP supplements)."""
    return _int_env("GROOVEGRAPH_STIMULUS_MAX_CHARS", 500_000, min_v=4096, max_v=2_000_000)


def groovegraph_wikipedia_section_max_chars() -> int:
    return _int_env("GROOVEGRAPH_WIKIPEDIA_SECTION_MAX_CHARS", 24_000, min_v=512, max_v=200_000)


def groovegraph_brave_embed_max_chars() -> int:
    """Upper bound for Brave SERP-derived text embedded in stimulus (see ``brave_extract_context``)."""
    return _int_env("GROOVEGRAPH_BRAVE_EMBED_MAX_CHARS", 500_000, min_v=2048, max_v=2_000_000)


def groovegraph_supplementary_http_fetch_enabled() -> bool:
    return _truthy_env(os.environ.get("GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH"))


def groovegraph_supplementary_http_fetch_max_urls() -> int:
    return _int_env("GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH_MAX_URLS", 3, min_v=0, max_v=20)


def groovegraph_canonical_deep_artist_enabled() -> bool:
    return _truthy_env(os.environ.get("GROOVEGRAPH_CANONICAL_DEEP_ARTIST"))


def groovegraph_mb_deep_release_cap() -> int:
    return _int_env("GROOVEGRAPH_MB_DEEP_RELEASE_CAP", 5, min_v=0, max_v=50)


def groovegraph_mb_deep_recording_cap() -> int:
    """
    When ``GROOVEGRAPH_CANONICAL_DEEP_ARTIST`` is on, cap extra MusicBrainz **recording** titles
    fetched from the first matched **release** (``0`` disables the extra request; max **25**).
    """
    return _int_env("GROOVEGRAPH_MB_DEEP_RECORDING_CAP", 25, min_v=0, max_v=25)


def brave_api_key() -> str | None:
    """
    Prefer `BRAVE_API_KEY` (documented in repo-root `.env.example`).

    Also accepts `BraveSearchApiKey` for older / hand-written `.env` files.
    """
    raw = os.environ.get("BRAVE_API_KEY") or os.environ.get("BraveSearchApiKey")
    if raw is None:
        return None
    stripped = raw.strip()
    return stripped or None
