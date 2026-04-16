from __future__ import annotations

from groovegraph.entity_service_errors import (
    TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE,
    entity_service_pipeline_error_code,
    is_typedb_not_configured_on_entity_service,
)


def test_legacy_string_detail() -> None:
    body = {"detail": TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE}
    assert entity_service_pipeline_error_code(body) == TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE
    assert is_typedb_not_configured_on_entity_service(body) is True


def test_structured_detail_code() -> None:
    body = {
        "detail": {
            "code": TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE,
            "message": "TypeDB is not configured",
            "hint": "Set TYPEDB_*",
        }
    }
    assert entity_service_pipeline_error_code(body) == TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE
    assert is_typedb_not_configured_on_entity_service(body) is True


def test_other_code_not_typedb() -> None:
    body = {"detail": {"code": "other_error", "message": "nope"}}
    assert is_typedb_not_configured_on_entity_service(body) is False


def test_non_dict() -> None:
    assert entity_service_pipeline_error_code(None) is None
    assert entity_service_pipeline_error_code("x") is None
