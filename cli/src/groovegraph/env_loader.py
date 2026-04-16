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
