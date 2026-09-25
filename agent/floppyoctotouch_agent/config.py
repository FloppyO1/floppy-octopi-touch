"""Agent configuration: JSON file first, then environment variables."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CONFIG_PATH = Path("~/.config/floppyoctotouch/config.json")


@dataclass
class Config:
    octoprint_url: str = "http://127.0.0.1:5000"
    api_key: str = ""
    host: str = "127.0.0.1"
    port: int = 8765
    static_dir: Path = Path("/opt/floppyoctotouch/frontend")
    data_dir: Path = Path("~/.config/floppyoctotouch")
    usb_roots: list[Path] = field(default_factory=lambda: [Path("/media")])
    # camera-streamer on OctoPi; `/webcam/*` is proxied here with the prefix removed (like haproxy).
    webcam_url: str = "http://127.0.0.1:8080"
    # "wlr-randr" (HDMI output of the cage session) or "none" (only logs, for development).
    display_backend: str = "wlr-randr"
    display_output: str = "HDMI-A-1"

    def __post_init__(self) -> None:
        self.octoprint_url = self.octoprint_url.rstrip("/")
        self.webcam_url = self.webcam_url.rstrip("/")
        self.static_dir = Path(self.static_dir).expanduser()
        self.data_dir = Path(self.data_dir).expanduser()
        self.usb_roots = [Path(p).expanduser() for p in self.usb_roots]


_ENV = {
    "FOT_OCTOPRINT_URL": "octoprint_url",
    "FOT_API_KEY": "api_key",
    "FOT_HOST": "host",
    "FOT_PORT": "port",
    "FOT_STATIC_DIR": "static_dir",
    "FOT_DATA_DIR": "data_dir",
    "FOT_USB_ROOTS": "usb_roots",
    "FOT_WEBCAM_URL": "webcam_url",
    "FOT_DISPLAY_BACKEND": "display_backend",
    "FOT_DISPLAY_OUTPUT": "display_output",
}


def load_config(environ: dict[str, str] | None = None) -> Config:
    env = os.environ if environ is None else environ
    values: dict[str, object] = {}

    path = Path(env.get("FOT_CONFIG", str(DEFAULT_CONFIG_PATH))).expanduser()
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"{path}: expected a JSON object")
        values.update({k: v for k, v in data.items() if k in Config.__dataclass_fields__})

    for var, key in _ENV.items():
        if var in env and env[var] != "":
            values[key] = env[var]

    if isinstance(values.get("usb_roots"), str):
        values["usb_roots"] = [p for p in str(values["usb_roots"]).split(":") if p]
    if "port" in values:
        values["port"] = int(values["port"])  # type: ignore[arg-type]

    return Config(**values)  # type: ignore[arg-type]
