from __future__ import annotations

import asyncio

import pytest
from aiohttp import web

from floppyoctotouch_agent import display as display_module


def fake_streamer() -> web.Application:
    """camera-streamer stand-in: echoes the path or streams MJPEG-like parts."""

    async def root(request: web.Request) -> web.StreamResponse:
        if request.query.get("action") == "stream":
            resp = web.StreamResponse(
                headers={"Content-Type": "multipart/x-mixed-replace; boundary=frame"}
            )
            await resp.prepare(request)
            for i in range(1000):
                await resp.write(b"--frame\r\nContent-Type: image/jpeg\r\n\r\nFRAME%d\r\n" % i)
                await asyncio.sleep(0.01)
            return resp
        return web.json_response(
            {"path": request.raw_path, "apiKey": request.headers.get("X-Api-Key")}
        )

    app = web.Application()
    app.router.add_route("*", "/{tail:.*}", root)
    return app


@pytest.fixture
async def streamer(aiohttp_server):
    return await aiohttp_server(fake_streamer())


async def test_webcam_prefix_is_stripped_and_no_api_key_is_sent(make_client, streamer):
    client = await make_client(webcam_url=str(streamer.make_url("")))
    body = await (await client.get("/webcam/?action=snapshot")).json()
    assert body == {"path": "/?action=snapshot", "apiKey": None}
    body = await (await client.get("/webcam/0/stream.mjpg")).json()
    assert body["path"] == "/0/stream.mjpg"
    assert (await client.post("/webcam/?action=snapshot")).status == 405


async def test_webcam_stream_is_relayed_and_can_be_closed(make_client, streamer):
    client = await make_client(webcam_url=str(streamer.make_url("")))
    resp = await client.get("/webcam/?action=stream")
    assert resp.status == 200
    assert resp.headers["Content-Type"].startswith("multipart/x-mixed-replace")
    chunk = await resp.content.readuntil(b"FRAME1")
    assert b"FRAME0" in chunk
    resp.close()


async def test_webcam_unreachable_returns_502(make_client):
    client = await make_client(webcam_url="http://127.0.0.1:9")
    resp = await client.get("/webcam/?action=stream")
    assert resp.status == 502
    assert (await resp.json())["error"] == "webcam_unreachable"


async def test_display_none_backend_only_remembers_the_state(make_client):
    client = await make_client(display_backend="none")
    assert (await (await client.get("/local/display")).json())["on"] is True
    resp = await client.put("/local/display", json={"on": False})
    assert resp.status == 200
    assert await resp.json() == {"on": False, "backend": "none", "output": "HDMI-A-1"}
    assert (await (await client.get("/local/display")).json())["on"] is False
    assert (await client.put("/local/display", json={"on": "yes"})).status == 400
    assert (await client.put("/local/display", data="nope")).status == 400


class FakeProcess:
    def __init__(self, returncode: int, stderr: bytes = b"") -> None:
        self.returncode = returncode
        self._stderr = stderr

    async def communicate(self):
        return b"", self._stderr

    def kill(self) -> None:
        pass


async def test_display_wlr_randr_command(make_client, monkeypatch):
    calls = []

    async def fake_exec(*args, **kwargs):
        calls.append(args)
        return FakeProcess(0)

    monkeypatch.setattr(display_module.asyncio, "create_subprocess_exec", fake_exec)
    client = await make_client(display_output="HDMI-A-2")
    assert (await client.put("/local/display", json={"on": False})).status == 200
    assert (await client.put("/local/display", json={"on": True})).status == 200
    assert calls == [
        ("wlr-randr", "--output", "HDMI-A-2", "--off"),
        ("wlr-randr", "--output", "HDMI-A-2", "--on"),
    ]


async def test_display_failure_keeps_the_state(make_client, monkeypatch):
    async def failing_exec(*args, **kwargs):
        return FakeProcess(1, b"no such output")

    monkeypatch.setattr(display_module.asyncio, "create_subprocess_exec", failing_exec)
    client = await make_client()
    resp = await client.put("/local/display", json={"on": False})
    assert resp.status == 503
    assert "no such output" in (await resp.json())["detail"]
    assert (await (await client.get("/local/display")).json())["on"] is True


async def test_display_missing_wlr_randr(make_client, monkeypatch):
    async def missing(*args, **kwargs):
        raise FileNotFoundError

    monkeypatch.setattr(display_module.asyncio, "create_subprocess_exec", missing)
    client = await make_client()
    resp = await client.put("/local/display", json={"on": False})
    assert resp.status == 503
    assert "not installed" in (await resp.json())["detail"]


def test_unknown_display_backend_is_rejected():
    with pytest.raises(ValueError):
        display_module.Display("xrandr", "HDMI-1")
