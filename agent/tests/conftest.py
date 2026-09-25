from __future__ import annotations

import pytest
from aiohttp import WSMsgType, web

from floppyoctotouch_agent.app import create_app
from floppyoctotouch_agent.config import Config

API_KEY = "test-key"


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

    app = web.Application()
    app.router.add_get("/api/version", version)
    app.router.add_get("/sockjs/websocket", websocket)
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
        }
        config = Config(**(values | overrides))
        return await aiohttp_client(create_app(config))

    return factory
