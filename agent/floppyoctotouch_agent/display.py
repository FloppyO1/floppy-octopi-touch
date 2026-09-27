"""HDMI output of the cage kiosk session through ``wlr-randr``: power (idle screen off) and mode.

The idle timer lives in the frontend; the agent only switches the output. The ``none`` backend
(development) only logs and remembers the state, with a fixed list of modes.

A new mode is applied at once but only kept when confirmed within ``REVERT_S`` seconds: a mode the
screen cannot show would otherwise leave a black screen with no way back from the touch screen.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Callable

from .commands import CommandError, run_command

log = logging.getLogger(__name__)

BACKENDS = ("wlr-randr", "none")
COMMAND_TIMEOUT_S = 10
REVERT_S = 15
PREFERRED = "preferred"
MODE_RE = re.compile(r"^(\d{3,4})x(\d{3,4})(?:@(\d{2,3}(?:\.\d+)?)Hz)?$")
# "    1920x1080 px, 60.000000 Hz (preferred, current)" in the output's block of `wlr-randr`.
_MODE_LINE = re.compile(r"^\s+(\d+)x(\d+) px, ([\d.]+) Hz(?: \((.*)\))?")
_FAKE_MODES = ["1920x1080@60Hz", "1280x720@60Hz", "1024x600@60Hz"]


class DisplayError(Exception):
    pass


def valid_mode(mode: str) -> bool:
    return mode == PREFERRED or MODE_RE.fullmatch(mode) is not None


def parse_modes(text: str, output: str) -> tuple[list[str], str | None]:
    """Modes of ``output`` (``WxH@RHz``, refresh rounded, no duplicates) and the current one."""
    modes: list[str] = []
    current = None
    inside = False
    for line in text.splitlines():
        if line and not line[0].isspace():
            inside = line.split(" ", 1)[0] == output
            continue
        match = _MODE_LINE.match(line) if inside else None
        if not match:
            continue
        width, height, refresh, flags = match.groups()
        mode = f"{width}x{height}@{round(float(refresh))}Hz"
        if mode not in modes:
            modes.append(mode)
        if flags and "current" in flags:
            current = mode
    return modes, current


class Display:
    def __init__(
        self,
        backend: str,
        output: str,
        mode: str = PREFERRED,
        save_mode: Callable[[str], None] | None = None,
        mode_locked: bool = False,
    ) -> None:
        if backend not in BACKENDS:
            raise ValueError(f"unknown display backend {backend!r} (expected one of {BACKENDS})")
        self.backend = backend
        self.output = output
        # Switching the output back on picks the screen's preferred mode (1920x1080 on the 7"
        # screen), so the configured mode is set again (see also deploy/kiosk/kiosk.sh).
        self.mode = mode if valid_mode(mode) else PREFERRED
        self.mode_locked = mode_locked  # FOT_DISPLAY_MODE in kiosk.env wins over the settings
        self.on = True
        self._save_mode = save_mode
        self._fake_current = "1024x600@60Hz"
        self._pending: tuple[str, str] | None = None  # (new mode, mode to go back to)
        self._revert_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    def state(self) -> dict[str, object]:
        return {"on": self.on, "backend": self.backend, "output": self.output, "mode": self.mode}

    async def _randr(self, *args: str) -> str:
        try:
            return await run_command(["wlr-randr", *args], COMMAND_TIMEOUT_S)
        except CommandError as exc:
            raise DisplayError(str(exc)) from None

    def _mode_args(self, mode: str) -> list[str]:
        return ["--preferred"] if mode == PREFERRED else ["--custom-mode", mode]

    async def set_power(self, on: bool) -> None:
        async with self._lock:
            if self.backend == "none":
                log.info("display %s (backend 'none': nothing switched)", "on" if on else "off")
            else:
                args = ["--output", self.output, "--on" if on else "--off"]
                if on and self.mode != PREFERRED:
                    args += self._mode_args(self.mode)
                await self._randr(*args)
                log.info("display %s (%s)", "on" if on else "off", self.output)
            self.on = on

    async def modes(self) -> dict[str, object]:
        """Advertised modes, current mode, configured mode and a change waiting for confirmation."""
        if self.backend == "none":
            modes, current = list(_FAKE_MODES), self._fake_current
        else:
            modes, current = parse_modes(await self._randr(), self.output)
        return {
            "mode": self.mode,
            "current": current,
            "modes": modes,
            "locked": self.mode_locked,
            "pending": self._pending[0] if self._pending else None,
            "revertSeconds": REVERT_S,
        }

    async def _apply(self, mode: str) -> None:
        if self.backend == "none":
            self._fake_current = "1920x1080@60Hz" if mode == PREFERRED else mode
            log.info("display mode %s (backend 'none': nothing switched)", mode)
            return
        await self._randr("--output", self.output, *self._mode_args(mode))
        log.info("display mode %s (%s)", mode, self.output)

    async def apply_configured(self) -> None:
        """Sets the configured mode (the kiosk calls this once cage and the agent are up)."""
        async with self._lock:
            if self.mode != PREFERRED:
                await self._apply(self.mode)

    async def try_mode(self, mode: str) -> None:
        """Applies ``mode``; it goes back to the previous one unless :meth:`keep_mode` follows."""
        if not valid_mode(mode):
            raise ValueError(f"invalid mode {mode!r}")
        async with self._lock:
            previous = self._pending[1] if self._pending else self.mode
            self._cancel_revert()
            await self._apply(mode)
            self._pending = (mode, previous)
            self._revert_task = asyncio.create_task(self._revert_later())

    async def keep_mode(self) -> bool:
        """Keeps the mode being tried (saved in the config); False when nothing is pending."""
        async with self._lock:
            if not self._pending:
                return False
            self._cancel_revert()
            self.mode = self._pending[0]
            self._pending = None
            if self._save_mode:
                self._save_mode(self.mode)
            return True

    async def revert_mode(self) -> None:
        async with self._lock:
            self._cancel_revert()
            await self._revert()

    async def _revert_later(self) -> None:
        await asyncio.sleep(REVERT_S)
        async with self._lock:
            self._revert_task = None
            log.warning("display mode not confirmed: going back to %s", self.mode)
            await self._revert()

    async def _revert(self) -> None:
        if not self._pending:
            return
        previous = self._pending[1]
        self._pending = None
        try:
            await self._apply(previous)
        except DisplayError as exc:
            log.error("cannot restore the display mode %s: %s", previous, exc)

    def _cancel_revert(self) -> None:
        if self._revert_task and self._revert_task is not asyncio.current_task():
            self._revert_task.cancel()
        self._revert_task = None

    async def close(self) -> None:
        self._cancel_revert()
