from __future__ import annotations


def escape_tql_string(value: str) -> str:
    """
    Escape a UTF-8 string for safe embedding inside a TypeQL double-quoted string literal.

    TypeQL uses backslash escapes inside "...". This helper is conservative: callers must
    still only interpolate allowlisted identifiers separately (never concatenate raw TypeQL).
    """
    return value.replace("\\", "\\\\").replace('"', '\\"')
