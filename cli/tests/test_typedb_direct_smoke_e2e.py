from __future__ import annotations

import pytest

from groovegraph.typedb_config import TypeDbConfigError, read_typedb_connection_params
from groovegraph.typedb_verify import verify_typedb

pytestmark = pytest.mark.e2e


def test_typedb_direct_connect_list_types_close() -> None:
    """
    TypeDB smoke **without entity-service**: repo `.env` → driver → `type_schema()` → parsed `types`,
    then driver context exits (connection closed).

    Downstream integrators that only need to know “is TypeDB reachable?” should use this path.
    """
    try:
        params = read_typedb_connection_params()
    except TypeDbConfigError as exc:
        pytest.skip(f"TypeDB not configured in repo-root `.env`: {exc}")

    report = verify_typedb(params)
    assert report.get("ok") is True, report
    assert isinstance(report.get("types"), list), report
