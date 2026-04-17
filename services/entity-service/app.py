from __future__ import annotations

import importlib.util
import json
import os
import re
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import spacy


PERSISTENCE_LABELS = {"Artist", "Recording", "Studio", "Equipment", "Person"}
ALLOWED_LABELS = PERSISTENCE_LABELS | {"Release", "Instrument", "Manufacturer", "Label", "Alias"}
SPACY_LABELS = {"PERSON", "ORG", "WORK_OF_ART", "FAC", "GPE", "LOC", "PRODUCT", "EVENT"}
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")
NON_NAME_PREFIXES = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "from",
    "he",
    "her",
    "his",
    "in",
    "it",
    "its",
    "of",
    "on",
    "part",
    "some",
    "that",
    "the",
    "their",
    "them",
    "they",
    "this",
    "those",
    "we",
    "with",
}
NON_NAME_PHRASES = {
    "part of the",
    "pop music",
    "some iconic work",
    "them on stage playing the",
}
ROLE_HINTS = {
    "producer",
    "engineer",
    "drummer",
    "guitarist",
    "bassist",
    "vocalist",
    "singer",
    "keyboardist",
    "member",
    "artist",
    "band",
    "group",
    "duo",
}
STUDIO_HINTS = {"studio", "recorded", "tracked", "mixed", "cut", "session", "facility"}
EQUIPMENT_HINTS = {"console", "microphone", "compressor", "desk", "tape", "pedal", "amp", "synth", "drum machine"}
RELATION_PATTERNS = [
    {
        "type": "alias_of",
        "pattern": re.compile(r"\b(?P<left>[^.]{2,80}?)\s+(?:also known as|aka|a\.k\.a\.)\s+(?P<right>[^.]{2,80}?)\b", re.IGNORECASE),
        "left_label": {"Person", "Artist"},
        "right_label": {"Alias"},
    },
    {
        "type": "member_of",
        "pattern": re.compile(r"\b(?P<left>[^.]{2,80}?)\s+(?:joined|co-founded|founded|was a member of|played in)\s+(?P<right>[^.]{2,80}?)\b", re.IGNORECASE),
        "left_label": {"Person"},
        "right_label": {"Artist"},
    },
    {
        "type": "produced",
        "pattern": re.compile(r"\b(?P<left>[^.]{2,80}?)\s+(?:produced|co-produced)\s+(?P<right>[^.]{2,80}?)\b", re.IGNORECASE),
        "left_label": {"Person"},
        "right_label": {"Artist", "Recording"},
    },
    {
        "type": "recorded_at",
        "pattern": re.compile(r"\b(?P<left>[^.]{2,80}?)\s+(?:was recorded at|recorded at|tracked at|mixed at)\s+(?P<right>[^.]{2,80}?)\b", re.IGNORECASE),
        "left_label": {"Recording"},
        "right_label": {"Studio"},
    },
]
MODEL_CANDIDATES = ("en_core_web_trf", "en_core_web_lg")
_NLP = None
_MODEL_NAME = None
_MODEL_ERROR = None


@dataclass
class CandidateEntity:
    text: str
    label: str
    confidence: float
    source: str
    source_url: str = ""
    evidence: list[str] = field(default_factory=list)
    properties: dict[str, Any] = field(default_factory=dict)
    spans: list[tuple[int, int]] = field(default_factory=list)


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


def _clean_list(values: Any) -> list[str]:
    return [_compact(value) for value in list(values or []) if _compact(value)]


def _title_ratio(text: str) -> float:
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9'&./-]*", text)
    if not tokens:
        return 0.0
    titled = sum(1 for token in tokens if token[:1].isupper() or token.isupper() or any(char.isdigit() for char in token))
    return titled / len(tokens)


def _looks_like_named_entity(text: str) -> bool:
    cleaned = _compact(text)
    if not cleaned:
        return False
    lowered = cleaned.casefold().strip(" .,:;!?")
    if lowered in NON_NAME_PHRASES:
        return False
    if len(cleaned) < 2 or len(cleaned) > 90:
        return False
    if not re.search(r"[A-Za-z]", cleaned):
        return False
    if lowered.split(" ", 1)[0] in NON_NAME_PREFIXES:
        return False
    if cleaned.lower() == cleaned and not any(char.isdigit() for char in cleaned):
        return False
    if _title_ratio(cleaned) < 0.55:
        return False
    return True


def _label_rank(label: str) -> int:
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


def _better_label(current_label: str, current_confidence: float, candidate_label: str, candidate_confidence: float) -> str:
    if candidate_confidence > current_confidence:
        return candidate_label
    if candidate_confidence == current_confidence and _label_rank(candidate_label) > _label_rank(current_label):
        return candidate_label
    return current_label


def _source_bonus(source: str) -> float:
    return {
        "graph_context": 0.08,
        "musicbrainz": 0.07,
        "discogs": 0.05,
        "wikipedia": 0.04,
        "spacy": 0.0,
    }.get(source, 0.0)


def _context_window(text: str, start: int, end: int, width: int = 100) -> str:
    return _snippet(text[max(0, start - width): min(len(text), end + width)])


def _sentence_for_offset(text: str, start: int, end: int) -> str:
    for sentence in _sentence_split(text):
        if _compact(text[start:end]) in sentence:
            return sentence
    return _context_window(text, start, end)


def _contextual_label(span_text: str, spacy_label: str, sentence: str) -> str | None:
    lowered = sentence.casefold()
    span_lower = span_text.casefold()
    if spacy_label == "PERSON":
        return "Person"
    if spacy_label == "WORK_OF_ART":
        return "Recording"
    if spacy_label in {"FAC", "GPE", "LOC"}:
        if any(hint in lowered for hint in STUDIO_HINTS):
            return "Studio"
        return None
    if spacy_label == "PRODUCT":
        if any(hint in lowered for hint in EQUIPMENT_HINTS):
            return "Equipment"
        return None
    if spacy_label == "ORG":
        if "records" in span_lower or "label" in lowered:
            return "Label"
        if any(hint in lowered for hint in STUDIO_HINTS):
            return "Studio"
        if any(hint in lowered for hint in ROLE_HINTS) or span_text.endswith(("Band", "Orchestra")):
            return "Artist"
        return "Artist"
    if spacy_label == "EVENT":
        return "Release"
    return None


def _resolve_allowed_label(label: str | None, allowed_labels: set[str]) -> str | None:
    if not label:
        return None
    if label in allowed_labels:
        return label
    if label == "Release" and "Recording" in allowed_labels:
        return "Recording"
    return None


def _candidate_dict(entity: CandidateEntity) -> dict[str, Any]:
    start = min((span[0] for span in entity.spans), default=0)
    end = max((span[1] for span in entity.spans), default=len(entity.text))
    return {
        "id": f"{entity.label}:{_normalize(entity.text)}",
        "text": entity.text,
        "label": entity.label,
        "start": start,
        "end": end,
        "confidence": round(entity.confidence, 3),
        "sources": _dedupe_strings([entity.source]),
        "source_urls": _dedupe_strings([entity.source_url]) if entity.source_url else [],
        "evidence": _dedupe_strings(entity.evidence)[:4],
        "properties": dict(entity.properties),
    }


def _register_entity(
    registry: dict[str, dict[str, Any]],
    text: str,
    label: str | None,
    confidence: float,
    source: str,
    *,
    source_url: str = "",
    evidence: str = "",
    properties: dict[str, Any] | None = None,
    span: tuple[int, int] | None = None,
    allowed_labels: set[str],
) -> dict[str, Any] | None:
    cleaned = _compact(text)
    resolved_label = _resolve_allowed_label(label, allowed_labels)
    if not cleaned or not resolved_label or not _looks_like_named_entity(cleaned):
        return None

    key = _normalize(cleaned)
    if not key:
        return None

    candidate = {
        "id": f"{resolved_label}:{key}",
        "text": cleaned,
        "label": resolved_label,
        "start": span[0] if span else 0,
        "end": span[1] if span else len(cleaned),
        "confidence": round(min(0.99, confidence + _source_bonus(source)), 3),
        "sources": [source],
        "source_urls": [source_url] if source_url else [],
        "evidence": [_snippet(evidence)] if evidence else [],
        "properties": dict(properties or {}),
    }

    existing = registry.get(key)
    if existing:
        existing["label"] = _better_label(
            _clean(existing.get("label")),
            float(existing.get("confidence") or 0.0),
            resolved_label,
            float(candidate["confidence"]),
        )
        existing["confidence"] = max(float(existing.get("confidence") or 0.0), float(candidate["confidence"]))
        existing["sources"] = _dedupe_strings([*existing.get("sources", []), source])
        existing["source_urls"] = _dedupe_strings([*existing.get("source_urls", []), source_url])
        existing["evidence"] = _dedupe_strings([*existing.get("evidence", []), *candidate["evidence"]])[:4]
        merged_properties = dict(existing.get("properties") or {})
        merged_properties.update({k: v for k, v in candidate["properties"].items() if v not in ("", None, [])})
        existing["properties"] = merged_properties
        existing["id"] = f"{existing['label']}:{key}"
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
        ) == key
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
            "confidence": round(confidence + _source_bonus(source), 3),
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
        ) == key
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
            "confidence": round(confidence + _source_bonus(source), 3),
            "source": source,
            "source_url": source_url,
            "evidence": _snippet(evidence),
        }
    )


def _infer_wikipedia_label(item: dict[str, Any], allowed_labels: set[str]) -> str | None:
    kind = _clean(item.get("kind"))
    if kind == "artist":
        return _resolve_allowed_label("Artist", allowed_labels)
    if kind == "recording":
        return _resolve_allowed_label("Recording", allowed_labels)
    description = _compact(item.get("description"))
    if "band" in description.casefold() or "musician" in description.casefold() or "artist" in description.casefold():
        return _resolve_allowed_label("Artist", allowed_labels)
    return _resolve_allowed_label("Recording", allowed_labels)


def _scan_known_entities(text: str, known_entities: list[dict[str, Any]], allowed_labels: set[str], registry: dict[str, dict[str, Any]]) -> int:
    lowered = text.casefold()
    count = 0
    for item in known_entities:
        label = _resolve_allowed_label(_clean(item.get("label")), allowed_labels)
        aliases = _dedupe_strings([item.get("canonical"), *list(item.get("aliases", []))])
        for alias in aliases:
            index = lowered.find(alias.casefold())
            if index < 0:
                continue
            registered = _register_entity(
                registry,
                alias,
                label,
                0.96,
                "graph_context",
                evidence=_context_window(text, index, index + len(alias)),
                span=(index, index + len(alias)),
                properties={"known_entity": "true"},
                allowed_labels=allowed_labels,
            )
            if registered:
                count += 1
                break
    return count


def _extract_structured_sources(
    payload: dict[str, Any],
    allowed_labels: set[str],
    registry: dict[str, dict[str, Any]],
    properties: list[dict[str, Any]],
) -> dict[str, int]:
    counts = {"wikipedia": 0, "musicbrainz": 0, "discogs": 0}
    sources = payload.get("evidence", {}).get("sources", {})

    for item in sources.get("wikipedia", {}).get("items", []):
        title = _compact(item.get("title"))
        if not title:
            continue
        label = _infer_wikipedia_label(item, allowed_labels)
        description = _compact(item.get("description"))
        extract = _compact(item.get("extract"))
        registered = _register_entity(
            registry,
            title,
            label,
            0.9,
            "wikipedia",
            source_url=_clean(item.get("content_url")),
            evidence=extract or description,
            properties={"wikipedia_title": title, "description": description},
            allowed_labels=allowed_labels,
        )
        if not registered:
            continue
        counts["wikipedia"] += 1
        _register_property(properties, title, "wikipedia_url", _clean(item.get("content_url")), "wikipedia", 0.88, extract or description, _clean(item.get("content_url")))
        if description:
            _register_property(properties, title, "description", description, "wikipedia", 0.78, extract, _clean(item.get("content_url")))

    for item in sources.get("musicbrainz", {}).get("items", []):
        name = _compact(item.get("name"))
        label = _resolve_allowed_label(_clean(item.get("entity_type")), allowed_labels)
        if not name or not label:
            continue
        registered = _register_entity(
            registry,
            name,
            label,
            0.93,
            "musicbrainz",
            source_url=_clean(item.get("source_url")),
            evidence=" ".join(
                part for part in [
                    _clean(item.get("disambiguation")),
                    _clean(item.get("first_release_date")),
                    _clean(item.get("country")),
                    _clean(item.get("type")),
                ] if part
            ),
            properties={
                "musicbrainz_id": _clean(item.get("id")),
                "country": _clean(item.get("country")),
                "musicbrainz_type": _clean(item.get("type")),
                "first_release_date": _clean(item.get("first_release_date")),
            },
            allowed_labels=allowed_labels,
        )
        if not registered:
            continue
        counts["musicbrainz"] += 1
        _register_property(properties, name, "musicbrainz_id", _clean(item.get("id")), "musicbrainz", 0.94, "", _clean(item.get("source_url")))
        _register_property(properties, name, "first_release_date", _clean(item.get("first_release_date")), "musicbrainz", 0.87, "", _clean(item.get("source_url")))
        _register_property(properties, name, "country", _clean(item.get("country")), "musicbrainz", 0.8, "", _clean(item.get("source_url")))

    for item in sources.get("discogs", {}).get("items", []):
        name = _compact(item.get("title"))
        raw_label = _clean(item.get("entity_type"))
        label = "Artist" if raw_label == "Artist" else "Recording"
        label = _resolve_allowed_label(label, allowed_labels)
        if not name or not label:
            continue
        registered = _register_entity(
            registry,
            name,
            label,
            0.84,
            "discogs",
            source_url=_clean(item.get("resource_url") or item.get("uri")),
            evidence=" ".join(part for part in [_clean(item.get("country")), _clean(item.get("year")), _clean(item.get("format"))] if part),
            properties={
                "discogs_url": _clean(item.get("resource_url") or item.get("uri")),
                "country": _clean(item.get("country")),
                "year": _clean(item.get("year")),
                "format": _clean(item.get("format")),
            },
            allowed_labels=allowed_labels,
        )
        if not registered:
            continue
        counts["discogs"] += 1
        _register_property(properties, name, "discogs_url", _clean(item.get("resource_url") or item.get("uri")), "discogs", 0.82, "", _clean(item.get("resource_url") or item.get("uri")))
        _register_property(properties, name, "year", _clean(item.get("year")), "discogs", 0.78, "", _clean(item.get("resource_url") or item.get("uri")))
    return counts


def _load_spacy() -> tuple[Any | None, str | None, str | None]:
    global _NLP, _MODEL_NAME, _MODEL_ERROR
    if _NLP is not None or _MODEL_ERROR is not None:
        return _NLP, _MODEL_NAME, _MODEL_ERROR

    for model_name in MODEL_CANDIDATES:
        if importlib.util.find_spec(model_name) is None:
            continue
        try:
            _NLP = spacy.load(model_name)
            _MODEL_NAME = model_name
            _MODEL_ERROR = None
            return _NLP, _MODEL_NAME, None
        except Exception as error:
            _MODEL_ERROR = str(error)

    _MODEL_ERROR = _MODEL_ERROR or "no_spacy_model_installed"
    return None, None, _MODEL_ERROR


def _extract_spacy_entities(
    text: str,
    allowed_labels: set[str],
    registry: dict[str, dict[str, Any]],
) -> tuple[int, str | None]:
    nlp, _, model_error = _load_spacy()
    if not nlp:
        return 0, model_error

    count = 0
    doc = nlp(text)
    for ent in doc.ents:
        if ent.label_ not in SPACY_LABELS:
            continue
        sentence = _compact(ent.sent.text if ent.sent is not None else _sentence_for_offset(text, ent.start_char, ent.end_char))
        label = _contextual_label(ent.text, ent.label_, sentence)
        registered = _register_entity(
            registry,
            ent.text,
            label,
            0.76,
            "spacy",
            evidence=sentence,
            span=(ent.start_char, ent.end_char),
            properties={"spacy_label": ent.label_},
            allowed_labels=allowed_labels,
        )
        if registered:
            count += 1
    return count, None


def _entity_lookup(registry: dict[str, dict[str, Any]], name: str) -> dict[str, Any] | None:
    normalized = _normalize(name)
    if not normalized:
        return None
    return registry.get(normalized)


def _extract_relations_and_properties(text: str, registry: dict[str, dict[str, Any]], relations: list[dict[str, Any]], properties: list[dict[str, Any]]) -> int:
    count = 0
    for sentence in _sentence_split(text):
        if len(sentence) > 300:
            continue
        for relation_pattern in RELATION_PATTERNS:
            for match in relation_pattern["pattern"].finditer(sentence):
                left_text = _compact(match.group("left"))
                right_text = _compact(match.group("right"))
                left = _entity_lookup(registry, left_text)
                right = _entity_lookup(registry, right_text)
                if not left or not right:
                    continue
                if _clean(left.get("label")) not in relation_pattern["left_label"]:
                    continue
                if _clean(right.get("label")) not in relation_pattern["right_label"]:
                    continue
                _register_relation(relations, relation_pattern["type"], left, right, 0.72, "spacy", sentence)
                if relation_pattern["type"] == "alias_of":
                    _register_property(properties, left["text"], "alias", right["text"], "spacy", 0.72, sentence)
                count += 1
    return count


def _dedupe_entities(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        entities,
        key=lambda item: (-float(item.get("confidence") or 0.0), _clean(item.get("label")), _clean(item.get("text"))),
    )


class EntityServiceHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            _, model_name, model_error = _load_spacy()
            _json_response(
                self,
                200,
                {
                    "ok": model_error is None,
                    "service": "groovegraph-entity-service",
                    "mode": "source_backed_plus_spacy",
                    "spacy_model": model_name,
                    "spacy_error": model_error,
                },
            )
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

        known_count = _scan_known_entities(text, known_entities, allowed_labels, registry)
        structured_counts = _extract_structured_sources(payload, allowed_labels, registry, properties)
        spacy_count, model_error = _extract_spacy_entities(text, allowed_labels, registry)
        relation_count = _extract_relations_and_properties(text, registry, relations, properties)

        body = {
            "entities": _dedupe_entities(list(registry.values()))[:120],
            "relations": relations[:80],
            "properties": properties[:160],
            "diagnostics": {
                "allowed_labels": sorted(allowed_labels),
                "known_entities": len(known_entities),
                "registered_entities": len(registry),
                "structured_entities": structured_counts,
                "graph_context_entities": known_count,
                "spacy_entities": spacy_count,
                "relation_count": relation_count,
                "property_count": len(properties),
                "used_heuristics": False,
                "mode": "source_backed_plus_spacy",
                "spacy_model": _MODEL_NAME,
                "spacy_error": model_error,
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
