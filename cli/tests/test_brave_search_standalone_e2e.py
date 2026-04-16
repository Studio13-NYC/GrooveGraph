from __future__ import annotations

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

from groovegraph.brave_probe import probe_brave_search

pytestmark = [pytest.mark.e2e, pytest.mark.brave_only]


def test_brave_api_authenticates_and_single_search() -> None:
    """
    Standalone Brave Search check: load repo-root `.env` here, then one real request.

    Does not use entity-service, TypeDB, or `gg doctor`. Only verifies the Brave API key
    and that a minimal web search succeeds.
    """
    repo_root = Path(__file__).resolve().parents[2]
    load_dotenv(repo_root / ".env", override=False)

    key = (os.environ.get("BRAVE_API_KEY") or os.environ.get("BraveSearchApiKey") or "").strip()
    if not key:
        pytest.skip("Set `BRAVE_API_KEY` (or `BraveSearchApiKey`) in repo-root `.env`.")

    result = probe_brave_search(key)
    assert result.get("ok") is True, result
