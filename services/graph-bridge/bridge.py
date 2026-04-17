from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CLI_SRC = ROOT / "cli" / "src"
ENV_PATH = ROOT / ".env"
if str(CLI_SRC) not in sys.path:
    sys.path.insert(0, str(CLI_SRC))

from groovegraph.typedb_config import TypeDbConnectionParams, read_typedb_connection_params
from groovegraph.typedb_session import open_typedb_driver, run_schema_define


SCHEMA_PATH = ROOT / "typedb" / "groovegraph-reset-schema.tql"
REQUIRED_ENTITY_TYPES = {
    "gg-artist",
    "gg-recording",
    "gg-studio",
    "gg-equipment",
    "gg-person",
    "gg-evidence",
    "gg-source",
    "gg-run",
}

LABEL_TO_ENTITY: dict[str, str] = {
    "Artist": "gg-artist",
    "Recording": "gg-recording",
    "Studio": "gg-studio",
    "Equipment": "gg-equipment",
    "Person": "gg-person",
    "Evidence": "gg-evidence",
    "Source": "gg-source",
    "Run": "gg-run",
}
ENTITY_TO_LABEL = {value: key for key, value in LABEL_TO_ENTITY.items()}

ENTITY_ROLE_IN_RUN = {
    "gg-artist": "artist",
    "gg-recording": "recording",
    "gg-studio": "studio",
    "gg-equipment": "equipment",
    "gg-person": "person",
}

ENTITY_ROLE_IN_EVIDENCE = {
    "gg-artist": "subject-artist",
    "gg-recording": "subject-recording",
    "gg-studio": "subject-studio",
    "gg-equipment": "subject-equipment",
    "gg-person": "subject-person",
}

RELATION_SPECS = {
    "artist_recording": {
        "typedb_type": "gg-rel-artist-recording",
        "left_type": "gg-artist",
        "left_role": "artist",
        "right_type": "gg-recording",
        "right_role": "recording",
    },
    "recording_studio": {
        "typedb_type": "gg-rel-recording-studio",
        "left_type": "gg-recording",
        "left_role": "recording",
        "right_type": "gg-studio",
        "right_role": "studio",
    },
    "recording_equipment": {
        "typedb_type": "gg-rel-recording-equipment",
        "left_type": "gg-recording",
        "left_role": "recording",
        "right_type": "gg-equipment",
        "right_role": "equipment",
    },
    "person_recording": {
        "typedb_type": "gg-rel-person-recording",
        "left_type": "gg-person",
        "left_role": "person",
        "right_type": "gg-recording",
        "right_role": "recording",
    },
}

QUERY_LIMIT = 250
_ENV_LOADED = False


@dataclass(frozen=True)
class EntityRef:
    entity_type: str
    name: str
    normalized_name: str


def _read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    return json.loads(raw or "{}")


def _json_out(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))


def _normalize_name(value: str) -> str:
    lowered = value.casefold()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    return lowered.strip("-")[:120] or "untitled"


def _escape_tql(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _load_repo_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED or not ENV_PATH.exists():
        _ENV_LOADED = True
        return
    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)
    _ENV_LOADED = True


def _read_reset_params() -> TypeDbConnectionParams:
    _load_repo_env()
    params = read_typedb_connection_params()
    database = (
        os.environ.get("GG_RESET_TYPEDB_DATABASE", "").strip()
        or os.environ.get("TYPEDB_RESET_DATABASE", "").strip()
        or "groovegraph_reset"
    )
    return TypeDbConnectionParams(
        address=params.address,
        username=params.username,
        password=params.password,
        database=database,
    )


def _database_exists(driver: Any, database: str) -> bool:
    return bool(driver.databases.contains(database))


def _database_names(driver: Any) -> list[str]:
    return sorted(db.name for db in driver.databases.all())


def _schema_ready(driver: Any, database: str) -> bool:
    if not _database_exists(driver, database):
        return False
    text = driver.databases.get(database).type_schema()
    return all(entity_type in text for entity_type in REQUIRED_ENTITY_TYPES)


def _init_reset_db() -> dict[str, Any]:
    params = _read_reset_params()
    created = False
    defined = False

    with open_typedb_driver(params) as driver:
        if not _database_exists(driver, params.database):
            driver.databases.create(params.database)
            created = True

        if not _schema_ready(driver, params.database):
            run_schema_define(
                driver,
                database=params.database,
                define_typeql=SCHEMA_PATH.read_text(encoding="utf-8"),
            )
            defined = True

        return {
            "ok": True,
            "database": params.database,
            "created": created,
            "schema_applied": defined,
            "schema_ready": _schema_ready(driver, params.database),
        }


def _health() -> dict[str, Any]:
    try:
        params = _read_reset_params()
    except Exception as error:
        return {
            "ok": False,
            "configured": False,
            "service": "graph-bridge",
            "errors": [str(error)],
            "warnings": [],
        }

    try:
        with open_typedb_driver(params) as driver:
            exists = _database_exists(driver, params.database)
            ready = _schema_ready(driver, params.database) if exists else False
            warnings: list[str] = []
            if not exists:
                warnings.append("reset_database_missing")
            if exists and not ready:
                warnings.append("reset_schema_missing")
            return {
                "ok": True,
                "configured": True,
                "service": "graph-bridge",
                "database": params.database,
                "database_exists": exists,
                "schema_ready": ready,
                "known_databases": _database_names(driver),
                "warnings": warnings,
                "errors": [],
            }
    except Exception as error:
        return {
            "ok": False,
            "configured": True,
            "service": "graph-bridge",
            "database": params.database,
            "warnings": [],
            "errors": [str(error)],
        }


def _run_read(tx: Any, query: str) -> list[dict[str, Any]]:
    answer = tx.query(query).resolve()
    if not getattr(answer, "is_concept_rows", lambda: False)():
        return []
    rows: list[dict[str, Any]] = []
    for row in answer.as_concept_rows():
        out: dict[str, Any] = {}
        for column in row.column_names():
            concept = row.get(column)
            if concept is None:
                continue
            if concept.is_attribute():
                out[column] = concept.as_attribute().get_value()
            elif concept.is_entity():
                out[column] = concept.as_entity().get_type().get_label()
            elif concept.is_relation():
                out[column] = concept.as_relation().get_type().get_label()
        rows.append(out)
    return rows


def _score_name_match(question: str, candidate_name: str) -> int:
    question_tokens = {token for token in re.findall(r"[a-z0-9]+", question.casefold()) if len(token) >= 3}
    candidate_tokens = {token for token in re.findall(r"[a-z0-9]+", candidate_name.casefold()) if len(token) >= 3}
    if not question_tokens or not candidate_tokens:
        return 0
    return len(question_tokens & candidate_tokens)


def _entity_catalog_rows(tx: Any, entity_type: str) -> list[dict[str, Any]]:
    query = "\n".join(
        [
            "match",
            f"  $e isa {entity_type}, has name $name, has normalized-name $normalized, has draft-status $draft;",
            "select $name, $normalized, $draft;",
            f"limit {QUERY_LIMIT};",
        ]
    )
    return _run_read(tx, query)


def _collect_focal_refs(tx: Any, question: str) -> list[EntityRef]:
    candidates: list[tuple[int, EntityRef]] = []
    for entity_type in ("gg-artist", "gg-recording"):
        for row in _entity_catalog_rows(tx, entity_type):
            name = str(row.get("name") or "")
            normalized = str(row.get("normalized") or _normalize_name(name))
            score = _score_name_match(question, name)
            if score <= 0:
                continue
            candidates.append((score, EntityRef(entity_type=entity_type, name=name, normalized_name=normalized)))

    candidates.sort(key=lambda item: (-item[0], item[1].name.casefold()))
    focal_refs: list[EntityRef] = []
    seen: set[tuple[str, str]] = set()
    for _, ref in candidates:
        key = (ref.entity_type, ref.normalized_name)
        if key in seen:
            continue
        seen.add(key)
        focal_refs.append(ref)
        if len(focal_refs) >= 4:
            break
    return focal_refs


def _subject_filter_clause(refs: list[EntityRef], *, variable: str) -> str:
    branches = [
        f'{{ {variable} has normalized-name "{_escape_tql(ref.normalized_name)}"; }}'
        for ref in refs
    ]
    if not branches:
        return ""
    return "  " + " or ".join(branches) + ";"


def _relation_rows(tx: Any, relation_key: str, focal_refs: list[EntityRef]) -> list[dict[str, Any]]:
    spec = RELATION_SPECS[relation_key]
    left_var = "$left"
    right_var = "$right"
    query_lines = [
        "match",
        f"  {left_var} isa {spec['left_type']}, has name $left_name, has normalized-name $left_normalized, has draft-status $left_draft;",
        f"  {right_var} isa {spec['right_type']}, has name $right_name, has normalized-name $right_normalized, has draft-status $right_draft;",
        f"  ({spec['left_role']}: {left_var}, {spec['right_role']}: {right_var}) isa {spec['typedb_type']}, has draft-status $rel_draft, has run-id $run_id;",
    ]
    if focal_refs:
        query_lines.append(_subject_filter_clause(focal_refs, variable=left_var))
        if spec["right_type"] in {"gg-recording", "gg-artist"}:
            query_lines.append(_subject_filter_clause(focal_refs, variable=right_var))
    query_lines.extend(
        [
            "select $left_name, $left_normalized, $left_draft, $right_name, $right_normalized, $right_draft, $rel_draft, $run_id;",
            f"limit {QUERY_LIMIT};",
        ]
    )
    return _run_read(tx, "\n".join(line for line in query_lines if line))


def _evidence_rows(tx: Any, focal_refs: list[EntityRef]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entity_type, role in ENTITY_ROLE_IN_EVIDENCE.items():
        refs = [ref for ref in focal_refs if ref.entity_type == entity_type]
        if not refs:
            continue
        query = "\n".join(
            [
                "match",
                f"  $subject isa {entity_type}, has name $subject_name, has normalized-name $subject_normalized;",
                _subject_filter_clause(refs, variable="$subject"),
                '  $evidence isa gg-evidence, has name $evidence_name, has evidence-snippet $snippet, has source-url $source_url, has external-source $external_source, has draft-status $evidence_draft;',
                f"  ({role}: $subject, evidence: $evidence) isa gg-rel-entity-evidence, has draft-status $rel_draft;",
                "select $subject_name, $subject_normalized, $evidence_name, $snippet, $source_url, $external_source, $evidence_draft, $rel_draft;",
                f"limit {QUERY_LIMIT};",
            ]
        )
        rows.extend(_run_read(tx, query))
    return rows


def _entity_status_to_graph(status: str) -> str:
    return "draft_added" if status == "pending" else "existing"


def _build_graph(tx: Any, focal_refs: list[EntityRef], *, warnings: list[str] | None = None) -> dict[str, Any]:
    warnings = list(warnings or [])
    node_map: dict[str, dict[str, Any]] = {}
    edge_map: dict[str, dict[str, Any]] = {}

    def ensure_node(entity_type: str, name: str, normalized_name: str, draft_status: str) -> str:
        label = ENTITY_TO_LABEL[entity_type]
        node_id = f"{label.lower()}:{normalized_name}"
        status = _entity_status_to_graph(draft_status)
        node = node_map.setdefault(
            node_id,
            {
                "id": node_id,
                "label": name,
                "type": label,
                "status": status,
                "source_flags": ["graph_context"],
                "degree_hint": 0,
                "metadata_preview": {
                    "normalized_name": normalized_name,
                    "draft_status": draft_status,
                    "evidence_snippets": [],
                    "source_urls": [],
                },
            },
        )
        node["metadata_preview"]["draft_status"] = draft_status
        node["label"] = name
        node["status"] = "draft_added" if node["status"] == "draft_added" or status == "draft_added" else "existing"
        return node_id

    def ensure_edge(source_id: str, target_id: str, edge_type: str, status: str, provenance_hint: str) -> None:
        edge_id = f"{edge_type}:{source_id}:{target_id}"
        if edge_id in edge_map:
            return
        edge_map[edge_id] = {
            "id": edge_id,
            "source": source_id,
            "target": target_id,
            "type": edge_type,
            "status": _entity_status_to_graph(status),
            "provenance_hint": provenance_hint,
        }
        node_map[source_id]["degree_hint"] += 1
        node_map[target_id]["degree_hint"] += 1

    for relation_key in RELATION_SPECS:
        for row in _relation_rows(tx, relation_key, focal_refs):
            spec = RELATION_SPECS[relation_key]
            left_id = ensure_node(
                spec["left_type"],
                str(row["left_name"]),
                str(row["left_normalized"]),
                str(row["left_draft"]),
            )
            right_id = ensure_node(
                spec["right_type"],
                str(row["right_name"]),
                str(row["right_normalized"]),
                str(row["right_draft"]),
            )
            ensure_edge(left_id, right_id, relation_key, str(row["rel_draft"]), str(row.get("run_id") or "graph_context"))

    if not edge_map:
        for ref in focal_refs:
            query = "\n".join(
                [
                    "match",
                    f'  $e isa {ref.entity_type}, has name $name, has normalized-name "{_escape_tql(ref.normalized_name)}", has draft-status $draft;',
                    "select $name, $draft;",
                    "limit 1;",
                ]
            )
            rows = _run_read(tx, query)
            if rows:
                ensure_node(ref.entity_type, str(rows[0]["name"]), ref.normalized_name, str(rows[0]["draft"]))

    evidence_rows = _evidence_rows(tx, focal_refs)
    for row in evidence_rows:
        subject_id = None
        normalized_name = str(row["subject_normalized"])
        for node in node_map.values():
            if node["metadata_preview"].get("normalized_name") == normalized_name:
                subject_id = node["id"]
                break
        if not subject_id:
            continue
        metadata = node_map[subject_id]["metadata_preview"]
        snippets = metadata.setdefault("evidence_snippets", [])
        urls = metadata.setdefault("source_urls", [])
        snippets.append(
            {
                "name": row["evidence_name"],
                "snippet": row["snippet"],
                "source": row["external_source"],
            }
        )
        if row["source_url"] and row["source_url"] not in urls:
            urls.append(row["source_url"])
        source_flags = node_map[subject_id]["source_flags"]
        source_name = str(row["external_source"])
        if source_name and source_name not in source_flags:
            source_flags.append(source_name)

    focal_ids = []
    for ref in focal_refs:
        label = ENTITY_TO_LABEL[ref.entity_type].lower()
        node_id = f"{label}:{ref.normalized_name}"
        if node_id in node_map:
            focal_ids.append(node_id)

    filters = sorted({node["type"] for node in node_map.values()})
    return {
        "nodes": list(node_map.values()),
        "edges": list(edge_map.values()),
        "view": {
            "focal_ids": focal_ids,
            "filters": filters,
            "legend": [
                {"key": "existing", "label": "Existing"},
                {"key": "draft_added", "label": "Draft Added"},
                {"key": "candidate_rejected", "label": "Candidate Rejected"},
                {"key": "candidate_unpersisted", "label": "Candidate Unpersisted"},
            ],
            "counts": {"nodes": len(node_map), "edges": len(edge_map)},
        },
        "warnings": warnings,
    }


def _context(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question") or "")
    health = _health()
    if not health.get("ok"):
        return {
            "nodes": [],
            "edges": [],
            "view": {
                "focal_ids": [],
                "filters": [],
                "legend": [],
                "counts": {"nodes": 0, "edges": 0},
            },
            "warnings": list(health.get("warnings", [])),
            "errors": list(health.get("errors", [])),
        }
    if not health.get("database_exists") or not health.get("schema_ready"):
        warnings = list(health.get("warnings", []))
        return {
            "nodes": [],
            "edges": [],
            "view": {
                "focal_ids": [],
                "filters": [],
                "legend": [],
                "counts": {"nodes": 0, "edges": 0},
            },
            "warnings": warnings,
            "errors": [],
        }

    params = _read_reset_params()
    with open_typedb_driver(params) as driver:
        from typedb.api.connection.transaction import TransactionType
        with driver.transaction(params.database, TransactionType.READ) as tx:
            focal_refs = _collect_focal_refs(tx, question)
            return _build_graph(tx, focal_refs, warnings=list(health.get("warnings", [])))


def _match_existing_entity(tx: Any, entity_type: str, normalized_name: str) -> dict[str, Any] | None:
    query = "\n".join(
        [
            "match",
            f'  $e isa {entity_type}, has name $name, has normalized-name "{_escape_tql(normalized_name)}", has draft-status $draft;',
            "select $name, $draft;",
            "limit 1;",
        ]
    )
    rows = _run_read(tx, query)
    if not rows:
        return None
    row = rows[0]
    return {"name": str(row["name"]), "draft_status": str(row["draft"])}


def _insert_entity_query(entity_type: str, name: str, normalized_name: str, summary: str, run_id: str, external_source: str | None = None, source_url: str | None = None) -> str:
    lines = [
        "insert",
        f"  $x isa {entity_type},",
        f'    has name "{_escape_tql(name)}",',
        f'    has normalized-name "{_escape_tql(normalized_name)}",',
        '    has draft-status "pending",',
        f'    has summary "{_escape_tql(summary)}"',
    ]
    if external_source:
        lines[-1] += ","
        lines.append(f'    has external-source "{_escape_tql(external_source)}"')
    if source_url:
        lines[-1] += ","
        lines.append(f'    has source-url "{_escape_tql(source_url)}"')
    lines[-1] += ";"
    return "\n".join(lines)


def _insert_run_query(run_id: str, summary: str) -> str:
    return "\n".join(
        [
            "insert",
            "  $r isa gg-run,",
            f'    has run-id "{_escape_tql(run_id)}",',
            '    has draft-status "pending",',
            f'    has summary "{_escape_tql(summary)}";',
        ]
    )


def _entity_match_clause(ref: dict[str, Any], *, variable: str) -> str:
    return "\n".join(
        [
            f'  {variable} isa {ref["typedb_type"]},',
            f'    has normalized-name "{_escape_tql(ref["normalized_name"])}";',
        ]
    )


def _insert_run_subject_query(run_id: str, ref: dict[str, Any]) -> str:
    role = ENTITY_ROLE_IN_RUN.get(ref["typedb_type"])
    if not role:
        return ""
    return "\n".join(
        [
            "match",
            f'  $run isa gg-run, has run-id "{_escape_tql(run_id)}";',
            _entity_match_clause(ref, variable="$subject"),
            "insert",
            f'  (run: $run, {role}: $subject) isa gg-rel-run-subject,',
            f'    has summary "Run subject for {_escape_tql(ref["name"])}";',
        ]
    )


def _insert_evidence_query(evidence_id: str, item: dict[str, Any]) -> str:
    summary = str(item.get("summary") or item.get("snippet") or f'Evidence from {item.get("source", "unknown")}')
    lines = [
        "insert",
        "  $e isa gg-evidence,",
        f'    has name "{_escape_tql(str(item.get("name") or evidence_id))}",',
        f'    has normalized-name "{_escape_tql(_normalize_name(evidence_id))}",',
        '    has draft-status "pending",',
        f'    has summary "{_escape_tql(summary)}",',
        f'    has external-source "{_escape_tql(str(item.get("source") or "unknown"))}",',
        f'    has evidence-snippet "{_escape_tql(str(item.get("snippet") or ""))}",',
        f'    has source-url "{_escape_tql(str(item.get("source_url") or ""))}"',
    ]
    lines[-1] += ";"
    return "\n".join(lines)


def _insert_entity_evidence_query(run_id: str, ref: dict[str, Any], evidence_id: str) -> str:
    role = ENTITY_ROLE_IN_EVIDENCE[ref["typedb_type"]]
    return "\n".join(
        [
            "match",
            _entity_match_clause(ref, variable="$subject"),
            '  $evidence isa gg-evidence, has normalized-name "' + _escape_tql(_normalize_name(evidence_id)) + '";',
            "insert",
            f'  ({role}: $subject, evidence: $evidence) isa gg-rel-entity-evidence,',
            f'    has run-id "{_escape_tql(run_id)}",',
            '    has draft-status "pending",',
            f'    has summary "Evidence attached during run {_escape_tql(run_id)}";',
        ]
    )


def _insert_relation_query(run_id: str, relation: dict[str, Any], ref_map: dict[str, dict[str, Any]]) -> str:
    spec = RELATION_SPECS[relation["kind"]]
    left_ref = ref_map[relation["left_ref"]]
    right_ref = ref_map[relation["right_ref"]]
    lines = [
        "match",
        _entity_match_clause(left_ref, variable="$left"),
        _entity_match_clause(right_ref, variable="$right"),
        "insert",
        f'  ({spec["left_role"]}: $left, {spec["right_role"]}: $right) isa {spec["typedb_type"]},',
        f'    has run-id "{_escape_tql(run_id)}",',
        '    has draft-status "pending",',
    ]
    if relation["kind"] == "person_recording" and relation.get("role_name"):
        lines.append(f'    has role-name "{_escape_tql(str(relation["role_name"]))}",')
    lines.append(f'    has summary "{_escape_tql(str(relation.get("summary") or relation["kind"]))}";')
    return "\n".join(lines)


def _existing_relation(tx: Any, relation: dict[str, Any], ref_map: dict[str, dict[str, Any]]) -> bool:
    spec = RELATION_SPECS[relation["kind"]]
    left_ref = ref_map[relation["left_ref"]]
    right_ref = ref_map[relation["right_ref"]]
    query = "\n".join(
        [
            "match",
            _entity_match_clause(left_ref, variable="$left"),
            _entity_match_clause(right_ref, variable="$right"),
            f"  ({spec['left_role']}: $left, {spec['right_role']}: $right) isa {spec['typedb_type']};",
            "select $left;",
            "limit 1;",
        ]
    )
    rows = _run_read(tx, query)
    return bool(rows)


def _graph_from_run(tx: Any, run_id: str, warnings: list[str] | None = None) -> dict[str, Any]:
    focal_refs: list[EntityRef] = []
    query = "\n".join(
        [
            "match",
            f'  $run isa gg-run, has run-id "{_escape_tql(run_id)}";',
            "  {",
            "    $subject isa gg-artist, has name $name, has normalized-name $normalized;",
            "    (run: $run, artist: $subject) isa gg-rel-run-subject;",
            "  } or {",
            "    $subject isa gg-recording, has name $name, has normalized-name $normalized;",
            "    (run: $run, recording: $subject) isa gg-rel-run-subject;",
            "  } or {",
            "    $subject isa gg-studio, has name $name, has normalized-name $normalized;",
            "    (run: $run, studio: $subject) isa gg-rel-run-subject;",
            "  } or {",
            "    $subject isa gg-equipment, has name $name, has normalized-name $normalized;",
            "    (run: $run, equipment: $subject) isa gg-rel-run-subject;",
            "  } or {",
            "    $subject isa gg-person, has name $name, has normalized-name $normalized;",
            "    (run: $run, person: $subject) isa gg-rel-run-subject;",
            "  };",
            "select $subject, $name, $normalized;",
            f"limit {QUERY_LIMIT};",
        ]
    )
    for row in _run_read(tx, query):
        entity_type = str(row.get("subject") or "")
        if entity_type not in ENTITY_TO_LABEL:
            continue
        focal_refs.append(
            EntityRef(
                entity_type=entity_type,
                name=str(row["name"]),
                normalized_name=str(row["normalized"]),
            )
        )
    return _build_graph(tx, focal_refs, warnings=warnings)


def _persist(payload: dict[str, Any]) -> dict[str, Any]:
    health = _health()
    warnings = list(health.get("warnings", []))
    if not health.get("ok") or not health.get("database_exists") or not health.get("schema_ready"):
        return {
            "ok": False,
            "mode": "typedb_persist",
            "nodes": [],
            "edges": [],
            "warnings": warnings,
            "errors": list(health.get("errors", [])) or ["typedb_reset_not_ready"],
            "graph": {
                "nodes": [],
                "edges": [],
                "view": {"focal_ids": [], "filters": [], "legend": [], "counts": {"nodes": 0, "edges": 0}},
            },
        }

    run_id = str(payload.get("run_id") or "")
    decision = str(payload.get("decision") or "skip_persist")
    summary = str(payload.get("summary") or f"Run {run_id}")
    nodes = list(payload.get("nodes", []))
    relations = list(payload.get("relations", []))
    evidence_records = list(payload.get("evidence_records", []))

    params = _read_reset_params()
    from typedb.api.connection.transaction import TransactionType

    with open_typedb_driver(params) as driver:
        with driver.transaction(params.database, TransactionType.READ) as tx:
            existing_ref_map: dict[str, dict[str, Any]] = {}
            for node in nodes:
                typedb_type = str(node["typedb_type"])
                normalized_name = str(node["normalized_name"])
                existing = _match_existing_entity(tx, typedb_type, normalized_name)
                existing_ref_map[str(node["ref"])] = {
                    "ref": str(node["ref"]),
                    "typedb_type": typedb_type,
                    "normalized_name": normalized_name,
                    "name": existing["name"] if existing else str(node["name"]),
                    "status": "existing" if existing else "draft_added",
                    "exists": bool(existing),
                    "summary": str(node.get("summary") or summary),
                    "external_source": str(node.get("external_source") or "") or None,
                    "source_url": str(node.get("source_url") or "") or None,
                }

            if nodes and not relations and not any(ref["exists"] for ref in existing_ref_map.values()):
                return {
                    "ok": False,
                    "mode": "typedb_persist",
                    "nodes": [],
                    "edges": [],
                    "warnings": warnings,
                    "errors": ["no_orphan_rule_blocked_write"],
                    "graph": _build_graph(tx, []),
                }

            existing_relation_keys = {
                (relation["kind"], relation["left_ref"], relation["right_ref"])
                for relation in relations
                if _existing_relation(tx, relation, existing_ref_map)
            }

        if decision != "persist_draft":
            with driver.transaction(params.database, TransactionType.READ) as tx:
                graph = _graph_from_run(tx, run_id, warnings=warnings) if run_id else _build_graph(tx, [], warnings=warnings)
            return {
                "ok": True,
                "mode": "typedb_skip_persist",
                "nodes": [],
                "edges": [],
                "warnings": warnings,
                "errors": [],
                "graph": graph,
                "merged_entities": [ref for ref in existing_ref_map.values() if ref["exists"]],
                "created_entities": [],
                "created_relations": [],
                "rejected_candidates": list(payload.get("rejected_candidates", [])),
            }

        queries: list[str] = []
        queries.append(_insert_run_query(run_id, summary))

        for ref in existing_ref_map.values():
            if ref["exists"]:
                continue
            queries.append(
                _insert_entity_query(
                    ref["typedb_type"],
                    ref["name"],
                    ref["normalized_name"],
                    ref["summary"],
                    run_id,
                    ref["external_source"],
                    ref["source_url"],
                )
            )

        for evidence in evidence_records:
            queries.append(_insert_evidence_query(str(evidence["id"]), evidence))

        for ref in existing_ref_map.values():
            run_query = _insert_run_subject_query(run_id, ref)
            if run_query:
                queries.append(run_query)

        for evidence in evidence_records:
            subject_ref = existing_ref_map.get(str(evidence["subject_ref"]))
            if not subject_ref:
                continue
            queries.append(_insert_entity_evidence_query(run_id, subject_ref, str(evidence["id"])))

        created_relations: list[dict[str, Any]] = []
        for relation in relations:
            relation_key = (relation["kind"], relation["left_ref"], relation["right_ref"])
            if relation_key in existing_relation_keys:
                continue
            queries.append(_insert_relation_query(run_id, relation, existing_ref_map))
            created_relations.append(relation)

        if queries:
            from groovegraph.typedb_session import run_write_queries
            run_write_queries(driver, database=params.database, queries=queries)

        with driver.transaction(params.database, TransactionType.READ) as tx:
            graph = _graph_from_run(tx, run_id, warnings=warnings)

        created_entities = [
            {
                "typedb_type": ref["typedb_type"],
                "name": ref["name"],
                "normalized_name": ref["normalized_name"],
            }
            for ref in existing_ref_map.values()
            if not ref["exists"]
        ]
        merged_entities = [
            {
                "typedb_type": ref["typedb_type"],
                "name": ref["name"],
                "normalized_name": ref["normalized_name"],
            }
            for ref in existing_ref_map.values()
            if ref["exists"]
        ]

        return {
            "ok": True,
            "mode": "typedb_persist",
            "nodes": created_entities,
            "edges": created_relations,
            "warnings": warnings,
            "errors": [],
            "graph": graph,
            "merged_entities": merged_entities,
            "created_entities": created_entities,
            "created_relations": created_relations,
            "rejected_candidates": list(payload.get("rejected_candidates", [])),
        }


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = _read_stdin_json()

    if command == "health":
        result = _health()
    elif command == "init":
        result = _init_reset_db()
    elif command == "context":
        result = _context(payload)
    elif command == "persist":
        result = _persist(payload)
    else:
        result = {"ok": False, "error": "unknown_command"}

    _json_out(result)


if __name__ == "__main__":
    main()
