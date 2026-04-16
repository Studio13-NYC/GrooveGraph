"""Configurable limits and optional stimulus stages (env-driven, overridable from CLI)."""

from __future__ import annotations

from dataclasses import dataclass, replace

from groovegraph.env_loader import (
    groovegraph_brave_embed_max_chars,
    groovegraph_canonical_deep_artist_enabled,
    groovegraph_mb_deep_release_cap,
    groovegraph_stimulus_max_chars,
    groovegraph_supplementary_http_fetch_enabled,
    groovegraph_supplementary_http_fetch_max_urls,
    groovegraph_wikipedia_section_max_chars,
)


@dataclass(frozen=True)
class StimulusAssemblyOptions:
    """Single struct passed through search/analyze so flags stay consistent."""

    stimulus_max_chars: int
    wikipedia_section_max_chars: int
    brave_embed_max_chars: int
    fetch_supplementary_pages: bool
    supplementary_max_urls: int
    deep_artist_context: bool
    mb_deep_release_cap: int

    @staticmethod
    def from_env() -> StimulusAssemblyOptions:
        return StimulusAssemblyOptions(
            stimulus_max_chars=groovegraph_stimulus_max_chars(),
            wikipedia_section_max_chars=groovegraph_wikipedia_section_max_chars(),
            brave_embed_max_chars=groovegraph_brave_embed_max_chars(),
            fetch_supplementary_pages=groovegraph_supplementary_http_fetch_enabled(),
            supplementary_max_urls=groovegraph_supplementary_http_fetch_max_urls(),
            deep_artist_context=groovegraph_canonical_deep_artist_enabled(),
            mb_deep_release_cap=groovegraph_mb_deep_release_cap(),
        )

    def with_cli_overrides(
        self,
        *,
        stimulus_max_chars: int | None = None,
        fetch_supplementary_pages: bool | None = None,
        deep_artist_context: bool | None = None,
    ) -> StimulusAssemblyOptions:
        o = self
        if stimulus_max_chars is not None:
            o = replace(o, stimulus_max_chars=stimulus_max_chars)
        if fetch_supplementary_pages is not None:
            o = replace(o, fetch_supplementary_pages=fetch_supplementary_pages)
        if deep_artist_context is not None:
            o = replace(o, deep_artist_context=deep_artist_context)
        return o
