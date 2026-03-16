# GrooveGraph ontology

Formal graph schema for music entities and relationships. Used by the LLM for **search** and **enrichment**, and by validation to enforce which relationship types can connect which entity types.

The human-oriented domain (node labels, properties, edge semantics) is in [DOMAIN_MODEL.md](DOMAIN_MODEL.md). This document describes the **JSON schema** and how it encodes **relationship constraints** and **container** semantics.

---

## Schema location and format

- **Canonical schema**: [data/ontology/schema.json](../data/ontology/schema.json) (JSON).
- **Loader**: Runtime loading is implemented in `src/ontology/schema.ts` (`loadOntologySchema()`), and consumed by LLM context generation in `src/enrichment/llm/ontology-context.ts`. `src/enrichment/extraction/ontology-normalize-ir.ts` also consumes ontology constraints during extraction normalization.

Schema contents:

| Section | Purpose |
|--------|--------|
| **entities** | Entity/class definitions: label, displayName, descriptionNoun, properties, displayPropertyKeys, **allowedRelationshipsAsSubject** / **allowedRelationshipsAsObject**, constraints (e.g. primaryDisplayProperty), synonyms. Optional **contextMessage** for the LLM. |
| **relationships** | Relationship type, description, **subjectLabels**, **objectLabels**, synonyms. Optional **contextMessage**. |
| **identityRules** | Dual-identity rules (e.g. Artist + Person as one node). |
| **labelSynonyms** | Map from alias to canonical entity label (e.g. `"song"` → `"Track"`). |

---

## Relationship constraints (subject and object types)

Relationships are **directed**: subject → object. The schema restricts which entity types can be **subject** (source) and **object** (target) of each relationship type.

- **subjectLabels**: Entity labels that can be the **from** node.
- **objectLabels**: Entity labels that can be the **to** node.

Validation and LLM prompts use these to:
- Reject or coerce invalid edges (e.g. CONTAINS from Track to Artist).
- Guide the model (e.g. “CONTAINS: subject must be Album or Playlist; object must be Track or SongWork”).

Examples from the schema:

| Relationship | Typical subject(s) | Typical object(s) |
|--------------|--------------------|-------------------|
| CONTAINS | Album, Playlist | Track, SongWork |
| PERFORMED_BY | Track | Artist |
| RELEASED_ON | Track | Album |
| MEMBER_OF | Person | Artist |
| PART_OF_GENRE | Artist, Track, SongWork | Genre |

See [data/ontology/schema.json](../data/ontology/schema.json) for the full list.

---

## Container entities (what can “contain” other nodes)

**Containers** are entity types that can be the **subject** of **CONTAINS**: they hold other nodes as members or list items.

| Container entity | Can contain (object of CONTAINS) |
|------------------|-----------------------------------|
| **Album** | Track, SongWork |
| **Playlist** | Track |

So:
- **Album** and **Playlist** are the only container types in the ontology.
- **Track** and **SongWork** are the only types that can be the **object** of CONTAINS (they can appear inside an album or playlist).

Other relationships (e.g. RELEASED_ON, RECORDED_IN_SESSION) link entities but do not define a “container” in this sense; the schema reserves that for CONTAINS.

---

## Entity definitions (summary)

Each key in **entities** is the canonical label. Each value includes:

- **displayName**, **descriptionNoun**, **description**: For UI and prompts.
- **displayPropertyKeys**: Ordered list of property keys used for display (e.g. `["name"]`, `["title", "name"]`).
- **properties**: Optional list of `{ key, type?, required?, description? }`.
- **allowedRelationshipsAsSubject**: Relationship types this entity can have as **subject** (outbound).
- **allowedRelationshipsAsObject**: Relationship types this entity can have as **object** (inbound).
- **constraints**: e.g. **primaryDisplayProperty** for derived candidates (name, title, or role_name).
- **synonyms**: Aliases the LLM can use (e.g. band, musician for Artist).

---

## Relationship definitions (summary)

Each item in **relationships** has:

- **type**: Canonical relationship type (e.g. CONTAINS, MEMBER_OF).
- **description**: Short sentence for the LLM.
- **subjectLabels** / **objectLabels**: Allowed entity labels for subject and object.
- **synonyms**: Optional aliases.

---

## Context messages for the system prompt

Entities and relationships can define an optional **contextMessage**. These are combined and appended to the LLM system message so the model gets per-entity and per-relationship guidance (when to use, examples, pitfalls). If the pipeline uses the formal ontology, it can add a section “Entity context” and “Relationship context” with one block per entity/relationship that has a contextMessage.

---

## Using the ontology in the app

1. **Load schema**: From `data/ontology/schema.json` (or via a loader in `src/lib/ontology/` if added). For LLM prompts, build a text summary or structured context from the schema.
2. **Validation**: Before creating edges, check that the subject label is in **relationship.subjectLabels** and the object label is in **relationship.objectLabels** for that relationship type.
3. **Containers**: To test “is this entity a container?”, check whether it is a valid **subject** of CONTAINS (Album, Playlist).

---

## Keeping in sync

- **DOMAIN_MODEL.md** remains the single source of truth for the *human* graph model (labels, properties, edge semantics). The JSON schema is the **machine-readable** derivative that adds subject/object constraints and container semantics.
- Runtime config in `src/lib/entity-config.ts` and `src/lib/relationship-config.ts` is still used by `buildResearchOntologyContext()`. When adding entities or relationships, update **DOMAIN_MODEL.md** first, then **data/ontology/schema.json** (and optionally the TS config until the app is fully ontology-driven).
