from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# Stable ``POST /extract`` / TypeQL entity type for spans not yet mapped to an MO catalog type.
# Canonical schema: ``entity gg-generic`` (same ``owns`` as other catalog entities). ``gg explore``
# may still append this to ``labels`` when kinds are narrowed so the label filter admits generics.
RESERVED_GENERIC_ENTITY_LABEL: Final[str] = "gg-generic"
GENERIC_ENTITY_MO_CLASS_IRI: Final[str] = "https://groovegraph.dev/ns#GenericExtractSpan"


@dataclass(frozen=True)
class CatalogEntityKind:
    """CLI kind token → TypeQL entity label + default MO (or companion) class IRI."""

    kind: str
    typedb_entity: str
    default_mo_class_iri: str


# Allowlisted catalog kinds: keys match TypeQL entity labels (MO-first naming).
_CATALOG: Final[dict[str, CatalogEntityKind]] = {
    "mo-music-artist": CatalogEntityKind(
        kind="mo-music-artist",
        typedb_entity="mo-music-artist",
        default_mo_class_iri="http://purl.org/ontology/mo/MusicArtist",
    ),
    "mo-record": CatalogEntityKind(
        kind="mo-record",
        typedb_entity="mo-record",
        default_mo_class_iri="http://purl.org/ontology/mo/Record",
    ),
    "mo-track": CatalogEntityKind(
        kind="mo-track",
        typedb_entity="mo-track",
        default_mo_class_iri="http://purl.org/ontology/mo/Track",
    ),
    "mo-instrument": CatalogEntityKind(
        kind="mo-instrument",
        typedb_entity="mo-instrument",
        default_mo_class_iri="http://purl.org/ontology/mo/Instrument",
    ),
    "mo-label": CatalogEntityKind(
        kind="mo-label",
        typedb_entity="mo-label",
        default_mo_class_iri="http://purl.org/ontology/mo/Label",
    ),
    "foaf-agent": CatalogEntityKind(
        kind="foaf-agent",
        typedb_entity="foaf-agent",
        default_mo_class_iri="http://xmlns.com/foaf/0.1/Agent",
    ),
    "gg-generic": CatalogEntityKind(
        kind="gg-generic",
        typedb_entity="gg-generic",
        default_mo_class_iri=GENERIC_ENTITY_MO_CLASS_IRI,
    ),
}

INGESTION_BATCH_ENTITY: Final[str] = "ingestion-batch"
INGESTION_BATCH_MO_CLASS_IRI: Final[str] = "https://groovegraph.dev/ns#IngestionBatch"


def parse_kind_list(raw: str | None, *, default_all: bool) -> list[CatalogEntityKind]:
    """
    Parse a comma-separated kind list.

    `default_all=True` means "search everything allowlisted" when `raw` is empty/None.
    """
    if default_all and (raw is None or not raw.strip()):
        return list(_CATALOG.values())

    if raw is None or not raw.strip():
        return []

    out: list[CatalogEntityKind] = []
    for token in raw.split(","):
        key = token.strip().lower()
        if not key:
            continue
        if key not in _CATALOG:
            allowed = ", ".join(sorted(_CATALOG))
            raise ValueError(f"Unknown catalog kind {token!r}. Allowed: {allowed}")
        out.append(_CATALOG[key])
    return out


def extract_request_labels(
    kinds: list[CatalogEntityKind],
    *,
    include_reserved_generic: bool = False,
) -> list[str]:
    """
    Build the ``labels`` list for ``POST /extract``.

    When ``include_reserved_generic`` is true (``gg explore``), append ``RESERVED_GENERIC_ENTITY_LABEL``
    so the entity-service label filter can admit generic / untyped spans.
    """
    labels = [k.kind for k in kinds]
    if include_reserved_generic and RESERVED_GENERIC_ENTITY_LABEL not in labels:
        labels.append(RESERVED_GENERIC_ENTITY_LABEL)
    return labels


def catalog_kind_or_raise(kind: str) -> CatalogEntityKind:
    key = kind.strip().lower()
    if key not in _CATALOG:
        allowed = ", ".join(sorted(_CATALOG))
        raise ValueError(f"Unknown catalog kind {kind!r}. Allowed: {allowed}")
    return _CATALOG[key]
