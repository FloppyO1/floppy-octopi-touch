from __future__ import annotations

import json

from floppyoctotouch_agent.config import load_config
from floppyoctotouch_agent.settings import DEFAULT_SETTINGS


async def test_health_reports_octoprint(make_client):
    client = await make_client()
    resp = await client.get("/local/health")
    assert resp.status == 200
    body = await resp.json()
    assert body["status"] == "ok"
    assert body["apiKeyConfigured"] is True
    assert body["octoprint"] == {"reachable": True, "authorized": True, "version": "1.11.8"}


async def test_health_with_wrong_key(make_client):
    client = await make_client(api_key="wrong")
    body = await (await client.get("/local/health")).json()
    assert body["octoprint"]["reachable"] is True
    assert body["octoprint"]["authorized"] is False


async def test_settings_defaults_then_roundtrip(make_client, tmp_path):
    client = await make_client()
    resp = await client.get("/local/settings")
    assert await resp.json() == DEFAULT_SETTINGS

    new = {"schemaVersion": 1, "language": "it", "presets": [{"name": "PLA"}]}
    resp = await client.put("/local/settings", json=new)
    assert resp.status == 200
    assert await (await client.get("/local/settings")).json() == new
    stored = json.loads((tmp_path / "data" / "settings.json").read_text(encoding="utf-8"))
    assert stored == new


async def test_settings_rejects_non_objects(make_client):
    client = await make_client()
    assert (await client.put("/local/settings", json=[1, 2])).status == 400
    assert (await client.put("/local/settings", data="{not json")).status == 400


async def test_corrupted_settings_fall_back_to_defaults(make_client, tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "settings.json").write_text("{oops", encoding="utf-8")
    client = await make_client()
    assert await (await client.get("/local/settings")).json() == DEFAULT_SETTINGS


async def test_static_and_spa_fallback(make_client, tmp_path):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (static / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")

    client = await make_client()
    assert await (await client.get("/")).text() == "<html>app</html>"
    assert await (await client.get("/assets/app.js")).text() == "console.log(1)"
    assert await (await client.get("/some/route")).text() == "<html>app</html>"
    assert (await client.get("/assets/missing.js")).status == 404
    assert (await client.get("/%2e%2e/secret.txt")).status == 404
    # Unknown agent endpoints must not be answered with the SPA page.
    assert (await client.get("/local/usb")).status == 404
    assert (await client.get("/local")).status == 404


def test_config_file_and_env(tmp_path):
    cfg = tmp_path / "config.json"
    cfg.write_text(json.dumps({"api_key": "from-file", "port": 9000, "unknown": 1}), "utf-8")
    config = load_config({"FOT_CONFIG": str(cfg), "FOT_PORT": "8800", "FOT_USB_ROOTS": "/a:/b"})
    assert config.api_key == "from-file"
    assert config.port == 8800
    assert [str(p) for p in config.usb_roots] == ["/a", "/b"]
