from __future__ import annotations

import json

from bridge import _init_reset_db


if __name__ == "__main__":
    print(json.dumps(_init_reset_db()))
