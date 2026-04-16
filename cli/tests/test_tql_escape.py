from __future__ import annotations

from groovegraph.tql_escape import escape_tql_string


def test_escape_tql_string_escapes_quotes_and_backslashes() -> None:
    assert escape_tql_string('a"b') == 'a\\"b'
    assert escape_tql_string("a\\b") == "a\\\\b"
