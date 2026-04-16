from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from groovegraph.catalog_types import CatalogEntityKind, catalog_kind_or_raise
from groovegraph.ingest_models import CatalogDraftEntity


def catalog_labels_from_kinds(kinds: list[CatalogEntityKind]) -> frozenset[str]:
    return frozenset(k.kind for k in kinds)


def build_ingest_rows_from_extract(
    *,
    entities: list[dict[str, Any]],
    allowed_labels: frozenset[str],
) -> tuple[list[CatalogDraftEntity], list[dict[str, Any]]]:
    """
    Map ``/extract`` ``entities[]`` into draft catalog rows for kinds GrooveGraph already models.

    Unknown ``label`` values are returned in ``skipped`` for operator review (no guessy typing).
    """
    rows: list[CatalogDraftEntity] = []
    skipped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for ent in entities:
        if not isinstance(ent, dict):
            skipped.append({"reason": "not_object", "raw": ent})
            continue
        label = str(ent.get("label") or "").strip().lower()
        text = str(ent.get("text") or "").strip()
        if not label or not text:
            skipped.append({"reason": "missing_label_or_text", "entity": ent})
            continue
        if label not in allowed_labels:
            skipped.append({"reason": "label_not_in_allowlist", "entity": ent})
            continue
        try:
            meta = catalog_kind_or_raise(label)
        except ValueError:
            skipped.append({"reason": "unknown_catalog_kind", "entity": ent})
            continue

        key = (label, text.casefold())
        if key in seen:
            continue
        seen.add(key)

        rows.append(
            CatalogDraftEntity(
                kind=meta.kind,
                name=text,
                approval_status="pending",
                mo_class_iri=meta.default_mo_class_iri,
                mo_property_iri=None,
                source_url=None,
            )
        )

    return rows, skipped


def default_explore_batch_id(query: str) -> str:
    slug = "".join(c if c.isalnum() else "-" for c in query.strip().lower())[:40].strip("-")
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"explore-{day}-{slug or 'topic'}"
