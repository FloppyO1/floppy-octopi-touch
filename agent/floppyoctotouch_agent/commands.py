"""Runs the external commands of the agent (wlr-randr, eject, kiosk restart, nmcli)."""

from __future__ import annotations

import asyncio


class CommandError(Exception):
    pass


async def run_command(args: list[str], timeout_s: float) -> str:
    """Runs ``args`` and returns its stdout; raises CommandError with a readable reason."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
    except FileNotFoundError:
        raise CommandError(f"{args[0]} is not installed") from None
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout_s)
    except TimeoutError:
        proc.kill()
        raise CommandError(f"{args[0]} timed out") from None
    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip() or f"exit status {proc.returncode}"
        raise CommandError(f"{args[0]} failed: {detail}")
    return stdout.decode(errors="replace")
