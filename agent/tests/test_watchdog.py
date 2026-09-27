from __future__ import annotations

import asyncio

from floppyoctotouch_agent import files as files_module
from floppyoctotouch_agent.watchdog import KioskWatchdog, is_loopback


class Restarts:
    def __init__(self) -> None:
        self.count = 0

    async def __call__(self) -> None:
        self.count += 1


def test_only_loopback_pages_count():
    assert is_loopback("127.0.0.1")
    assert is_loopback("::1")
    assert is_loopback("::ffff:127.0.0.1")
    assert not is_loopback("192.168.1.20")
    assert not is_loopback(None)
    assert not is_loopback("nonsense")


async def test_restarts_once_when_the_page_does_not_come_back():
    restarts = Restarts()
    watchdog = KioskWatchdog(0.05, restarts)
    assert watchdog.connected("127.0.0.1")
    watchdog.disconnected()
    await asyncio.sleep(0.15)
    assert restarts.count == 1
    # Disarmed until a page connects again: no restart loop if the kiosk cannot come back.
    assert not watchdog.armed
    watchdog.disconnected()
    await asyncio.sleep(0.15)
    assert restarts.count == 1
    watchdog.connected("127.0.0.1")
    watchdog.disconnected()
    await asyncio.sleep(0.15)
    assert restarts.count == 2


async def test_a_reload_within_the_grace_time_is_fine():
    restarts = Restarts()
    watchdog = KioskWatchdog(0.1, restarts)
    watchdog.connected("127.0.0.1")
    watchdog.disconnected()
    await asyncio.sleep(0.03)
    watchdog.connected("127.0.0.1")
    await asyncio.sleep(0.15)
    assert restarts.count == 0
    # Two pages (e.g. the old one still closing): only the last one leaving counts.
    watchdog.connected("::1")
    watchdog.disconnected()
    await asyncio.sleep(0.15)
    assert restarts.count == 0


async def test_never_armed_without_a_page_disabled_or_remote():
    restarts = Restarts()
    watchdog = KioskWatchdog(0.05, restarts)
    watchdog.disconnected()
    assert not watchdog.connected("192.168.1.20")
    await asyncio.sleep(0.1)
    assert restarts.count == 0
    assert not KioskWatchdog(0, restarts).connected("127.0.0.1")
    assert not KioskWatchdog(60, None).connected("127.0.0.1")


async def test_agent_shutdown_never_restarts():
    restarts = Restarts()
    watchdog = KioskWatchdog(0.05, restarts)
    watchdog.connected("127.0.0.1")
    watchdog.disconnected()
    await watchdog.close()
    watchdog.disconnected()
    await asyncio.sleep(0.1)
    assert restarts.count == 0


async def test_closed_event_stream_restarts_the_kiosk(make_client, tmp_path, monkeypatch):
    # The handler notices a closed stream at its next write (a ping).
    monkeypatch.setattr(files_module, "SSE_PING_S", 0.05)
    marker = tmp_path / "restarted"
    client = await make_client(kiosk_restart_command=["touch", str(marker)], kiosk_watchdog_s=0.2)

    resp = await client.get("/local/events")
    assert (await resp.content.readuntil(b"\n\n")).startswith(b"retry:")
    await asyncio.sleep(0.3)
    assert not marker.exists()
    resp.close()
    for _ in range(40):
        if marker.exists():
            break
        await asyncio.sleep(0.05)
    assert marker.exists()
