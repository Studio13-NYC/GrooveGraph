from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def pytest_configure(config: pytest.Config) -> None:  # noqa: ARG001
    """Verbose file logging for diagnosing integration failures (see repo ``logs/pytest.log``)."""
    from groovegraph.logging_setup import setup_gg_logging

    setup_gg_logging(REPO_ROOT, log_filename="pytest.log", console=True)


@pytest.fixture(scope="session", autouse=True)
def _e2e_session_repo_layout() -> None:
    """
    End-to-end tests assume the GrooveGraph repo root is CWD and `.env` is loaded from there,
    matching normal `gg` usage from the repository checkout.
    """
    # Space full-suite runs from prior Brave Search traffic so burst limits are less likely.
    time.sleep(1.25)

    previous = Path.cwd()
    os.chdir(REPO_ROOT)

    # Import after chdir so repo discovery matches operator workflows.
    from groovegraph.env_loader import load_repo_dotenv

    load_repo_dotenv(REPO_ROOT)
    yield
    os.chdir(previous)
