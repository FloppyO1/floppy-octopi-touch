from __future__ import annotations

from aiohttp import WSMsgType

from .conftest import API_KEY


async def test_http_proxy_injects_api_key_and_strips_client_credentials(make_client):
    client = await make_client()
    resp = await client.post(
        "/api/files/local/my%20file.gcode?recursive=true",
        data="hello",
        headers={"X-Api-Key": "attacker", "Authorization": "Bearer nope"},
    )
    assert resp.status == 200
    body = await resp.json()
    assert body["apiKey"] == API_KEY
    assert body["authorization"] is None
    assert body["method"] == "POST"
    assert body["path"] == "/api/files/local/my%20file.gcode?recursive=true"
    assert body["body"] == "hello"
    assert "session=abc" in resp.headers["Set-Cookie"]


async def test_all_prefixes_are_proxied(make_client):
    client = await make_client()
    for path in ("/api", "/plugin/appkeys/probe", "/downloads/files/local/a.gcode", "/sockjs/info"):
        resp = await client.get(path)
        assert resp.status == 200, path
        assert (await resp.json())["path"] == path


async def test_websocket_proxy(make_client):
    client = await make_client()
    async with client.ws_connect("/sockjs/websocket") as ws:
        first = await ws.receive_json()
        assert first == {"connected": {"apikey": API_KEY}}
        await ws.send_str('{"auth": "user:session"}')
        msg = await ws.receive()
        assert msg.type == WSMsgType.TEXT
        assert msg.data == 'echo:{"auth": "user:session"}'


async def test_unreachable_upstream_returns_502(aiohttp_client, tmp_path):
    from floppyoctotouch_agent.app import create_app
    from floppyoctotouch_agent.config import Config

    config = Config(octoprint_url="http://127.0.0.1:9", data_dir=tmp_path, static_dir=tmp_path)
    client = await aiohttp_client(create_app(config))
    resp = await client.get("/api/version")
    assert resp.status == 502
    assert (await resp.json())["error"] == "octoprint_unreachable"
