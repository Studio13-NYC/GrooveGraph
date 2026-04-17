from __future__ import annotations

import json
import os
import re
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


PERSISTENCE_LABELS = {"Artist", "Recording", "Studio", "Equipment", "Person"}
ALLOWED_LABELS = PERSISTENCE_LABELS | {"Release", "Instrument", "Manufacturer", "Label", "Alias"}
NAME_CAPTURE = r"[A-Z][a-zA-Z0-9'&./-]+(?:\s+[A-Z][a-zA-Z0-9'&./-]+){0,4}"
CAPITALIZED_SPAN = re.compile(rf"\b({NAME_CAPTURE})\b")
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")
STOPWORDS = {
    "Question",
    "Graph",
    "Evidence",
    "Music",
    "Artist",
    "Recording",
    "Release",
    "Studio",
    "Equipment",
    "Instrument",
    "Manufacturer",
    "Person",
    "Wikipedia",
    "MusicBrainz",
    "Discogs",
    "URL",
    "Background",
    "References",
    "Personnel",
    "Charts",
    "Certifications",
    "Critical Reception",
    "Main Menu",
    "Main Page",
    "Current Events",
    "Random Article",
    "External Links",
    "Track Listing",
    "Further Reading",
}
LABEL_HINTS: dict[str, tuple[str, ...]] = {
    "Studio": ("studio", "recorded at", "recording at", "tracked at", "cut at", "mixed at"),
    "Equipment": ("console", "microphone", "compressor", "desk", "tape", "pedal", "amp", "amplifier", "synth", "drum machine"),
    "Instrument": ("guitar", "bass", "synthesizer", "synth", "keyboard", "drums", "piano", "microphone"),
    "Manufacturer": ("manufactured by", "built by", "made by"),
    "Label": ("label", "released by", "imprint"),
    "Recording": ("album", "recording", "track", "song", "single"),
    "Release": ("release", "lp", "ep", "soundtrack"),
    "Person": ("producer", "engineer", "drummer", "guitarist", "bassist", "singer", "vocalist", "keyboardist", "member"),
    "Artist": ("band", "artist", "group", "duo"),
}
RELATION_PATTERNS: list[dict[str, Any]] = [
    {
        "type": "alias_of",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE})\s+(?:also known as|aka|a\.k\.a\.)\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Person",
        "right_label": "Alias",
    },
    {
        "type": "member_of",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE})\s+(?:was a member of|played in|joined|co-founded|formed)\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Person",
        "right_label": "Artist",
    },
    {
        "type": "produced",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE})\s+(?:produced|co-produced)\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Person",
        "right_label": "Artist",
    },
    {
        "type": "produced_by",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE}).{{0,80}}?produced by\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Recording",
        "right_label": "Person",
    },
    {
        "type": "recorded_at",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE}).{{0,80}}?(?:recorded|tracked|cut|mixed)\s+(?:at|in)\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Recording",
        "right_label": "Studio",
    },
    {
        "type": "released_by",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE}).{{0,80}}?released by\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Release",
        "right_label": "Label",
    },
    {
        "type": "manufactured_by",
        "pattern": re.compile(rf"(?P<left>{NAME_CAPTURE}).{{0,80}}?(?:built|manufactured|made)\s+by\s+(?P<right>{NAME_CAPTURE})", re.IGNORECASE),
        "left_label": "Equipment",
        "right_label": "Manufacturer",
    },
]


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _compact(value: Any) -> str:
    return re.sub(r"\s+", " ", _clean(value))


def _normalize(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _compact(value).casefold()).strip("-")


def _snippet(text: str, limit: int = 280) -> str:
    return _compact(text)[:limit]


def _sentence_split(text: str) -> list[str]:
    return [_compact(part) for part in SENTENCE_SPLIT.split(text or "") if _compact(part)]


def _entity_priority(label: str) -> int:
    order = {
        "Artist": 9,
        "Person": 8,
        "Recording": 7,
        "Release": 6,
        "Studio": 5,
        "Equipment": 4,
        "Instrument": 3,
        "Manufacturer": 2,
        "Label": 1,
        "Alias": 0,
    }
    return order.get(label, -1)


def _best_label(current_label: str, current_confidence: float, candidate_label: str, candidate_confidence: float) -> str:
    if candidate_confidence > current_confidence:
        return candidate_label
    if candidate_confidence == current_confidence and _entity_priority(candidate_label) > _entity_priority(current_label):
        return candidate_label
    return current_label


def _label_from_context(text: str, default: str | None = None) -> str | None:
    window = _compact(text).casefold()
    for label, hints in LABEL_HINTS.items():
        if any(hint in window for hint in hints):
            return label
    return default


def _make_entity(
    text: str,
    label: str,
    confidence: float,
    source: str,
    evidence: str = "",
    source_url: str = "",
    properties: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cleaned = _compact(text)
    return {
        "id": f"{label}:{_normalize(cleaned)}",
        "text": cleaned,
        "label": label,
        "start": 0,
        "end": len(cleaned),
        "confidence": round(confidence, 3),
        "sources": [source],
        "source_urls": [source_url] if source_url else [],
        "evidence": [_snippet(evidence)] if evidence else [],
        "properties": properties or {},
    }


def _merge_entity(existing: dict[str, Any], candidate: dict[str, Any]) -> None:
    chosen_label = _best_label(
        _clean(existing.get("label")),
        float(existing.get("confidence") or 0),
        _clean(candidate.get("label")),
        float(candidate.get("confidence") or 0),
    )
    existing["label"] = chosen_label
    existing["confidence"] = max(float(existing.get("confidence") or 0), float(candidate.get("confidence") or 0))
    existing["sources"] = sorted(set([*_clean_list(existing.get("sources")), *_clean_list(candidate.get("sources"))]))
    existing["source_urls"] = sorted(set([*_clean_list(existing.get("source_urls")), *_clean_list(candidate.get("source_urls"))]))
    existing["evidence"] = _dedupe_strings([*existing.get("evidence", []), *candidate.get("evidence", [])])[:4]
    existing_properties = dict(existing.get("properties") or {})
    existing_properties.update({key: value for key, value in (candidate.get("properties") or {}).items() if value not in ("", None, [])})
    existing["properties"] = existing_properties
    existing["id"] = f"{existing['label']}:{_normalize(existing['text'])}"
    existing["start"] = min(int(existing.get("start") or 0), int(candidate.get("start") or 0))
    existing["end"] = max(int(existing.get("end") or 0), int(candidate.get("end") or 0))


def _clean_list(values: Any) -> list[str]:
    return [_compact(value) for value in list(values or []) if _compact(value)]


def _dedupe_strings(values: list[Any]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = _compact(value)
        key = cleaned.casefold()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out


def _register_entity(registry: dict[str, dict[str, Any]], candidate: dict[str, Any], allowed_labels: set[str]) -> dict[str, Any] | None:
    label = _clean(candidate.get("label"))
    text = _compact(candidate.get("text"))
    if not text or label not in allowed_labels:
        return None
    key = _normalize(text)
    if not key:
        return None
    if key in {"the", "and", "with"} or text in STOPWORDS:
        return None
    existing = registry.get(key)
    if existing:
        _merge_entity(existing, candidate)
        return existing
    registry[key] = candidate
    return candidate


def _register_property(
    properties: list[dict[str, Any]],
    subject: str,
    property_name: str,
    value: Any,
    source: str,
    confidence: float,
    evidence: str = "",
    source_url: str = "",
) -> None:
    cleaned_subject = _compact(subject)
    cleaned_property = _compact(property_name)
    cleaned_value = _compact(value)
    if not cleaned_subject or not cleaned_property or not cleaned_value:
        return
    key = (cleaned_subject.casefold(), cleaned_property.casefold(), cleaned_value.casefold())
    if any(
        (
            _clean(item.get("subject")).casefold(),
            _clean(item.get("property")).casefold(),
            _clean(item.get("value")).casefold(),
        )
        == key
        for item in properties
    ):
        return
    properties.append(
        {
            "subject": cleaned_subject,
            "property": cleaned_property,
            "value": cleaned_value,
            "source": source,
            "source_url": source_url,
            "confidence": round(confidence, 3),
            "evidence": _snippet(evidence),
        }
    )


def _register_relation(
    relations: list[dict[str, Any]],
    relation_type: str,
    left_entity: dict[str, Any] | None,
    right_entity: dict[str, Any] | None,
    confidence: float,
    source: str,
    evidence: str = "",
    source_url: str = "",
) -> None:
    if not left_entity or not right_entity:
        return
    key = (
        relation_type.casefold(),
        _clean(left_entity.get("text")).casefold(),
        _clean(right_entity.get("text")).casefold(),
    )
    if any(
        (
            _clean(item.get("type")).casefold(),
            _clean(item.get("source_entity")).casefold(),
            _clean(item.get("target_entity")).casefold(),
        )
        == key
        for item in relations
    ):
        return
    relations.append(
        {
            "type": relation_type,
            "source_entity": left_entity.get("text"),
            "source_label": left_entity.get("label"),
            "target_entity": right_entity.get("text"),
            "target_label": right_entity.get("label"),
            "confidence": round(confidence, 3),
            "source": source,
            "source_url": source_url,
            "evidence": _snippet(evidence),
        }
    )


def _scan_known_entities(
    text: str,
    known_entities: list[dict[str, Any]],
    allowed_labels: set[str],
    registry: dict[str, dict[str, Any]],
) -> None:
    lowered = text.casefold()
    for item in known_entities:
        label = _clean(item.get("label"))
        aliases = [_clean(item.get("canonical")), *[_clean(alias) for alias in item.get("aliases", [])]]
        for alias in aliases:
            if not alias:
                continue
            idx = lowered.find(alias.casefold())
            if idx < 0:
                continue
            _register_entity(
                registry,
                {
                    "text": text[idx : idx + len(alias)],
                    "label": label if label in allowed_labels else "Artist",
                    "start": idx,
                    "end": idx + len(alias),
                    "confidence": 0.94,
                    "sources": ["graph_context"],
                    "source_urls": [],
                    "evidence": [_snippet(text[max(0, idx - 70) : idx + len(alias) + 70])],
                    "properties": {"known_entity": "true"},
                },
                allowed_labels,
            )


def _extract_from_structured_sources(
    payload: dict[str, Any],
    allowed_labels: set[str],
    registry: dict[str, dict[str, Any]],
    properties: list[dict[str, Any]],
) -> None:
    sources = payload.get("evidence", {}).get("sources", {})

    wikipedia_items = sources.get("wikipedia", {}).get("items", [])
    for item in wikipedia_items:
        title = _compact(item.get("title"))
        description = _compact(item.get("description"))
        extract = _compact(item.get("extract"))
        kind = _compact(item.get("kind"))
        label = "Artist" if kind == "artist" else _label_from_context(f"{description} {extract}", "Recording") or "Recording"
        entity = _register_entity(
            registry,
            _make_entity(
                title,
                label if label in allowed_labels else "Recording",
                0.9,
                "wikipedia",
                evidence=extract or description,
                source_url=_clean(item.get("content_url")),
                properties={"wikipedia_title": title, "description": description},
            ),
            allowed_labels,
        )
        if entity:
            _register_property(properties, title, "wikipedia_url", _clean(item.get("content_url")), "wikipedia", 0.9, extract or description, _clean(item.get("content_url")))
            if description:
                _register_property(properties, title, "description", description, "wikipedia", 0.72, extract, _clean(item.get("content_url")))

    musicbrainz_items = sources.get("musicbrainz", {}).get("items", [])
    for item in musicbrainz_items:
        label = _clean(item.get("entity_type") or "Artist")
        name = _compact(item.get("name"))
        if label == "Release":
            label = "Recording"
        entity = _register_entity(
            registry,
            _make_entity(
                name,
                label if label in allowed_labels else "Artist",
                0.92,
                "musicbrainz",
                evidence=_compact(
                    " • ".join(
                        [
                            _clean(item.get("disambiguation")),
                            _clean(item.get("first_release_date")),
                            _clean(item.get("country")),
                            _clean(item.get("type")),
                        ]
                    )
                ),
                source_url=_clean(item.get("source_url")),
                properties={
                    "musicbrainz_id": _clean(item.get("id")),
                    "country": _clean(item.get("country")),
                    "musicbrainz_type": _clean(item.get("type")),
                    "first_release_date": _clean(item.get("first_release_date")),
                },
            ),
            allowed_labels,
        )
        if entity:
            _register_property(properties, name, "musicbrainz_id", _clean(item.get("id")), "musicbrainz", 0.94, "", _clean(item.get("source_url")))
            _register_property(properties, name, "country", _clean(item.get("country")), "musicbrainz", 0.8, "", _clean(item.get("source_url")))
            _register_property(properties, name, "first_release_date", _clean(item.get("first_release_date")), "musicbrainz", 0.88, "", _clean(item.get("source_url")))
            _register_property(properties, name, "musicbrainz_type", _clean(item.get("type")), "musicbrainz", 0.76, "", _clean(item.get("source_url")))

    discogs_items = sources.get("discogs", {}).get("items", [])
    for item in discogs_items:
        label = _clean(item.get("entity_type") or "Release")
        name = _compact(item.get("title"))
        mapped_label = "Artist" if label == "Artist" else "Release"
        entity = _register_entity(
            registry,
            _make_entity(
                name,
                mapped_label if mapped_label in allowed_labels else "Release",
                0.82,
                "discogs",
                evidence=_compact(
                    " • ".join(
                        [
                            _clean(item.get("country")),
                            _clean(item.get("year")),
                            _clean(item.get("format")),
                        ]
                    )
                ),
                source_url=_clean(item.get("resource_url") or item.get("uri")),
                properties={
                    "discogs_url": _clean(item.get("resource_url") or item.get("uri")),
                    "country": _clean(item.get("country")),
                    "year": _clean(item.get("year")),
                    "format": _clean(item.get("format")),
                },
            ),
            allowed_labels,
        )
        if entity:
            _register_property(properties, name, "discogs_url", _clean(item.get("resource_url") or item.get("uri")), "discogs", 0.83, "", _clean(item.get("resource_url") or item.get("uri")))
            _register_property(properties, name, "year", _clean(item.get("year")), "discogs", 0.78, "", _clean(item.get("resource_url") or item.get("uri")))
            _register_property(properties, name, "format", _clean(item.get("format")), "discogs", 0.72, "", _clean(item.get("resource_url") or item.get("uri")))


def _scan_heuristic_entities(text: str, allowed_labels: set[str], registry: dict[str, dict[str, Any]]) -> None:
    sentences = _sentence_split(text)
    counts = Counter()
    candidates: list[tuple[str, str, str]] = []

    for sentence in sentences:
        for match in CAPITALIZED_SPAN.finditer(sentence):
            candidate = _compact(match.group(1))
            if not candidate or candidate in STOPWORDS or len(candidate) < 4:
                continue
            label = _label_from_context(sentence)
            if not label:
                continue
            counts[_normalize(candidate)] += 1
            candidates.append((candidate, label, sentence))

    for candidate, label, sentence in candidates:
        normalized = _normalize(candidate)
        confidence = 0.68 if counts[normalized] > 1 else 0.58
        _register_entity(
            registry,
            _make_entity(
                candidate,
                label if label in allowed_labels else "Person",
                confidence,
                "text_heuristic",
                evidence=sentence,
            ),
            allowed_labels,
        )


def _ensure_entity_from_relation(
    registry: dict[str, dict[str, Any]],
    text: str,
    label: str,
    allowed_labels: set[str],
    evidence: str,
    source: str,
    source_url: str = "",
) -> dict[str, Any] | None:
    return _register_entity(
        registry,
        _make_entity(text, label if label in allowed_labels else "Person", 0.76, source, evidence=evidence, source_url=source_url),
        allowed_labels,
    )


def _scan_relations_and_properties(
    text: str,
    allowed_labels: set[str],
    registry: dict[str, dict[str, Any]],
    relations: list[dict[str, Any]],
    properties: list[dict[str, Any]],
) -> None:
    for sentence in _sentence_split(text):
        for relation_pattern in RELATION_PATTERNS:
            for match in relation_pattern["pattern"].finditer(sentence):
                left = _ensure_entity_from_relation(
                    registry,
                    _clean(match.group("left")),
                    relation_pattern["left_label"],
                    allowed_labels,
                    sentence,
                    "text_pattern",
                )
                right = _ensure_entity_from_relation(
                    registry,
                    _clean(match.group("right")),
                    relation_pattern["right_label"],
                    allowed_labels,
                    sentence,
                    "text_pattern",
                )
                _register_relation(relations, relation_pattern["type"], left, right, 0.76, "text_pattern", sentence)
                if relation_pattern["type"] == "alias_of" and left and right:
                    _register_property(properties, left["text"], "alias", right["text"], "text_pattern", 0.78, sentence)

        year_match = re.search(r"\b(19\d{2}|20\d{2})\b", sentence)
        if "released" in sentence.casefold() and year_match:
            for match in CAPITALIZED_SPAN.finditer(sentence):
                subject = _compact(match.group(1))
                if subject and subject not in STOPWORDS:
                    _register_property(properties, subject, "release_year", year_match.group(1), "text_pattern", 0.62, sentence)
                    break


def _dedupe_entities(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(entities, key=lambda item: (-float(item.get("confidence") or 0), _clean(item.get("label")), _clean(item.get("text"))))


class EntityServiceHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            _json_response(self, 200, {"ok": True, "service": "groovegraph-entity-service"})
            return
        _json_response(self, 404, {"ok": False, "error": "route_not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/extract":
            _json_response(self, 404, {"ok": False, "error": "route_not_found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
        text = _clean(payload.get("text"))
        schema = payload.get("schema") or {}
        labels_filter = payload.get("labels") or schema.get("entityTypes") or []
        allowed_labels = {label for label in labels_filter if label in ALLOWED_LABELS}
        if not allowed_labels:
            allowed_labels = set(ALLOWED_LABELS)

        known_entities = schema.get("knownEntities") or []
        registry: dict[str, dict[str, Any]] = {}
        relations: list[dict[str, Any]] = []
        properties: list[dict[str, Any]] = []

        _scan_known_entities(text, known_entities, allowed_labels, registry)
        _extract_from_structured_sources(payload, allowed_labels, registry, properties)
        if payload.get("options", {}).get("use_model", True):
            _scan_heuristic_entities(text, allowed_labels, registry)
            _scan_relations_and_properties(text, allowed_labels, registry, relations, properties)

        body = {
            "entities": _dedupe_entities(list(registry.values()))[:60],
            "relations": relations[:80],
            "properties": properties[:120],
            "diagnostics": {
                "allowed_labels": sorted(allowed_labels),
                "known_entities": len(known_entities),
                "entity_count": len(registry),
                "relation_count": len(relations),
                "property_count": len(properties),
                "used_heuristics": True,
                "mode": "broad_corpus_extraction",
            },
        }
        _json_response(self, 200, body)


def main() -> None:
    host = os.environ.get("ENTITY_SERVICE_HOST", "127.0.0.1")
    port = int(os.environ.get("ENTITY_SERVICE_PORT", "8200"))
    server = ThreadingHTTPServer((host, port), EntityServiceHandler)
    print(f"GrooveGraph entity-service listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
