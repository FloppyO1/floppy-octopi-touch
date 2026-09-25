from __future__ import annotations

import asyncio
import json
import os

import pytest

from floppyoctotouch_agent import usb as usb_module

from .conftest import API_KEY, UPLOADS


@pytest.fixture
def stick(tmp_path):
    root = tmp_path / "media" / "usb0"
    (root / "parts").mkdir(parents=True)
    (root / "System Volume Information").mkdir()
    (root / ".Trashes").mkdir()
    (root / "cube.gcode").write_bytes(b"G28\n" * 1000)
    (root / "parts" / "Gear.GCO").write_text("G28\n")
    (root / "parts" / "readme.txt").write_text("hi")
    (root / "._cube.gcode").write_text("mac resource fork")
    (root / "System Volume Information" / "x.gcode").write_text("G28\n")
    (root / ".Trashes" / "old.gcode").write_text("G28\n")
    (tmp_path / "secret.gcode").write_text("outside the stick")
    return root


async def test_lists_only_gcode_on_mounted_sticks(make_client, stick):
    client = await make_client()
    body = await (await client.get("/local/usb")).json()
    assert body["mounts"] == [{"id": "usb0", "name": "usb0"}]
    assert [(f["mount"], f["path"]) for f in body["files"]] == [
        ("usb0", "cube.gcode"),
        ("usb0", "parts/Gear.GCO"),
    ]
    assert body["files"][0]["size"] == 4000


async def test_installer_mount_points_are_named_after_the_label(make_client, tmp_path):
    root = tmp_path / "media" / "usb-KINGSTON"
    root.mkdir(parents=True)
    (root / "cube.gcode").write_text("G28\n")
    client = await make_client()
    body = await (await client.get("/local/usb")).json()
    assert body["mounts"] == [{"id": "usb-KINGSTON", "name": "KINGSTON"}]


async def test_empty_mount_point_is_not_a_stick(make_client, tmp_path):
    (tmp_path / "media" / "usb1").mkdir(parents=True)
    client = await make_client()
    assert await (await client.get("/local/usb")).json() == {"mounts": [], "files": []}


@pytest.mark.parametrize(
    ("mount", "path", "status"),
    [
        ("usb0", "../secret.gcode", 400),
        ("usb0", "/etc/passwd", 400),
        ("usb0", "parts/../../secret.gcode", 400),
        ("usb0", "link.gcode", 400),
        ("usb0", "parts/readme.txt", 400),
        ("usb0", "", 400),
        ("usb0", "missing.gcode", 404),
        ("usb9", "cube.gcode", 404),
    ],
)
async def test_paths_are_confined_to_the_stick(make_client, stick, tmp_path, mount, path, status):
    os.symlink(tmp_path / "secret.gcode", stick / "link.gcode")
    client = await make_client()
    resp = await client.post("/local/usb/import", json={"mount": mount, "path": path})
    assert resp.status == status
    resp = await client.get("/local/usb/thumbnail", params={"mount": mount, "path": path})
    assert resp.status == status


async def test_symlinks_are_not_listed(make_client, stick, tmp_path):
    os.symlink(tmp_path / "secret.gcode", stick / "link.gcode")
    client = await make_client()
    body = await (await client.get("/local/usb")).json()
    assert "link.gcode" not in [f["path"] for f in body["files"]]


async def test_import_streams_progress_then_the_result(make_client, stick, upstream, monkeypatch):
    monkeypatch.setattr(usb_module, "CHUNK_BYTES", 512)
    client = await make_client()
    resp = await client.post(
        "/local/usb/import", json={"mount": "usb0", "path": "cube.gcode", "folder": "from usb"}
    )
    assert resp.status == 200
    assert resp.content_type == "application/x-ndjson"
    messages = [json.loads(line) for line in (await resp.text()).splitlines()]
    assert messages[0] == {"sent": 0, "total": 4000}
    assert messages[-1] == {"done": True, "name": "cube.gcode", "path": "from usb/cube.gcode"}
    sent = [m["sent"] for m in messages[:-1]]
    assert sent == sorted(sent)

    [record] = upstream.app[UPLOADS]
    assert record["apiKey"] == API_KEY
    assert record["filename"] == "cube.gcode"
    assert record["content"] == (stick / "cube.gcode").read_bytes()
    assert record["fields"] == {"path": "from usb"}
    assert record["transferEncoding"] is None
    assert int(record["contentLength"]) > 4000


async def test_import_to_the_root_with_a_unicode_name(make_client, stick, upstream):
    (stick / "pièce.gcode").write_text("G28\n")
    client = await make_client()
    resp = await client.post("/local/usb/import", json={"mount": "usb0", "path": "pièce.gcode"})
    last = json.loads((await resp.text()).splitlines()[-1])
    assert last["done"] is True
    [record] = upstream.app[UPLOADS]
    assert record["filename"] == "pièce.gcode"
    assert record["fields"] == {}


async def test_import_limits(make_client, stick):
    client = await make_client(usb_max_file_mb=0)
    resp = await client.post("/local/usb/import", json={"mount": "usb0", "path": "cube.gcode"})
    assert resp.status == 413
    client = await make_client()
    resp = await client.post(
        "/local/usb/import", json={"mount": "usb0", "path": "cube.gcode", "folder": "../up"}
    )
    assert resp.status == 400
    resp = await client.post("/local/usb/import", data=b"nope")
    assert resp.status == 400


async def test_upload_failure_is_reported_in_the_stream(make_client, stick):
    client = await make_client(api_key="wrong", octoprint_url="http://127.0.0.1:9")
    resp = await client.post("/local/usb/import", json={"mount": "usb0", "path": "cube.gcode"})
    last = json.loads((await resp.text()).splitlines()[-1])
    assert last["error"] == "upload_failed"


async def test_eject_hides_the_stick_until_it_changes(make_client, stick):
    client = await make_client()
    assert (await client.post("/local/usb/eject", json={"mount": "usb0"})).status == 200
    assert (await (await client.get("/local/usb")).json())["mounts"] == []
    # Re-plugged (or, in development, new files on the fake stick): visible again.
    (stick / "new.gcode").write_text("G28\n")
    os.utime(stick, ns=(1, 1))
    assert (await (await client.get("/local/usb")).json())["mounts"] != []


async def test_eject_command(make_client, stick, tmp_path):
    marker = tmp_path / "ejected"
    client = await make_client(usb_eject_command=["sh", "-c", f"echo {{path}} > {marker}"])
    assert (await client.post("/local/usb/eject", json={"mount": "usb0"})).status == 200
    assert marker.read_text().strip() == str(stick)

    client = await make_client(usb_eject_command=["false"])
    (stick / "again.gcode").write_text("G28\n")
    resp = await client.post("/local/usb/eject", json={"mount": "usb0"})
    assert resp.status == 503
    assert (await resp.json())["error"] == "eject_failed"
    assert (await client.post("/local/usb/eject", json={"mount": "usb7"})).status == 404


async def read_event(resp) -> dict:
    event = {}
    while True:
        line = (await asyncio.wait_for(resp.content.readline(), 5)).decode().rstrip("\n")
        if line.startswith("event: "):
            event["type"] = line[7:]
        elif line.startswith("data: "):
            event["data"] = json.loads(line[6:])
        elif line == "" and "data" in event:
            return event


async def test_events_announce_sticks(make_client, stick, tmp_path, monkeypatch):
    monkeypatch.setattr(usb_module, "POLL_INTERVAL_S", 0.05)
    client = await make_client()
    resp = await client.get("/local/events")
    assert resp.content_type == "text/event-stream"
    first = await read_event(resp)
    assert first == {
        "type": "usb",
        "data": {"type": "usb", "mounts": [{"id": "usb0", "name": "usb0"}]},
    }

    other = tmp_path / "media" / "usb1"
    other.mkdir()
    (other / "a.gcode").write_text("G28\n")
    second = await read_event(resp)
    assert [m["id"] for m in second["data"]["mounts"]] == ["usb0", "usb1"]
    resp.close()
