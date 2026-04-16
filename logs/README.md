# GrooveGraph runtime logs

Logs are written here by the CLI and pytest (development harness).

| File | Producer |
|------|-----------|
| `gg.log` | `gg` commands (`groovegraph.logging_setup`) |
| `pytest.log` | `pytest` (configured from `cli/tests/conftest.py`) |

Control verbosity with **`GG_LOG_LEVEL`** (default **`DEBUG`** for file output). Valid values: `DEBUG`, `INFO`, `WARNING`, `ERROR`.

**Note:** `*.log` files are gitignored; this folder is kept via `.gitkeep` and this README.
