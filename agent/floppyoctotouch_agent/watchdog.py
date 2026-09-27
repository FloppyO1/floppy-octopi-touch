"""Kiosk watchdog: restarts cage + Chromium when the dashboard page is gone.

When Chromium's renderer dies (e.g. killed by the kernel's OOM killer) the browser keeps running and
shows its "Something went wrong" page, so systemd never restarts the kiosk. The kiosk page always
keeps ``/local/events`` open, and Chromium closes that connection when the renderer goes away: if no
local page (loopback address) reconnects within ``grace_s``, the kiosk restart command runs.

The watchdog is armed only once a local page has connected, and disarmed after a restart until the
next page connects: no restart loop when the kiosk cannot come back, nothing on a host without one.
"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import logging
from collections.abc import Awaitable, Callable

log = logging.getLogger(__name__)


def is_loopback(remote: str | None) -> bool:
    try:
        address = ipaddress.ip_address(remote or "")
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return address.is_loopback


class KioskWatchdog:
    def __init__(self, grace_s: float, restart: Callable[[], Awaitable[object]] | None) -> None:
        self.grace_s = grace_s
        self.restart = restart
        self.enabled = restart is not None and grace_s > 0
        self.pages = 0
        self.armed = False
        self._pending: asyncio.Task[None] | None = None

    def connected(self, remote: str | None) -> bool:
        """Call when an event stream opens; returns whether it counts as a kiosk page."""
        if not self.enabled or not is_loopback(remote):
            return False
        self.pages += 1
        self.armed = True
        self._cancel()
        return True

    def disconnected(self) -> None:
        """Call when a stream for which ``connected()`` returned True closes."""
        self.pages = max(0, self.pages - 1)
        if self.pages == 0 and self.armed and self.enabled:
            self._cancel()
            self._pending = asyncio.create_task(self._expire())

    async def _expire(self) -> None:
        await asyncio.sleep(self.grace_s)
        if self.pages or not self.restart:
            return
        self.armed = False
        log.warning(
            "kiosk page gone for %.0f s (browser crashed?): restarting the kiosk", self.grace_s
        )
        try:
            await self.restart()
        except Exception as exc:  # noqa: BLE001 (logged, the agent keeps running)
            log.error("kiosk restart failed: %s", exc)

    def _cancel(self) -> None:
        if self._pending and not self._pending.done():
            self._pending.cancel()
        self._pending = None

    async def close(self) -> None:
        """Agent shutdown: its own event streams are about to close, never restart for that."""
        self.enabled = False
        if self._pending:
            self._pending.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._pending
            self._pending = None
