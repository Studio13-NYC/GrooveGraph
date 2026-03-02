# Rules and Standards

This document catalogs all Cursor rules and coding/layout standards for GrooveGraph so contributors and tooling have one place to look.

---

## Cursor rules (`.cursor/rules/`)

| Rule file | Purpose | Applies to |
|-----------|---------|------------|
| **mermaid-diagrams.mdc** | When creating or editing Mermaid in docs: render diagram to PNG, place image first, put Mermaid source in a collapsible `<details>` section. Use paths under `docs/images/`. | `**/*.md` |
| **oop-domain.mdc** | Domain layer OOP: entities and relationships as classes, one file per type, inheritance from GraphNode/GraphEdge, split layout (`entities/`, `relationships/`), typed properties. Reference DOMAIN_MODEL for fields and edge semantics. | `src/domain/**/*.ts` |

---

## Coding and layout standards

### TypeScript

- Use **strict** mode (no implicit any, strict null checks).
- No runtime dependency on Graphiti or agent-memory features.

### Domain layer

- **One class per file**: Each entity type (Artist, Track, Album, Instrument, etc.) and each relationship type (PerformedBy, RecordedAt, etc.) has its own file.
- **Layout**: Entity classes in `src/domain/entities/`; relationship classes in `src/domain/relationships/`; base types (GraphNode, GraphEdge) in `src/domain/`.
- **Inheritance**: Entity classes extend the base graph node type; relationship classes extend the base graph edge type. Use further inheritance where it clarifies the model (e.g. PhysicalArtifact for Instrument/Equipment).
- **Typed properties**: Prefer typed fields on the class for core attributes. Use `properties` or `meta` only for extensibility (e.g. provenance).
- **Authority**: Property lists and edge semantics are defined in [DOMAIN_MODEL.md](DOMAIN_MODEL.md).

### Diagrams (Mermaid)

- Store Mermaid source in `docs/images/*.mmd`.
- Render to `docs/images/*.png` (e.g. `npx @mermaid-js/mermaid-cli -i docs/images/<name>.mmd -o docs/images/<name>.png -e png`).
- In markdown: image first, then `<details><summary>Mermaid source</summary>` with the fenced Mermaid block.
