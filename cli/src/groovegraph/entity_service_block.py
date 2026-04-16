from __future__ import annotations

import httpx

from groovegraph.entity_service_errors import is_typedb_not_configured_on_entity_service

BLOCKED_ENTITY_SERVICE_UPSTREAM = (
    "blocked (upstream): entity-service returned 503 / missing TypeDB-backed schema pipeline capability. "
    "Tags: upstream blocked, typedb_not_configured_on_entity_service. "
    "This is not a GrooveGraph failure — configure TypeDB on the **entity-service process** or extend "
    "entity-service; see docs/AGENT_ENTITY_SERVICE_ISSUES.md §1.2 (archived checklist: docs/archive/ENTITY_SERVICE_PUNCH_LIST.md). "
    "Continue running the rest of the suite with: pytest -m \"not entity_service\"."
)


def pytest_skip_if_entity_service_schema_blocked(*, response: httpx.Response) -> None:
    """Raise `pytest.skip` when the failure mode is upstream configuration/capability, not GrooveGraph."""
    import pytest

    if response.status_code == 503:
        pytest.skip(BLOCKED_ENTITY_SERVICE_UPSTREAM)

    if response.status_code == 200:
        return

    try:
        body = response.json()
    except Exception:  # noqa: BLE001
        body = {}

    # Some deployments may return JSON errors without 503 — keep narrow.
    if is_typedb_not_configured_on_entity_service(body):
        pytest.skip(BLOCKED_ENTITY_SERVICE_UPSTREAM)


def pytest_skip_if_entity_service_unreachable(exc: BaseException) -> None:
    import pytest

    if isinstance(exc, httpx.ConnectError | httpx.TimeoutException):
        pytest.skip(f"blocked: entity-service not reachable ({type(exc).__name__}: {exc}). Start the API locally.")
