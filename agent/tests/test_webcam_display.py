from __future__ import annotations

import asyncio

import aiohttp
import pytest
from aiohttp import web

from floppyoctotouch_agent import display as display_module
from floppyoctotouch_agent import proxy as proxy_module


def fake_streamer() -> web.Application:
    """camera-streamer stand-in: echoes the path or streams MJPEG-like parts."""

    async def root(request: web.Request) -> web.StreamResponse:
        if request.query.get("action") == "stream":
            resp = web.StreamResponse(
                headers={"Content-Type": "multipart/x-mixed-replace; boundary=frame"}
            )
            await resp.prepare(request)
            for i in range(int(request.query.get("frames", "1000"))):
                await resp.write(b"--frame\r\nContent-Type: image/jpeg\r\n\r\nFRAME%d\r\n" % i)
                await asyncio.sleep(0.01)
            if request.query.get("then") == "stall":
                await asyncio.sleep(30)
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


async def test_ended_webcam_stream_is_cut_not_completed(make_client, streamer):
    # A cleanly ended MJPEG body would leave the last frame on screen with no event in Chromium.
    client = await make_client(webcam_url=str(streamer.make_url("")))
    resp = await client.get("/webcam/?action=stream&frames=3")
    with pytest.raises(aiohttp.ClientPayloadError):
        await resp.read()


async def test_stalled_webcam_stream_is_cut(make_client, streamer, monkeypatch):
    monkeypatch.setattr(proxy_module, "WEBCAM_STALL_S", 0.3)
    client = await make_client(webcam_url=str(streamer.make_url("")))
    resp = await client.get("/webcam/?action=stream&frames=3&then=stall")
    assert b"FRAME2" in await resp.content.readuntil(b"FRAME2")
    with pytest.raises(aiohttp.ClientPayloadError):
        await asyncio.wait_for(resp.read(), 5)


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
    assert await resp.json() == {
        "on": False,
        "backend": "none",
        "output": "HDMI-A-1",
        "mode": "1024x600@60Hz",
    }
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
        ("wlr-randr", "--output", "HDMI-A-2", "--custom-mode", "1024x600@60Hz"),
    ]


async def test_display_on_sets_the_preferred_mode_too(make_client, monkeypatch):
    calls = []

    async def fake_exec(*args, **kwargs):
        calls.append(args)
        return FakeProcess(0)

    monkeypatch.setattr(display_module.asyncio, "create_subprocess_exec", fake_exec)
    client = await make_client(display_mode="preferred")
    assert (await client.put("/local/display", json={"on": True})).status == 200
    # --on alone would keep the first mode of the list (800x450 on the 7" screen).
    assert calls == [
        ("wlr-randr", "--output", "HDMI-A-1", "--on"),
        ("wlr-randr", "--output", "HDMI-A-1", "--preferred"),
    ]


async def test_display_on_even_when_the_mode_fails(make_client, monkeypatch):
    async def fake_exec(*args, **kwargs):
        return (
            FakeProcess(1, b"failed to apply configuration")
            if "--custom-mode" in args
            else FakeProcess(0)
        )

    monkeypatch.setattr(display_module.asyncio, "create_subprocess_exec", fake_exec)
    client = await make_client()
    await client.put("/local/display", json={"on": False})
    resp = await client.put("/local/display", json={"on": True})
    assert resp.status == 200
    assert (await resp.json())["on"] is True


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


WLR_RANDR = """HDMI-A-1 "Mediatrix Peripherals Inc MPI7002 0x00000001 (HDMI-A-1)"
  Physical size: 180x130 mm
  Enabled: yes
  Modes:
    800x450 px, 60.049000 Hz
    1280x720 px, 59.939999 Hz
    1280x720 px, 60.000000 Hz
    1920x1080 px, 60.000000 Hz (preferred, current)
  Position: 0,0
HDMI-A-2 "Other"
  Modes:
    640x480 px, 60.000000 Hz
"""


def test_parse_modes_of_one_output():
    modes, current = display_module.parse_modes(WLR_RANDR, "HDMI-A-1")
    assert modes == ["800x450@60Hz", "1280x720@60Hz", "1920x1080@60Hz"]
    assert current == "1920x1080@60Hz"
    assert display_module.parse_modes(WLR_RANDR, "HDMI-A-2") == (["640x480@60Hz"], None)


def test_valid_modes():
    for mode in ("preferred", "1024x600@60Hz", "1024x600", "1280x720@59.94Hz"):
        assert display_module.valid_mode(mode)
    for mode in ("", "1024x600@", "big", "1024x600@60Hz --off", "99999x1@60Hz"):
        assert not display_module.valid_mode(mode)


async def test_display_mode_is_kept_and_saved(make_client, tmp_path):
    client = await make_client(display_backend="none", display_mode="preferred")
    body = await (await client.get("/local/display/modes")).json()
    assert body["mode"] == "preferred"
    assert "1024x600@60Hz" in body["modes"]
    resp = await client.put("/local/display/mode", json={"mode": "1280x720@60Hz"})
    assert resp.status == 200
    body = await resp.json()
    assert (body["current"], body["pending"], body["mode"]) == (
        "1280x720@60Hz",
        "1280x720@60Hz",
        "preferred",
    )
    assert (await client.post("/local/display/mode/keep")).status == 200
    body = await (await client.get("/local/display/modes")).json()
    assert (body["mode"], body["pending"]) == ("1280x720@60Hz", None)
    assert '"display_mode": "1280x720@60Hz"' in (tmp_path / "config.json").read_text()
    assert (await client.post("/local/display/mode/keep")).status == 409


async def test_display_mode_goes_back_when_not_confirmed(make_client, monkeypatch):
    monkeypatch.setattr(display_module, "REVERT_S", 0.05)
    client = await make_client(display_backend="none")
    await client.put("/local/display/mode", json={"mode": "1920x1080@60Hz"})
    await asyncio.sleep(0.2)
    body = await (await client.get("/local/display/modes")).json()
    assert (body["current"], body["pending"], body["mode"]) == (
        "1024x600@60Hz",
        None,
        "1024x600@60Hz",
    )
    assert (await client.post("/local/display/mode/keep")).status == 409


async def test_display_mode_revert_and_bad_requests(make_client):
    client = await make_client(display_backend="none")
    await client.put("/local/display/mode", json={"mode": "preferred"})
    assert (await (await client.get("/local/display/modes")).json())["current"] == "1920x1080@60Hz"
    assert (await client.post("/local/display/mode/revert")).status == 200
    assert (await (await client.get("/local/display/modes")).json())["current"] == "1024x600@60Hz"
    assert (
        await client.put("/local/display/mode", json={"mode": "1024x600; reboot"})
    ).status == 400
    assert (await client.put("/local/display/mode", data="nope")).status == 400


async def test_display_mode_locked_by_the_environment(make_client):
    client = await make_client(display_backend="none", env_overrides={"display_mode"})
    assert (await (await client.get("/local/display/modes")).json())["locked"] is True
    assert (await client.put("/local/display/mode", json={"mode": "preferred"})).status == 409


async def test_display_mode_wlr_randr_commands(make_client, monkeypatch):
    calls = []

    class Listing(FakeProcess):
        async def communicate(self):
            return WLR_RANDR.encode(), b""

    async def fake_exec(*args, **kwargs):
        calls.append(args)
        return Listing(0)

    monkeypatch.setattr(display_module.asyncio, "create_subprocess_exec", fake_exec)
    client = await make_client()
    assert (await client.post("/local/display/mode/apply")).status == 200
    body = await (await client.put("/local/display/mode", json={"mode": "preferred"})).json()
    assert body["current"] == "1920x1080@60Hz"
    assert (await client.post("/local/display/mode/revert")).status == 200
    assert calls == [
        ("wlr-randr", "--output", "HDMI-A-1", "--custom-mode", "1024x600@60Hz"),
        ("wlr-randr", "--output", "HDMI-A-1", "--preferred"),
        ("wlr-randr",),
        ("wlr-randr", "--output", "HDMI-A-1", "--custom-mode", "1024x600@60Hz"),
    ]
