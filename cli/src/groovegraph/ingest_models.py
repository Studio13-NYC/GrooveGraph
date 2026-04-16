from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class CatalogDraftEntity(BaseModel):
    """One catalog entity row to insert as a draft."""

    kind: str = Field(description="CLI kind token (artist, album, …).")
    name: str
    approval_status: str = Field(default="pending")
    mo_class_iri: str | None = Field(default=None)
    mo_property_iri: str | None = Field(default=None)
    source_url: str | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def name_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must be non-empty")
        return v


class IngestDraftEnvelope(BaseModel):
    """
    JSON envelope for `gg ingest-draft` (stdin).

    Either provide `catalog_entities` only, or also include `extract` metadata for auditability.
    """

    ingestion_batch_id: str = Field(min_length=1)
    catalog_entities: list[CatalogDraftEntity] = Field(default_factory=list)
    extract: dict[str, Any] | None = None
    notes: str | None = None

    @field_validator("ingestion_batch_id")
    @classmethod
    def batch_id_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("ingestion_batch_id must be non-empty")
        return v.strip()
