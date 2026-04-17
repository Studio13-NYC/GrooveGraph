# GrooveGraph Entity Service

Local Python extraction service for the monorepo reset.

Current scope:

- `GET /health`
- `POST /extract`
- schema-aware alias extraction using `knownEntities`
- simple capitalized span fallback
- simple `Key: value` property extraction

This service is intentionally small and replaceable. It is the first-pass extractor only.
