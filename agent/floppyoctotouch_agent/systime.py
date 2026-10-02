"""Date, time and time zone of the Pi (System → Settings → Date and time).

``GET /local/time``          current state; ``?zones=1`` adds the list of time zones
``POST /local/time``         ``{"timezone"?, "ntp"?: bool, "datetime"?: "YYYY-MM-DD HH:MM[:SS]"}``,
                             applied in that order (the manual time needs NTP off)

Reads use ``timedatectl`` as the agent's own user (systemd-timedated over D-Bus). Changes go only
through ``time_command`` (``deploy/time/time-set.sh`` run with sudo), which validates its arguments
again: the agent never runs ``timedatectl`` with free arguments as root.

Backends: ``timedatectl`` (the Pi), ``fake`` (development: state kept in memory) and ``none``.
"""

from __future__ import annotations

import logging
import re
import time
import zoneinfo
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from aiohttp import web

from .commands import CommandError, run_command

log = logging.getLogger(__name__)

READ_TIMEOUT_S = 5
WRITE_TIMEOUT_S = 15
# Same rules as time-set.sh: Area/City (up to three parts) or a single name like "UTC".
ZONE_RE = re.compile(r"^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+){0,2}$")
DATETIME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$")
# A manual clock outside these years is a typo, not a wish.
MIN_YEAR, MAX_YEAR = 2020, 2099

Runner = Callable[[list[str], float], Awaitable[str]]


class TimeError(Exception):
    def __init__(self, status: int, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.status = status
        self.code = code
        self.detail = detail


def parse_datetime(value: object) -> str:
    """Checks a manual time and returns it as ``YYYY-MM-DD HH:MM:SS`` (local time of the Pi)."""
    match = DATETIME_RE.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise TimeError(400, "invalid_datetime", "expected YYYY-MM-DD HH:MM[:SS]")
    year, month, day, hour, minute, second = (int(part or 0) for part in match.groups())
    try:
        parsed = datetime(year, month, day, hour, minute, second)
    except ValueError as exc:
        raise TimeError(400, "invalid_datetime", str(exc)) from None
    if not MIN_YEAR <= parsed.year <= MAX_YEAR:
        raise TimeError(400, "invalid_datetime", f"year must be {MIN_YEAR}-{MAX_YEAR}")
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def zone_details(name: str, now: float) -> dict[str, object]:
    """UTC offset, daylight saving time and abbreviation of ``name`` at ``now`` (epoch seconds)."""
    try:
        zone = zoneinfo.ZoneInfo(name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        return {"utcOffsetMinutes": None, "dst": None, "abbreviation": None}
    local = datetime.fromtimestamp(now, UTC).astimezone(zone)
    offset = local.utcoffset()
    dst = local.dst()
    return {
        "utcOffsetMinutes": round(offset.total_seconds() / 60) if offset is not None else None,
        "dst": bool(dst) if dst is not None else None,
        "abbreviation": local.tzname(),
    }


def parse_show(text: str) -> dict[str, str]:
    """``timedatectl show`` output (``Key=value`` lines) as a dict."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.partition("=")
        if sep:
            values[key.strip()] = value.strip()
    return values


@dataclass
class ClockState:
    timezone: str
    ntp: bool
    ntp_available: bool
    synchronized: bool
    now: float


class TimedatectlBackend:
    """The real Pi: reads through ``timedatectl``, changes through the sudo wrapper."""

    name = "timedatectl"

    def __init__(self, command: list[str], run: Runner = run_command) -> None:
        self.command = command
        self.run = run
        self._zones: list[str] | None = None

    @property
    def can_change(self) -> bool:
        return bool(self.command)

    async def state(self) -> ClockState:
        try:
            values = parse_show(await self.run(["timedatectl", "show"], READ_TIMEOUT_S))
        except CommandError as exc:
            raise TimeError(503, "unavailable", str(exc)) from None
        return ClockState(
            timezone=values.get("Timezone") or "UTC",
            ntp=values.get("NTP") == "yes",
            ntp_available=values.get("CanNTP") == "yes",
            synchronized=values.get("NTPSynchronized") == "yes",
            now=time.time(),
        )

    async def zones(self) -> list[str]:
        if self._zones is None:
            try:
                text = await self.run(["timedatectl", "list-timezones"], READ_TIMEOUT_S)
            except CommandError as exc:
                raise TimeError(503, "unavailable", str(exc)) from None
            self._zones = [z for z in (line.strip() for line in text.splitlines()) if z]
        return self._zones

    async def _change(self, *args: str) -> None:
        if not self.command:
            raise TimeError(403, "read_only", "no time_command configured")
        try:
            await self.run([*self.command, *args], WRITE_TIMEOUT_S)
        except CommandError as exc:
            raise TimeError(503, "command_failed", str(exc)) from None

    async def set_timezone(self, zone: str) -> None:
        await self._change("timezone", zone)

    async def set_ntp(self, on: bool) -> None:
        await self._change("ntp", "on" if on else "off")

    async def set_datetime(self, value: str) -> None:
        await self._change("set", value)


class FakeBackend:
    """Development: a clock kept in memory (the container has no systemd)."""

    name = "fake"
    can_change = True

    def __init__(self) -> None:
        self.timezone = "Etc/UTC"
        self.ntp = True
        self.offset_s = 0.0

    async def state(self) -> ClockState:
        return ClockState(self.timezone, self.ntp, True, self.ntp, time.time() + self.offset_s)

    async def zones(self) -> list[str]:
        # The list timedatectl prints: no "posix/" or "right/" copies, no lower-case legacy names.
        return sorted(
            z for z in zoneinfo.available_timezones() if z[0].isupper() and "/" in z or z == "UTC"
        )

    async def set_timezone(self, zone: str) -> None:
        self.timezone = zone

    async def set_ntp(self, on: bool) -> None:
        self.ntp = on
        if on:
            self.offset_s = 0.0

    async def set_datetime(self, value: str) -> None:
        local = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        target = local.replace(tzinfo=zoneinfo.ZoneInfo(self.timezone)).timestamp()
        self.offset_s = target - time.time()


Backend = TimedatectlBackend | FakeBackend


class TimeApi:
    def __init__(self, backend: Backend | None) -> None:
        self.backend = backend

    async def snapshot(self, with_zones: bool = False) -> dict[str, object]:
        backend = self.backend
        if backend is None:
            return {"available": False, "detail": "disabled", "now": round(time.time() * 1000)}
        try:
            state = await backend.state()
        except TimeError as exc:
            return {"available": False, "detail": exc.detail, "now": round(time.time() * 1000)}
        data: dict[str, object] = {
            "available": True,
            "backend": backend.name,
            "canChange": backend.can_change,
            "timezone": state.timezone,
            **zone_details(state.timezone, state.now),
            "now": round(state.now * 1000),
            "ntp": state.ntp,
            "ntpAvailable": state.ntp_available,
            "synchronized": state.synchronized,
        }
        if with_zones:
            try:
                data["timezones"] = await backend.zones()
            except TimeError as exc:
                log.warning("time zones: %s", exc.detail)
                data["timezones"] = []
        return data

    async def apply(self, data: dict[str, object]) -> None:
        backend = self.backend
        if backend is None:
            raise TimeError(503, "unavailable", "disabled")
        if not backend.can_change:
            raise TimeError(403, "read_only", "no time_command configured")
        zone = data.get("timezone")
        ntp = data.get("ntp")
        manual = data.get("datetime")
        if zone is not None:
            if not isinstance(zone, str) or not ZONE_RE.fullmatch(zone):
                raise TimeError(400, "invalid_timezone", "expected Area/City")
            if zone not in await backend.zones():
                raise TimeError(400, "invalid_timezone", f"unknown time zone {zone}")
        if ntp is not None and not isinstance(ntp, bool):
            raise TimeError(400, "invalid_ntp", "expected true or false")
        value = parse_datetime(manual) if manual is not None else None
        if zone is None and ntp is None and value is None:
            raise TimeError(400, "nothing_to_do", "expected timezone, ntp or datetime")

        if zone is not None:
            await backend.set_timezone(zone)
            log.info("time zone set to %s", zone)
        if ntp is not None:
            await backend.set_ntp(ntp)
            log.info("network time %s", "on" if ntp else "off")
        if value is not None:
            # timedatectl refuses a manual time while NTP is on: say why instead of its message.
            if (await backend.state()).ntp:
                raise TimeError(409, "ntp_active", "switch the automatic time off first")
            await backend.set_datetime(value)
            log.info("clock set to %s (local time)", value)

    async def get(self, request: web.Request) -> web.Response:
        with_zones = request.query.get("zones") in ("1", "true")
        return web.json_response(await self.snapshot(with_zones))

    async def post(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except ValueError:
            return _error(TimeError(400, "invalid_json"))
        if not isinstance(data, dict):
            return _error(TimeError(400, "invalid_json", "expected a JSON object"))
        try:
            await self.apply(data)
        except TimeError as exc:
            if exc.status >= 500:
                log.warning("time: %s", exc.detail)
            return _error(exc)
        return web.json_response(await self.snapshot())

    def add_routes(self, app: web.Application) -> None:
        app.router.add_get("/local/time", self.get)
        app.router.add_post("/local/time", self.post)


def _error(exc: TimeError) -> web.Response:
    return web.json_response({"error": exc.code, "detail": exc.detail}, status=exc.status)


def make_backend(kind: str, command: list[str]) -> Backend | None:
    if kind == "timedatectl":
        return TimedatectlBackend(command)
    if kind == "fake":
        return FakeBackend()
    if kind != "none":
        log.warning("unknown time_backend %r: date and time settings disabled", kind)
    return None
