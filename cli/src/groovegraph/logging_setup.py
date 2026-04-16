from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

_CONFIGURED = False


def setup_gg_logging(
    repo_root: Path,
    *,
    log_filename: str = "gg.log",
    console: bool = True,
) -> None:
    """
    Configure verbose logging for GrooveGraph CLI and tests.

    Writes to ``<repo_root>/logs/<log_filename>`` (rotating) and optionally mirrors INFO+ to stderr.
    Safe to call multiple times (subsequent calls no-op).
    """
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_dir = repo_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / log_filename

    level_name = os.environ.get("GG_LOG_LEVEL", "DEBUG").upper()
    root_level = getattr(logging, level_name, logging.DEBUG)

    fmt = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    root = logging.getLogger("groovegraph")
    root.setLevel(root_level)
    root.propagate = False

    fh = RotatingFileHandler(log_path, maxBytes=10_000_000, backupCount=5, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    root.addHandler(fh)

    if console:
        sh = logging.StreamHandler(sys.stderr)
        sh.setLevel(logging.INFO)
        sh.setFormatter(fmt)
        root.addHandler(sh)

    # Third-party noise: keep quiet unless diagnosing the driver itself.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    root.info("Logging initialized (file=%s, level=%s)", log_path, logging.getLevelName(root_level))
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a child logger under the ``groovegraph`` namespace."""
    return logging.getLogger(f"groovegraph.{name}")
