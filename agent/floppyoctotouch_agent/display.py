"""HDMI output power (screen off when idle), through ``wlr-randr`` in the cage kiosk session.

The idle timer lives in the frontend; the agent only switches the output. The ``none`` backend
(development) only logs and remembers the state.
"""

from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)

BACKENDS = ("wlr-randr", "none")
COMMAND_TIMEOUT_S = 10


class DisplayError(Exception):
    pass


class Display:
    def __init__(self, backend: str, output: str) -> None:
        if backend not in BACKENDS:
            raise ValueError(f"unknown display backend {backend!r} (expected one of {BACKENDS})")
        self.backend = backend
        self.output = output
        self.on = True
        self._lock = asyncio.Lock()

    def state(self) -> dict[str, object]:
        return {"on": self.on, "backend": self.backend, "output": self.output}

    async def set_power(self, on: bool) -> None:
        async with self._lock:
            if self.backend == "none":
                log.info("display %s (backend 'none': nothing switched)", "on" if on else "off")
            else:
                await self._wlr_randr(on)
            self.on = on

    async def _wlr_randr(self, on: bool) -> None:
        args = ["wlr-randr", "--output", self.output, "--on" if on else "--off"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), COMMAND_TIMEOUT_S)
        except FileNotFoundError:
            raise DisplayError("wlr-randr is not installed") from None
        except TimeoutError:
            proc.kill()
            raise DisplayError("wlr-randr timed out") from None
        if proc.returncode != 0:
            detail = stderr.decode(errors="replace").strip() or f"exit status {proc.returncode}"
            raise DisplayError(f"wlr-randr failed: {detail}")
        log.info("display %s (%s)", "on" if on else "off", self.output)
