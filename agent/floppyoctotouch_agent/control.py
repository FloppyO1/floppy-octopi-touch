"""System screen endpoints: host information, OctoPrint API key and kiosk restart.

``GET /local/system``         CPU/RAM/disk/network snapshot (see system.py)
``GET /local/apikey``         whether a key is configured (never the key itself)
``PUT /local/apikey``         ``{"apiKey": "..."}``: checked on OctoPrint, saved, used at once
``POST /local/kiosk/restart`` runs ``kiosk_restart_command`` (cage + Chromium)
"""

from __future__ import annotations

import logging
import re

import aiohttp
from aiohttp import web

from . import __version__
from .commands import CommandError, run_command
from .config import Config, save_config_values
from .proxy import CLIENT_SESSION
from .system import SystemInfo

log = logging.getLogger(__name__)

# OctoPrint keys are URL-safe tokens (32+ characters for application keys).
API_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{16,128}$")
VALIDATE_TIMEOUT_S = 5
KIOSK_TIMEOUT_S = 20


def _error(status: int, code: str, detail: str = "") -> web.Response:
    return web.json_response({"error": code, "detail": detail}, status=status)


class ControlApi:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.system = SystemInfo(disk_path=config.disk_path)

    async def system_info(self, request: web.Request) -> web.Response:
        return web.json_response({"version": __version__, **await self.system.snapshot()})

    # ------------------------------------------------------------ API key
    def _key_state(self) -> dict[str, object]:
        key = self.config.api_key
        from_env = "api_key" in self.config.env_overrides
        return {
            "configured": bool(key),
            # Enough to recognise the key without revealing it.
            "hint": f"…{key[-4:]}" if len(key) >= 8 else None,
            "source": "env" if from_env else ("file" if key else "none"),
            # A key from the environment wins again at the next start.
            "persistent": not from_env,
        }

    async def get_api_key(self, request: web.Request) -> web.Response:
        return web.json_response(self._key_state())

    async def put_api_key(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except ValueError:
            return _error(400, "invalid_json")
        key = data.get("apiKey") if isinstance(data, dict) else None
        if not isinstance(key, str) or not API_KEY_RE.fullmatch(key.strip()):
            return _error(400, "invalid_format", "16-128 letters, digits, '-' or '_'")
        key = key.strip()

        try:
            async with request.app[CLIENT_SESSION].get(
                f"{self.config.octoprint_url}/api/version",
                headers={"X-Api-Key": key},
                timeout=aiohttp.ClientTimeout(total=VALIDATE_TIMEOUT_S),
            ) as resp:
                status = resp.status
        except (aiohttp.ClientError, TimeoutError) as exc:
            return _error(502, "octoprint_unreachable", str(exc) or exc.__class__.__name__)
        if status != 200:
            return _error(422, "rejected", f"OctoPrint answered HTTP {status}")

        try:
            save_config_values(self.config.config_path, {"api_key": key})
        except (OSError, ValueError) as exc:
            log.error("cannot save the API key to %s: %s", self.config.config_path, exc)
            return _error(500, "save_failed", str(exc))
        self.config.api_key = key
        log.info("OctoPrint API key replaced (saved to %s)", self.config.config_path)
        return web.json_response(self._key_state())

    # ------------------------------------------------------------ kiosk
    async def restart_kiosk(self, request: web.Request) -> web.Response:
        command = self.config.kiosk_restart_command
        if not command:
            log.info("kiosk restart requested (no command configured: nothing done)")
            return web.json_response({"restarted": False})
        try:
            await run_command(command, KIOSK_TIMEOUT_S)
        except CommandError as exc:
            log.warning("kiosk restart: %s", exc)
            return _error(503, "kiosk_restart_failed", str(exc))
        return web.json_response({"restarted": True})

    def add_routes(self, app: web.Application) -> None:
        app.router.add_get("/local/system", self.system_info)
        app.router.add_get("/local/apikey", self.get_api_key)
        app.router.add_put("/local/apikey", self.put_api_key)
        app.router.add_post("/local/kiosk/restart", self.restart_kiosk)
