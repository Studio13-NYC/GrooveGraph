"""Merge canonical API text + Brave SERP snippets into one ``POST /extract`` ``text`` blob."""

from __future__ import annotations

from typing import Any

from groovegraph.brave_extract_context import ContextMode, build_augmented_extract_text
from groovegraph.canonical_sources import CanonicalEnrichmentResult, fetch_canonical_enrichment

DEFAULT_STIMULUS_MAX_CHARS = 500_000


def build_extract_stimulus_text(
    needle: str,
    web_report: dict[str, Any] | None,
    *,
    include_web: bool,
    brave_count: int,
    canonical: CanonicalEnrichmentResult | None = None,
    context: ContextMode = "rich",
    stimulus_max_chars: int = DEFAULT_STIMULUS_MAX_CHARS,
    brave_embed_max_chars: int | None = None,
) -> str:
    """
    Build the full stimulus string for entity-service.

    ``canonical`` when provided must already be fetched; when ``None``, fetches via
    ``fetch_canonical_enrichment``.
    """
    can = canonical if canonical is not None else fetch_canonical_enrichment(needle)
    ctext = can.combined_text().strip()
    web_ok = bool(include_web and isinstance(web_report, dict) and web_report.get("ok") is True)
    web_cap = brave_embed_max_chars if brave_embed_max_chars is not None else stimulus_max_chars
    parts: list[str] = []
    if ctext:
        parts.append(ctext)
    if web_ok and web_report is not None:
        parts.append(
            build_augmented_extract_text(
                needle,
                web_report,
                context=context,
                max_web_results=brave_count,
                max_chars=min(stimulus_max_chars, web_cap),
                prefix_needle=not bool(ctext),
            ),
        )
    if not parts:
        return (needle or "").strip()
    return "\n\n".join(parts)


def enrichment_sufficient_for_extract(
    *,
    canonical: CanonicalEnrichmentResult,
    web_ok: bool,
) -> bool:
    """True when at least one enrichment path produced usable content."""
    return bool(canonical.ok_any or web_ok)
