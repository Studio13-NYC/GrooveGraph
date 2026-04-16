# GrooveGraph runtime logs

Logs are written here by the CLI and pytest (development harness).

| File | Producer |
|------|-----------|
| `gg.log` | `gg` commands (`groovegraph.logging_setup`) |
| `pytest.log` | `pytest` (configured from `cli/tests/conftest.py`) |
| `*.json` (optional) | ad-hoc CLI output you save here locally — **gitignored** |

Control verbosity with **`GG_LOG_LEVEL`** (default **`DEBUG`** for file output). Valid values: `DEBUG`, `INFO`, `WARNING`, `ERROR`.

**Note:** `*.log` and `*.json` under `logs/` are gitignored; this folder is kept via `.gitkeep` and this README.
