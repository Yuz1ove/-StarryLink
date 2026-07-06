import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("STARRY_STATE_FILE", "/tmp/starrylink-demo-state.json")
os.environ.setdefault("STARRY_SERVERLESS", "1")
sys.path.insert(0, str(ROOT))

import api_server  # noqa: E402


api_server.load_store()


class handler(api_server.Handler):
    pass
