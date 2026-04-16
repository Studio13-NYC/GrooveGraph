from __future__ import annotations

from groovegraph.brave_extract_context import build_augmented_extract_text, strip_html_basic


def test_strip_html_basic() -> None:
    assert strip_html_basic("a <strong>b</strong> c") == "a b c"


def test_build_minimal_with_first_title() -> None:
    web = {"ok": True, "body": {"web": {"results": [{"title": "Wiki Title", "description": "ignored in minimal"}]}}}
    t = build_augmented_extract_text("Talking Heads", web, context="minimal")
    assert t.startswith("Talking Heads")
    assert "Wiki Title" in t
    assert "ignored" not in t


def test_build_rich_includes_descriptions() -> None:
    web = {
        "ok": True,
        "body": {
            "web": {
                "results": [
                    {"title": "T1", "description": "D1 with <strong>bold</strong>."},
                    {"title": "T2", "description": "D2"},
                ]
            },
            "videos": {"results": [{"title": "Video A"}]},
        },
    }
    t = build_augmented_extract_text("Q", web, context="rich", max_chars=10_000)
    assert "Q" in t
    assert "T1" in t and "D1" in t and "bold" in t
    assert "T2" in t and "D2" in t
    assert "Video A" in t


def test_build_rich_truncates() -> None:
    long_desc = "x" * 5000
    web = {"ok": True, "body": {"web": {"results": [{"title": "T", "description": long_desc}]}}}
    t = build_augmented_extract_text("Q", web, context="rich", max_chars=100)
    assert len(t) == 100
    assert t.endswith("…")


def test_build_rich_prefix_needle_false_skips_leading_query() -> None:
    web = {
        "ok": True,
        "body": {"web": {"results": [{"title": "Hit", "description": "Body"}]}},
    }
    t = build_augmented_extract_text("Q", web, context="rich", prefix_needle=False)
    assert not t.startswith("Q")
    assert "--- Web excerpts (Brave) ---" in t
    assert "Hit" in t and "Body" in t
