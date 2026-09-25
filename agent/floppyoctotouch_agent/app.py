"""aiohttp application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from pathlib import Path

import aiohttp
from aiohttp import web

from . import __version__
from .config import Config
from .display import Display, DisplayError
from .files import FilesApi
from .proxy import CLIENT_SESSION, OctoPrintProxy, WebcamProxy
from .settings import SettingsStore

log = logging.getLogger(__name__)

CONFIG = web.AppKey("config", Config)
SETTINGS = web.AppKey("settings", SettingsStore)
DISPLAY = web.AppKey("display", Display)


async def _client_session(app: web.Application) -> AsyncIterator[None]:
    # auto_decompress=False: bodies are relayed untouched together with their Content-Encoding.
    timeout = aiohttp.ClientTimeout(total=None, sock_connect=5)
    async with aiohttp.ClientSession(auto_decompress=False, timeout=timeout) as session:
        app[CLIENT_SESSION] = session
        yield


async def health(request: web.Request) -> web.Response:
    config = request.app[CONFIG]
    octoprint: dict[str, object] = {"reachable": False, "authorized": False, "version": None}
    try:
        async with request.app[CLIENT_SESSION].get(
            f"{config.octoprint_url}/api/version",
            headers={"X-Api-Key": config.api_key} if config.api_key else {},
            timeout=aiohttp.ClientTimeout(total=3),
        ) as resp:
            octoprint["reachable"] = True
            octoprint["authorized"] = resp.status == 200
            if resp.status == 200:
                octoprint["version"] = (await resp.json(content_type=None)).get("server")
    except (aiohttp.ClientError, TimeoutError, ValueError) as exc:
        octoprint["error"] = str(exc) or exc.__class__.__name__

    return web.json_response(
        {
            "status": "ok",
            "version": __version__,
            "apiKeyConfigured": bool(config.api_key),
            "octoprint": octoprint,
        }
    )


async def get_settings(request: web.Request) -> web.Response:
    return web.json_response(request.app[SETTINGS].load())


async def put_settings(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except ValueError:
        raise web.HTTPBadRequest(text="invalid JSON") from None
    if not isinstance(data, dict):
        raise web.HTTPBadRequest(text="settings must be a JSON object")
    try:
        request.app[SETTINGS].save(data)
    except ValueError as exc:
        raise web.HTTPRequestEntityTooLarge(
            max_size=0, actual_size=request.content_length or 0, text=str(exc)
        ) from None
    return web.json_response(data)


async def get_display(request: web.Request) -> web.Response:
    return web.json_response(request.app[DISPLAY].state())


async def put_display(request: web.Request) -> web.Response:
    """``{"on": false}`` turns the HDMI output off, ``{"on": true}`` back on."""
    try:
        data = await request.json()
    except ValueError:
        raise web.HTTPBadRequest(text="invalid JSON") from None
    if not isinstance(data, dict) or not isinstance(data.get("on"), bool):
        raise web.HTTPBadRequest(text='expected {"on": true|false}')
    display = request.app[DISPLAY]
    try:
        await display.set_power(data["on"])
    except DisplayError as exc:
        log.warning("display: %s", exc)
        return web.json_response({"error": "display_failed", "detail": str(exc)}, status=503)
    return web.json_response(display.state())


def _static_handler(static_dir: Path):
    root = static_dir.resolve()

    async def handler(request: web.Request) -> web.StreamResponse:
        rel = request.match_info.get("tail", "")
        # Unknown agent endpoints are API calls: answer 404, never the SPA page.
        if rel == "local" or rel.startswith("local/"):
            raise web.HTTPNotFound()
        candidate = (root / rel).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return web.FileResponse(candidate)
        index = root / "index.html"
        # SPA fallback, but never for things that look like missing assets.
        if index.is_file() and "." not in Path(rel).name:
            return web.FileResponse(index, headers={"Cache-Control": "no-cache"})
        raise web.HTTPNotFound()

    return handler


def create_app(config: Config) -> web.Application:
    app = web.Application(client_max_size=1024**3)
    app[CONFIG] = config
    app[SETTINGS] = SettingsStore(config.data_dir / "settings.json")
    app[DISPLAY] = Display(config.display_backend, config.display_output)
    app.cleanup_ctx.append(_client_session)

    app.router.add_get("/local/health", health)
    app.router.add_get("/local/settings", get_settings)
    app.router.add_put("/local/settings", put_settings)
    app.router.add_get("/local/display", get_display)
    app.router.add_put("/local/display", put_display)

    OctoPrintProxy(config.octoprint_url, config.api_key).add_routes(app)
    WebcamProxy(config.webcam_url).add_routes(app)
    FilesApi(config).add_routes(app)

    static = _static_handler(config.static_dir)
    app.router.add_get("/{tail:.*}", static)
    return app
