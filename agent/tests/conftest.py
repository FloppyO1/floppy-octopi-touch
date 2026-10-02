from __future__ import annotations

import os
from pathlib import Path

import pytest
from aiohttp import WSMsgType, web

from floppyoctotouch_agent.app import create_app
from floppyoctotouch_agent.config import Config

API_KEY = "test-api-key-0123456789abcdef"
# dev/sample-gcode, mounted at /samples by the agent-test service.
SAMPLES = Path(os.environ.get("FOT_SAMPLES", "/samples"))
# OctoPrint storage of the fake server: {"folder/name.gcode": bytes}; uploads land here too.
STORAGE = web.AppKey("storage", dict)
UPLOADS = web.AppKey("uploads", list)


def fake_octoprint() -> web.Application:
    """Tiny stand-in for OctoPrint that echoes what it receives."""

    async def version(request: web.Request) -> web.Response:
        if request.headers.get("X-Api-Key") != API_KEY:
            return web.json_response({"error": "forbidden"}, status=403)
        return web.json_response({"api": "0.1", "server": "1.11.8", "text": "OctoPrint 1.11.8"})

    async def echo(request: web.Request) -> web.Response:
        return web.json_response(
            {
                "method": request.method,
                "path": request.raw_path,
                "apiKey": request.headers.get("X-Api-Key"),
                "authorization": request.headers.get("Authorization"),
                "body": (await request.read()).decode(),
            },
            headers={"Set-Cookie": "session=abc; Path=/"},
        )

    async def websocket(request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({"connected": {"apikey": request.headers.get("X-Api-Key")}})
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                await ws.send_str("echo:" + msg.data)
        return ws

    async def download(request: web.Request) -> web.Response:
        if request.headers.get("X-Api-Key") != API_KEY:
            return web.json_response({"error": "forbidden"}, status=403)
        data = request.app[STORAGE].get(request.match_info["path"])
        if data is None:
            return web.json_response({"error": "not found"}, status=404)
        return web.Response(body=data, content_type="text/plain")

    async def upload(request: web.Request) -> web.Response:
        """Records the multipart upload like OctoPrint's `POST /api/files/local`."""
        record = {
            "apiKey": request.headers.get("X-Api-Key"),
            "contentLength": request.headers.get("Content-Length"),
            "transferEncoding": request.headers.get("Transfer-Encoding"),
            "fields": {},
        }
        reader = await request.multipart()
        while (part := await reader.next()) is not None:
            if part.name == "file":
                record["filename"] = part.filename
                record["content"] = await part.read()
            else:
                record["fields"][part.name] = await part.text()
        request.app[UPLOADS].append(record)
        folder = record["fields"].get("path", "")
        path = f"{folder}/{record['filename']}" if folder else record["filename"]
        request.app[STORAGE][path] = record["content"]
        return web.json_response(
            {"done": True, "files": {"local": {"name": record["filename"], "path": path}}},
            status=201,
        )

    app = web.Application(client_max_size=1024**3)
    app[STORAGE] = {}
    app[UPLOADS] = []
    app.router.add_get("/api/version", version)
    app.router.add_get("/sockjs/websocket", websocket)
    app.router.add_get("/downloads/files/local/{path:.+}", download)
    app.router.add_post("/api/files/local", upload)
    app.router.add_route("*", "/{tail:.*}", echo)
    return app


@pytest.fixture
async def upstream(aiohttp_server):
    return await aiohttp_server(fake_octoprint())


@pytest.fixture
def make_client(aiohttp_client, upstream, tmp_path):
    async def factory(**overrides):
        values = {
            "octoprint_url": str(upstream.make_url("")),
            "api_key": API_KEY,
            "static_dir": tmp_path / "static",
            "data_dir": tmp_path / "data",
            "uploads_dir": tmp_path / "uploads",
            "usb_roots": [tmp_path / "media" / "usb*"],
            "usb_eject_command": [],
            "kiosk_restart_command": [],
            "time_backend": "none",
            "config_path": tmp_path / "config.json",
        }
        config = Config(**(values | overrides))
        return await aiohttp_client(create_app(config))

    return factory
