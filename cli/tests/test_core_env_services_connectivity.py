from __future__ import annotations

import os
from pathlib import Path

import pytest

from groovegraph.brave_probe import probe_brave_search
from groovegraph.env_loader import brave_api_key, ner_service_url
from groovegraph.ner_health import check_entity_service_liveness
from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_verify import verify_typedb

REPO_ROOT = Path(__file__).resolve().parents[2]

_TYPEDB_ENV_KEYS = (
    "TYPEDB_CONNECTION_STRING",
    "TYPEDB_ADDRESSES",
    "TYPEDB_USERNAME",
    "TYPEDB_PASSWORD",
    "TYPEDB_DATABASE",
)


def _typedb_env_mentioned_in_process_env() -> bool:
    """True when TypeDB-related variables are set (after loading repo-root `.env`)."""
    return any(os.environ.get(k, "").strip() for k in _TYPEDB_ENV_KEYS)


@pytest.mark.core
@pytest.mark.e2e
def test_core_live_connectivity_for_all_configured_dotenv_services() -> None:
    """
    Core connectivity contract for integrations configured in the **repo-root `.env` file**
    (loaded by test `conftest` the same way `gg` does).

    Requires **`.env` to exist** at the repository root (gitignored; never committed).

    - **Entity service** (`NER_SERVICE_URL`): always exercised via **GET `/docs`**.
    - **TypeDB** (`TYPEDB_*`): connect, read **type schema**, list declared types, close (when any TypeDB vars are set).
    - **Brave Search** (`BRAVE_API_KEY`): exercised whenever a key is present in `.env` (real quota-consuming request).

    Variables left empty in `.env` are intentionally **not** required, but anything set must work.

    This test uses **live** network I/O (no mocks).
    """
    env_file = REPO_ROOT / ".env"
    assert env_file.is_file(), (
        "Core connectivity requires repo-root `.env` (gitignored). "
        "Copy `.env.example` to `.env` at the GrooveGraph repository root and fill in values."
    )

    ner = check_entity_service_liveness(ner_service_url())
    assert ner["ok"] is True, {"stage": "entity_service", "report": ner}

    if _typedb_env_mentioned_in_process_env():
        try:
            params = read_typedb_connection_params()
        except TypeDbConfigError as exc:
            pytest.fail(f"TypeDB env from `.env` is partially set but invalid: {exc}")

        typedb = verify_typedb(params)
        assert typedb["ok"] is True, {"stage": "typedb", "report": typedb}
        assert isinstance(typedb.get("types"), list), typedb

    key = brave_api_key()
    if key:
        brave = probe_brave_search(key)
        assert brave["ok"] is True, {"stage": "brave", "report": brave}
