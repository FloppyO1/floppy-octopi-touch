"""Persistent dashboard settings (a single JSON document owned by the frontend).

The agent only stores the document and provides defaults for a first start: the schema,
its versioning and migrations live in the frontend settings store.
"""

from __future__ import annotations

import copy
import json
import os
import tempfile
from pathlib import Path
from typing import Any

MAX_SETTINGS_BYTES = 256 * 1024

DEFAULT_SETTINGS: dict[str, Any] = {
    "schemaVersion": 1,
    "language": "en",
    "clock24h": True,
}


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict[str, Any]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return copy.deepcopy(DEFAULT_SETTINGS)
        except (OSError, ValueError):
            # A corrupted file must not brick the dashboard: fall back to defaults.
            return copy.deepcopy(DEFAULT_SETTINGS)
        if not isinstance(data, dict):
            return copy.deepcopy(DEFAULT_SETTINGS)
        return data

    def save(self, data: dict[str, Any]) -> None:
        if not isinstance(data, dict):
            raise TypeError("settings must be a JSON object")
        payload = json.dumps(data, indent=2, ensure_ascii=False)
        if len(payload.encode("utf-8")) > MAX_SETTINGS_BYTES:
            raise ValueError("settings document too large")

        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".settings-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
