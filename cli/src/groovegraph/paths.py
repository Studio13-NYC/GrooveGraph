from __future__ import annotations

from pathlib import Path


def repo_root_from(start: Path | None = None) -> Path:
    """Return GrooveGraph repository root (contains `typedb/` and `.env.example`)."""
    here = (start or Path.cwd()).resolve()
    for p in [here, *here.parents]:
        if (p / "typedb").is_dir() and (p / ".env.example").is_file():
            return p
    raise FileNotFoundError(
        "Could not locate GrooveGraph repo root (expected a parent with typedb/ and .env.example). "
        "Run gg from inside the GrooveGraph checkout."
    )
