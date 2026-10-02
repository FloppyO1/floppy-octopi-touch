from __future__ import annotations

import time

import pytest
from aiohttp import web

from floppyoctotouch_agent.commands import CommandError
from floppyoctotouch_agent.systime import (
    FakeBackend,
    TimeApi,
    TimedatectlBackend,
    TimeError,
    parse_datetime,
    parse_show,
    zone_details,
)

SHOW = """Timezone=Europe/Rome
LocalRTC=no
CanNTP=yes
NTP=yes
NTPSynchronized=yes
TimeUSec=Fri 2026-10-02 18:18:06 CEST
RTCTimeUSec=n/a
"""
ZONES = "Africa/Abidjan\nAmerica/Argentina/Buenos_Aires\nEurope/Rome\nUTC\n"
WRAPPER = ["sudo", "-n", "/opt/floppyoctotouch/deploy/time/time-set.sh"]


class FakeTimedatectl:
    """Answers like timedatectl on a Pi; records every command."""

    def __init__(self, show: str = SHOW) -> None:
        self.show = show
        self.calls: list[list[str]] = []
        self.fail: str | None = None

    async def __call__(self, args: list[str], timeout_s: float) -> str:
        self.calls.append(args)
        if self.fail:
            raise CommandError(self.fail)
        if args == ["timedatectl", "show"]:
            return self.show
        if args == ["timedatectl", "list-timezones"]:
            return ZONES
        if args[: len(WRAPPER)] == WRAPPER:
            if args[len(WRAPPER) :] == ["ntp", "off"]:
                self.show = self.show.replace("NTP=yes", "NTP=no")
            return ""
        raise AssertionError(f"unexpected command {args}")


def make_app(backend) -> web.Application:
    app = web.Application()
    TimeApi(backend).add_routes(app)
    return app


def test_parsers():
    assert parse_show(SHOW)["Timezone"] == "Europe/Rome"
    assert parse_show("garbage\nNTP=no")["NTP"] == "no"
    assert parse_datetime("2026-10-02 18:30") == "2026-10-02 18:30:00"
    assert parse_datetime("2026-02-28 07:05:09") == "2026-02-28 07:05:09"
    for bad in (
        "2026-02-30 10:00",
        "2026-10-02T18:30",
        "2026-10-02 25:00",
        "1999-01-01 00:00",
        5,
        "",
    ):
        with pytest.raises(TimeError):
            parse_datetime(bad)


def test_zone_details_follow_daylight_saving_time():
    summer = zone_details("Europe/Rome", 1790000000)  # 2026-09-21
    winter = zone_details("Europe/Rome", 1767225600)  # 2026-01-01
    assert summer == {"utcOffsetMinutes": 120, "dst": True, "abbreviation": "CEST"}
    assert winter == {"utcOffsetMinutes": 60, "dst": False, "abbreviation": "CET"}
    assert zone_details("Nope/Nope", 0)["utcOffsetMinutes"] is None


async def test_state_of_a_pi(aiohttp_client):
    run = FakeTimedatectl()
    client = await aiohttp_client(make_app(TimedatectlBackend(WRAPPER, run)))
    data = await (await client.get("/local/time")).json()
    assert data["available"] is True
    assert data["canChange"] is True
    assert (data["timezone"], data["ntp"], data["ntpAvailable"], data["synchronized"]) == (
        "Europe/Rome",
        True,
        True,
        True,
    )
    assert data["utcOffsetMinutes"] in (60, 120)
    assert abs(data["now"] - time.time() * 1000) < 5000
    assert "timezones" not in data

    data = await (await client.get("/local/time?zones=1")).json()
    assert "America/Argentina/Buenos_Aires" in data["timezones"]
    await client.get("/local/time?zones=1")
    assert run.calls.count(["timedatectl", "list-timezones"]) == 1  # cached


async def test_missing_timedatectl_is_reported(aiohttp_client):
    run = FakeTimedatectl()
    run.fail = "timedatectl is not installed"
    client = await aiohttp_client(make_app(TimedatectlBackend(WRAPPER, run)))
    data = await (await client.get("/local/time")).json()
    assert data["available"] is False
    assert data["detail"] == "timedatectl is not installed"


async def test_changes_go_through_the_wrapper_in_order(aiohttp_client):
    run = FakeTimedatectl()
    client = await aiohttp_client(make_app(TimedatectlBackend(WRAPPER, run)))
    resp = await client.post(
        "/local/time",
        json={"datetime": "2026-10-02 18:30", "ntp": False, "timezone": "Europe/Rome"},
    )
    assert resp.status == 200
    assert (await resp.json())["ntp"] is False
    changes = [c[len(WRAPPER) :] for c in run.calls if c[: len(WRAPPER)] == WRAPPER]
    assert changes == [
        ["timezone", "Europe/Rome"],
        ["ntp", "off"],
        ["set", "2026-10-02 18:30:00"],
    ]


async def test_manual_time_needs_ntp_off(aiohttp_client):
    run = FakeTimedatectl()
    client = await aiohttp_client(make_app(TimedatectlBackend(WRAPPER, run)))
    resp = await client.post("/local/time", json={"datetime": "2026-10-02 18:30"})
    assert resp.status == 409
    assert (await resp.json())["error"] == "ntp_active"
    assert not any(c[-2:-1] == ["set"] for c in run.calls)


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"timezone": "Mars/Olympus_Mons"}, "invalid_timezone"),
        ({"timezone": "../../etc/passwd"}, "invalid_timezone"),
        ({"timezone": "Europe/Rome; reboot"}, "invalid_timezone"),
        ({"ntp": "yes"}, "invalid_ntp"),
        ({"datetime": "tomorrow"}, "invalid_datetime"),
        ({}, "nothing_to_do"),
    ],
)
async def test_invalid_requests_run_nothing(aiohttp_client, body, code):
    run = FakeTimedatectl()
    client = await aiohttp_client(make_app(TimedatectlBackend(WRAPPER, run)))
    resp = await client.post("/local/time", json=body)
    assert resp.status == 400
    assert (await resp.json())["error"] == code
    assert not any(c[: len(WRAPPER)] == WRAPPER for c in run.calls)


async def test_without_a_command_the_clock_is_read_only(aiohttp_client):
    client = await aiohttp_client(make_app(TimedatectlBackend([], FakeTimedatectl())))
    assert (await (await client.get("/local/time")).json())["canChange"] is False
    resp = await client.post("/local/time", json={"ntp": False})
    assert resp.status == 403


async def test_failing_wrapper_is_a_503(aiohttp_client):
    run = FakeTimedatectl()

    async def failing(args, timeout_s):
        if args[: len(WRAPPER)] == WRAPPER:
            raise CommandError("sudo failed: a password is required")
        return await run(args, timeout_s)

    client = await aiohttp_client(make_app(TimedatectlBackend(WRAPPER, failing)))
    resp = await client.post("/local/time", json={"timezone": "UTC"})
    assert resp.status == 503
    assert "password" in (await resp.json())["detail"]


async def test_fake_backend_keeps_the_clock_in_memory(aiohttp_client):
    client = await aiohttp_client(make_app(FakeBackend()))
    data = await (await client.get("/local/time?zones=1")).json()
    assert data["backend"] == "fake"
    assert "Europe/Rome" in data["timezones"]
    assert not any(z.startswith(("posix/", "right/")) for z in data["timezones"])

    resp = await client.post(
        "/local/time",
        json={"timezone": "Europe/Rome", "ntp": False, "datetime": "2030-01-15 08:00"},
    )
    data = await resp.json()
    assert (data["timezone"], data["ntp"], data["synchronized"]) == ("Europe/Rome", False, False)
    # 08:00 in Rome (CET, UTC+1) = 07:00 UTC.
    assert abs(data["now"] / 1000 - 1894690800) < 5

    data = await (await client.post("/local/time", json={"ntp": True})).json()
    assert abs(data["now"] - time.time() * 1000) < 5000


async def test_disabled_backend(make_client):
    client = await make_client()
    data = await (await client.get("/local/time")).json()
    assert data["available"] is False
    assert (await client.post("/local/time", json={"ntp": True})).status == 503
