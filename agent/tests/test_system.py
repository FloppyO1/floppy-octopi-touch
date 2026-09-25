from __future__ import annotations

import json
import stat

import pytest

from floppyoctotouch_agent import control as control_module
from floppyoctotouch_agent import system as system_module
from floppyoctotouch_agent.commands import CommandError
from floppyoctotouch_agent.config import load_config
from floppyoctotouch_agent.system import (
    SystemInfo,
    parse_cpu_times,
    parse_default_route,
    parse_meminfo,
    parse_nmcli_wifi,
    parse_wireless,
)

from .conftest import API_KEY

# Real files from a Raspberry Pi 4 (Bookworm), trimmed.
PROC_STAT = "cpu  10132153 290696 3084719 46828483 16683 0 25195 0 0 0\ncpu0 1 2 3 4 5 6 7 8 9 10\n"
MEMINFO = "MemTotal:        7998044 kB\nMemFree:         6512344 kB\nMemAvailable:    7340612 kB\n"
ROUTE = (
    "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\n"
    "wlan0\t00000000\t0101A8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0\n"
    "wlan0\t0001A8C0\t00000000\t0001\t0\t0\t600\t00FFFFFF\t0\t0\t0\n"
)
WIRELESS = (
    "Inter-| sta-|   Quality        |   Discarded packets               | Missed | WE\n"
    " face | tus | link level noise |  nwid  crypt   frag  retry   misc | beacon | 22\n"
    " wlan0: 0000   49.  -61.  -256        0      0      0      0     12        0\n"
)
NMCLI = "no:Neighbours:40:wlan0\nyes:Casa\\:5G:82:wlan0\nno::20:wlan0\n"


def test_parsers():
    assert parse_cpu_times(PROC_STAT) == (60377929, 46845166)
    assert parse_cpu_times("") is None
    assert parse_meminfo(MEMINFO)["MemAvailable"] == 7340612 * 1024
    assert parse_default_route(ROUTE) == ("wlan0", "192.168.1.1")
    assert parse_default_route(ROUTE.splitlines()[0]) is None
    assert parse_wireless(WIRELESS) == {"wlan0": 70}
    assert parse_nmcli_wifi(NMCLI) == {"wlan0": {"ssid": "Casa:5G", "signal": 82}}


@pytest.fixture
def pi(tmp_path):
    """A fake /proc and /sys of a Pi on Wi-Fi with eth0 unplugged."""
    proc, sys = tmp_path / "proc", tmp_path / "sys"
    (proc / "net").mkdir(parents=True)
    (proc / "stat").write_text(PROC_STAT)
    (proc / "meminfo").write_text(MEMINFO)
    (proc / "loadavg").write_text("0.52 0.40 0.31 1/245 1234\n")
    (proc / "uptime").write_text("93784.21 350000.00\n")
    (proc / "net" / "route").write_text(ROUTE)
    (proc / "net" / "wireless").write_text(WIRELESS)
    zone = sys / "class" / "thermal" / "thermal_zone0"
    zone.mkdir(parents=True)
    (zone / "type").write_text("cpu-thermal\n")
    (zone / "temp").write_text("48686\n")
    freq = sys / "devices" / "system" / "cpu" / "cpu0" / "cpufreq"
    freq.mkdir(parents=True)
    (freq / "scaling_cur_freq").write_text("1500000\n")
    (freq / "cpuinfo_max_freq").write_text("1800000\n")
    for name, state, wireless in [
        ("eth0", "down", False),
        ("lo", "unknown", False),
        ("wlan0", "up", True),
    ]:
        iface = sys / "class" / "net" / name
        iface.mkdir(parents=True)
        (iface / "operstate").write_text(state + "\n")
        (iface / "address").write_text("dc:a6:32:00:00:01\n")
        if wireless:
            (iface / "wireless").mkdir()
    (sys / "class" / "net" / "docker0").mkdir()

    info = SystemInfo(disk_path=tmp_path, proc=proc, sys=sys, nmcli="")
    info.ipv4 = lambda name: {"wlan0": "192.168.1.42"}.get(name)
    return info


async def test_snapshot_of_a_pi(pi, monkeypatch):
    monkeypatch.setattr(system_module, "CPU_SAMPLE_GAP_S", 0)
    snap = await pi.snapshot()
    assert snap["uptime"] == 93784
    cpu = snap["cpu"]
    assert (cpu["temperature"], cpu["frequency"], cpu["maxFrequency"]) == (48.7, 1500, 1800)
    assert cpu["load"] == [0.52, 0.40, 0.31]
    # Same /proc/stat twice: no time went by, the percentage stays unknown.
    assert cpu["percent"] is None
    assert snap["memory"]["percent"] == pytest.approx(8.2, abs=0.1)
    assert 0 <= snap["disk"]["percent"] <= 100
    assert snap["disk"]["total"] >= snap["disk"]["used"]

    net = snap["network"]
    assert [i["name"] for i in net["interfaces"]] == ["eth0", "wlan0"]
    assert net["primary"] == "wlan0"
    assert net["gateway"] == "192.168.1.1"
    assert net["interfaces"][1] == {
        "name": "wlan0",
        "state": "up",
        "mac": "dc:a6:32:00:00:01",
        "ipv4": "192.168.1.42",
        "wireless": True,
    }
    # No nmcli: no network name, the signal from /proc/net/wireless.
    assert net["wifi"] == {"interface": "wlan0", "connected": True, "ssid": None, "signal": 70}


async def test_cpu_percent_from_the_delta(pi, tmp_path):
    stat_file = tmp_path / "proc" / "stat"
    assert await pi.cpu_percent() is None
    # 100 more jiffies, 25 of them idle.
    stat_file.write_text("cpu  10132203 290696 3084744 46828508 16683 0 25195 0 0 0\n")
    assert await pi.cpu_percent() == 75.0


async def test_wifi_name_from_nmcli_is_cached(pi, monkeypatch):
    calls = []

    async def fake_run(args, timeout_s):
        calls.append(args)
        return NMCLI

    monkeypatch.setattr(system_module, "run_command", fake_run)
    pi.nmcli = "nmcli"
    for _ in range(2):
        wifi = (await pi.network())["wifi"]
        assert wifi == {"interface": "wlan0", "connected": True, "ssid": "Casa:5G", "signal": 82}
    assert len(calls) == 1
    assert calls[0][-2:] == ["--rescan", "no"]


async def test_missing_nmcli_is_not_retried(pi, monkeypatch):
    async def missing(args, timeout_s):
        raise CommandError("nmcli is not installed")

    monkeypatch.setattr(system_module, "run_command", missing)
    pi.nmcli = "nmcli"
    assert (await pi.network())["wifi"]["signal"] == 70
    assert pi.nmcli is None


async def test_system_endpoint(make_client):
    body = await (await (await make_client()).get("/local/system")).json()
    assert {"version", "hostname", "uptime", "cpu", "memory", "disk", "network"} <= body.keys()
    assert body["cpu"]["cores"] >= 1


# ------------------------------------------------------------------ API key


async def test_api_key_state_never_shows_the_key(make_client):
    body = await (await (await make_client()).get("/local/apikey")).json()
    assert body == {"configured": True, "hint": "…cdef", "source": "file", "persistent": True}
    assert API_KEY not in json.dumps(body)


async def test_api_key_is_validated_saved_and_used(make_client, tmp_path):
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({"api_key": "old", "port": 9000}))
    client = await make_client(api_key="an-old-key-that-is-wrong")
    health = await (await client.get("/local/health")).json()
    assert health["octoprint"]["authorized"] is False

    # Wrong key: OctoPrint says 403, nothing is saved.
    resp = await client.put("/local/apikey", json={"apiKey": "wrong-but-well-formed"})
    assert resp.status == 422
    assert (await resp.json())["error"] == "rejected"
    assert json.loads(config_file.read_text())["api_key"] == "old"

    # Surrounding blanks (pasted keys) are trimmed.
    resp = await client.put("/local/apikey", json={"apiKey": f"  {API_KEY}\n"})
    assert resp.status == 200
    assert (await resp.json())["hint"] == "…cdef"
    saved = json.loads(config_file.read_text())
    assert saved == {"api_key": API_KEY, "port": 9000}
    assert stat.S_IMODE(config_file.stat().st_mode) == 0o600
    # Used at once by /local/health and the proxy.
    health = await (await client.get("/local/health")).json()
    assert health["octoprint"]["authorized"] is True
    assert (await (await client.get("/api/anything")).json())["apiKey"] == API_KEY


async def test_api_key_format_and_unreachable_octoprint(make_client):
    client = await make_client()
    for bad in [{"apiKey": "short"}, {"apiKey": "has spaces in the middle!"}, {"key": "x"}, [1]]:
        assert (await client.put("/local/apikey", json=bad)).status == 400
    client = await make_client(octoprint_url="http://127.0.0.1:9")
    resp = await client.put("/local/apikey", json={"apiKey": "a" * 32})
    assert resp.status == 502
    assert (await resp.json())["error"] == "octoprint_unreachable"


def test_api_key_from_environment_is_not_persistent(tmp_path):
    config = load_config({"FOT_CONFIG": str(tmp_path / "c.json"), "FOT_API_KEY": "x" * 32})
    assert config.config_path == tmp_path / "c.json"
    assert config.env_overrides == {"api_key"}
    state = control_module.ControlApi(config)._key_state()
    assert state["source"] == "env"
    assert state["persistent"] is False


def test_config_file_cannot_redirect_the_config_path(tmp_path):
    cfg = tmp_path / "c.json"
    cfg.write_text(json.dumps({"config_path": "/etc/elsewhere.json", "env_overrides": ["x"]}))
    config = load_config({"FOT_CONFIG": str(cfg), "FOT_KIOSK_RESTART_COMMAND": "none"})
    assert config.config_path == cfg
    assert config.env_overrides == {"kiosk_restart_command"}
    assert config.kiosk_restart_command == []


# ------------------------------------------------------------------ kiosk


async def test_kiosk_restart_without_command_only_logs(make_client):
    resp = await (await make_client()).post("/local/kiosk/restart")
    assert await resp.json() == {"restarted": False}


async def test_kiosk_restart_runs_the_command(make_client, monkeypatch):
    calls = []

    async def fake_run(args, timeout_s):
        calls.append(args)
        return ""

    monkeypatch.setattr(control_module, "run_command", fake_run)
    client = await make_client(kiosk_restart_command=["systemctl", "restart", "kiosk"])
    assert await (await client.post("/local/kiosk/restart")).json() == {"restarted": True}
    assert calls == [["systemctl", "restart", "kiosk"]]

    async def failing(args, timeout_s):
        raise CommandError("sudo failed: a password is required")

    monkeypatch.setattr(control_module, "run_command", failing)
    resp = await client.post("/local/kiosk/restart")
    assert resp.status == 503
    assert "password" in (await resp.json())["detail"]
