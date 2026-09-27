"""Agent configuration: JSON file first, then environment variables."""

from __future__ import annotations

import json
import os
import tempfile
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
    # OctoPrint's local storage, read directly for thumbnails (HTTP download as a fallback).
    uploads_dir: Path = Path("~/.octoprint/uploads")
    # Glob patterns of USB stick mount points (mounted read-only by the system).
    usb_roots: list[Path] = field(default_factory=lambda: [Path("/media/usb*")])
    # Unmounts a stick ("{path}" = mount point); empty = only hide it (development).
    usb_eject_command: list[str] = field(
        default_factory=lambda: ["systemd-mount", "--umount", "{path}"]
    )
    usb_max_file_mb: int = 1024
    # camera-streamer on OctoPi; `/webcam/*` is proxied here with the prefix removed (like haproxy).
    webcam_url: str = "http://127.0.0.1:8080"
    # "wlr-randr" (HDMI output of the cage session) or "none" (only logs, for development).
    display_backend: str = "wlr-randr"
    display_output: str = "HDMI-A-1"
    # Mode set when the output is switched back on (the 7" screen does not advertise 1024x600);
    # "preferred" keeps the mode the screen asks for.
    display_mode: str = "1024x600@60Hz"
    # Restarts the kiosk (cage + Chromium); empty = only log (development).
    kiosk_restart_command: list[str] = field(
        default_factory=lambda: [
            "sudo",
            "-n",
            "systemctl",
            "restart",
            "floppyoctotouch-kiosk.service",
        ]
    )
    # Seconds without a local dashboard page (crashed browser) before a kiosk restart; 0 = never.
    kiosk_watchdog_s: float = 60
    # File system shown as "disk" on the System screen (the SD card on the Pi).
    disk_path: Path = Path("/")
    # Where the configuration was read from (the API key is saved there) and which keys came from
    # the environment (they win again at the next start). Not read from the file itself.
    config_path: Path = DEFAULT_CONFIG_PATH
    env_overrides: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self.octoprint_url = self.octoprint_url.rstrip("/")
        self.webcam_url = self.webcam_url.rstrip("/")
        self.static_dir = Path(self.static_dir).expanduser()
        self.data_dir = Path(self.data_dir).expanduser()
        self.uploads_dir = Path(self.uploads_dir).expanduser()
        self.disk_path = Path(self.disk_path).expanduser()
        self.config_path = Path(self.config_path).expanduser()
        self.usb_roots = [Path(p).expanduser() for p in self.usb_roots]
        self.usb_eject_command = [str(part) for part in self.usb_eject_command]
        self.kiosk_restart_command = [str(part) for part in self.kiosk_restart_command]
        self.usb_max_file_mb = int(self.usb_max_file_mb)
        self.kiosk_watchdog_s = float(self.kiosk_watchdog_s)


_ENV = {
    "FOT_OCTOPRINT_URL": "octoprint_url",
    "FOT_API_KEY": "api_key",
    "FOT_HOST": "host",
    "FOT_PORT": "port",
    "FOT_STATIC_DIR": "static_dir",
    "FOT_DATA_DIR": "data_dir",
    "FOT_UPLOADS_DIR": "uploads_dir",
    "FOT_USB_ROOTS": "usb_roots",
    "FOT_USB_EJECT_COMMAND": "usb_eject_command",
    "FOT_USB_MAX_FILE_MB": "usb_max_file_mb",
    "FOT_WEBCAM_URL": "webcam_url",
    "FOT_DISPLAY_BACKEND": "display_backend",
    "FOT_DISPLAY_OUTPUT": "display_output",
    "FOT_DISPLAY_MODE": "display_mode",
    "FOT_KIOSK_RESTART_COMMAND": "kiosk_restart_command",
    "FOT_KIOSK_WATCHDOG_S": "kiosk_watchdog_s",
    "FOT_DISK_PATH": "disk_path",
}
_NOT_FROM_FILE = {"config_path", "env_overrides"}
_COMMANDS = ("usb_eject_command", "kiosk_restart_command")


def load_config(environ: dict[str, str] | None = None) -> Config:
    env = os.environ if environ is None else environ
    values: dict[str, object] = {}

    path = Path(env.get("FOT_CONFIG", str(DEFAULT_CONFIG_PATH))).expanduser()
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"{path}: expected a JSON object")
        values.update(
            {
                k: v
                for k, v in data.items()
                if k in Config.__dataclass_fields__ and k not in _NOT_FROM_FILE
            }
        )

    from_env = set()
    for var, key in _ENV.items():
        if var in env and env[var] != "":
            values[key] = env[var]
            from_env.add(key)

    if isinstance(values.get("usb_roots"), str):
        values["usb_roots"] = [p for p in str(values["usb_roots"]).split(":") if p]
    for key in _COMMANDS:
        if isinstance(values.get(key), str):
            # Space separated in the environment; "none" disables the command.
            command = str(values[key])
            values[key] = [] if command.strip() == "none" else command.split()
    if "port" in values:
        values["port"] = int(values["port"])  # type: ignore[arg-type]

    return Config(**values, config_path=path, env_overrides=from_env)  # type: ignore[arg-type]


def save_config_values(path: Path, updates: dict[str, object]) -> None:
    """Merges ``updates`` into the JSON config file, written atomically and readable only by us."""
    data: dict[str, object] = {}
    if path.is_file():
        loaded = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            data = loaded
    data.update(updates)
    path.parent.mkdir(parents=True, exist_ok=True)
    # mkstemp creates the file with mode 0600: the API key never becomes world-readable.
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".config-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
