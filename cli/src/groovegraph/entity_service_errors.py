from __future__ import annotations

from typing import Any

TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE = "typedb_not_configured_on_entity_service"


def entity_service_pipeline_error_code(body: Any) -> str | None:
    """
    Best-effort parse of entity-service HTTP error JSON.

    Supports legacy string ``detail`` and structured ``{ "detail": { "code": ... } }``.
    """
    if not isinstance(body, dict):
        return None
    detail = body.get("detail")
    if detail == TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE:
        return TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE
    if isinstance(detail, dict):
        code = detail.get("code")
        if isinstance(code, str) and code.strip():
            return code.strip()
    return None


def is_typedb_not_configured_on_entity_service(body: Any) -> bool:
    return entity_service_pipeline_error_code(body) == TYPEDB_NOT_CONFIGURED_ON_ENTITY_SERVICE
