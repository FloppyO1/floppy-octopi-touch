"""HDMI output power (screen off when idle), through ``wlr-randr`` in the cage kiosk session.

The idle timer lives in the frontend; the agent only switches the output. The ``none`` backend
(development) only logs and remembers the state.
"""

from __future__ import annotations

import asyncio
import logging

from .commands import CommandError, run_command

log = logging.getLogger(__name__)

BACKENDS = ("wlr-randr", "none")
COMMAND_TIMEOUT_S = 10


class DisplayError(Exception):
    pass


class Display:
    def __init__(self, backend: str, output: str, mode: str = "preferred") -> None:
        if backend not in BACKENDS:
            raise ValueError(f"unknown display backend {backend!r} (expected one of {BACKENDS})")
        self.backend = backend
        self.output = output
        # Switching the output back on picks the screen's preferred mode (1920x1080 on the 7"
        # screen), so the kiosk's mode is set again (see deploy/kiosk/kiosk.sh).
        self.mode = "" if mode == "preferred" else mode
        self.on = True
        self._lock = asyncio.Lock()

    def state(self) -> dict[str, object]:
        return {"on": self.on, "backend": self.backend, "output": self.output}

    async def set_power(self, on: bool) -> None:
        async with self._lock:
            if self.backend == "none":
                log.info("display %s (backend 'none': nothing switched)", "on" if on else "off")
            else:
                args = ["wlr-randr", "--output", self.output, "--on" if on else "--off"]
                if on and self.mode:
                    args += ["--custom-mode", self.mode]
                try:
                    await run_command(args, COMMAND_TIMEOUT_S)
                except CommandError as exc:
                    raise DisplayError(str(exc)) from None
                log.info("display %s (%s)", "on" if on else "off", self.output)
            self.on = on
