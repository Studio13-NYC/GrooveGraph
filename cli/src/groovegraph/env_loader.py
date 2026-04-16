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
