"""Host information for the System screen: CPU, memory, disk, network and Wi-Fi.

Everything comes from /proc, /sys and statvfs (no extra dependencies). The Wi-Fi SSID and signal
come from NetworkManager's ``nmcli`` (Raspberry Pi OS Bookworm) when it is installed; otherwise
only the link quality of /proc/net/wireless is known.
"""

from __future__ import annotations

import asyncio
import contextlib
import fcntl
import logging
import os
import socket
import struct
import time
from pathlib import Path
from typing import Any

from .commands import CommandError, run_command

log = logging.getLogger(__name__)

# A CPU sample older than this is not used for the usage delta: take two fresh ones instead.
CPU_SAMPLE_MAX_AGE_S = 30.0
CPU_SAMPLE_GAP_S = 0.25
WIFI_CACHE_S = 10.0
NMCLI_TIMEOUT_S = 3.0
# Link quality in /proc/net/wireless is out of 70 for most drivers (brcmfmac on the Pi too).
WIRELESS_QUALITY_MAX = 70.0
SIOCGIFADDR = 0x8915
# Container and VM plumbing, never interesting on the kiosk.
VIRTUAL_PREFIXES = ("lo", "docker", "veth", "br-", "virbr")


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return None


def _number(path: Path, scale: float = 1.0) -> float | None:
    text = _read(path)
    try:
        return float(text) / scale if text else None
    except ValueError:
        return None


def parse_cpu_times(stat: str) -> tuple[int, int] | None:
    """(total, idle) jiffies from the first line of /proc/stat."""
    first = stat.splitlines()[0].split() if stat else []
    if len(first) < 5 or first[0] != "cpu":
        return None
    values = [int(v) for v in first[1:9]]  # guest time is already part of user time
    idle = values[3] + (values[4] if len(values) > 4 else 0)  # idle + iowait
    return sum(values), idle


def parse_meminfo(text: str) -> dict[str, int]:
    """/proc/meminfo in bytes."""
    result: dict[str, int] = {}
    for line in text.splitlines():
        key, _, rest = line.partition(":")
        parts = rest.split()
        if parts and parts[0].isdigit():
            result[key] = int(parts[0]) * (1024 if parts[1:] == ["kB"] else 1)
    return result


def parse_default_route(text: str) -> tuple[str, str] | None:
    """(interface, gateway) of the IPv4 default route from /proc/net/route."""
    for line in text.splitlines()[1:]:
        fields = line.split()
        if len(fields) < 4 or fields[1] != "00000000":
            continue
        if not int(fields[3], 16) & 0x2:  # RTF_GATEWAY
            continue
        gateway = socket.inet_ntoa(struct.pack("<I", int(fields[2], 16)))
        return fields[0], gateway
    return None


def parse_wireless(text: str) -> dict[str, int]:
    """Link quality in percent per interface from /proc/net/wireless."""
    result: dict[str, int] = {}
    for line in text.splitlines()[2:]:
        name, _, rest = line.partition(":")
        fields = rest.split()
        if len(fields) >= 2:
            with contextlib.suppress(ValueError):
                quality = float(fields[1].rstrip("."))
                result[name.strip()] = round(min(100.0, quality / WIRELESS_QUALITY_MAX * 100))
    return result


def _split_terse(line: str) -> list[str]:
    """Splits an ``nmcli -t`` line on ':' (``\\:`` is an escaped colon inside a value)."""
    fields, current, escaped = [], "", False
    for char in line:
        if escaped:
            current += char
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            fields.append(current)
            current = ""
        else:
            current += char
    fields.append(current)
    return fields


def parse_nmcli_wifi(output: str) -> dict[str, dict[str, Any]]:
    """Active network per device from ``nmcli -t -f ACTIVE,SSID,SIGNAL,DEVICE device wifi list``."""
    result: dict[str, dict[str, Any]] = {}
    for line in output.splitlines():
        fields = _split_terse(line)
        if len(fields) != 4 or fields[0] != "yes":
            continue
        _, ssid, signal, device = fields
        result[device] = {"ssid": ssid or None, "signal": int(signal) if signal.isdigit() else None}
    return result


def _ipv4(name: str) -> str | None:
    """IPv4 address of an interface (SIOCGIFADDR), None when it has none."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            packed = struct.pack("256s", name.encode()[:15])
            return socket.inet_ntoa(fcntl.ioctl(sock.fileno(), SIOCGIFADDR, packed)[20:24])
    except OSError:
        return None


class SystemInfo:
    def __init__(
        self,
        disk_path: Path = Path("/"),
        proc: Path = Path("/proc"),
        sys: Path = Path("/sys"),
        nmcli: str = "nmcli",
    ) -> None:
        self.disk_path = disk_path
        self.proc = proc
        self.sys = sys
        self.nmcli: str | None = nmcli or None
        self._cpu_sample: tuple[float, int, int] | None = None
        self._cpu_percent: float | None = None
        self._wifi_cache: tuple[float, dict[str, dict[str, Any]]] | None = None
        # Tests replace this to fake interface addresses.
        self.ipv4 = _ipv4

    # ------------------------------------------------------------ CPU
    def _cpu_times(self) -> tuple[int, int] | None:
        return parse_cpu_times(_read(self.proc / "stat") or "")

    async def cpu_percent(self) -> float | None:
        now = time.monotonic()
        sample = self._cpu_sample
        if sample is None or now - sample[0] > CPU_SAMPLE_MAX_AGE_S:
            first = self._cpu_times()
            if first is None:
                return None
            sample = (now, *first)
            await asyncio.sleep(CPU_SAMPLE_GAP_S)
            now = time.monotonic()
        current = self._cpu_times()
        if current is None:
            return None
        total, idle = current[0] - sample[1], current[1] - sample[2]
        if total > 0:
            self._cpu_percent = round(max(0.0, min(100.0, (total - idle) / total * 100)), 1)
        self._cpu_sample = (now, *current)
        return self._cpu_percent

    def cpu_temperature(self) -> float | None:
        zones = sorted((self.sys / "class" / "thermal").glob("thermal_zone*"))
        # The SoC sensor ("cpu-thermal" on the Pi) when there are several.
        zones.sort(key=lambda z: "cpu" not in (_read(z / "type") or ""))
        for zone in zones:
            value = _number(zone / "temp", 1000)
            if value is not None:
                return round(value, 1)
        return None

    def cpu(self) -> dict[str, Any]:
        freq = self.sys / "devices" / "system" / "cpu" / "cpu0" / "cpufreq"
        current = _number(freq / "scaling_cur_freq", 1000)
        maximum = _number(freq / "cpuinfo_max_freq", 1000)
        load = (_read(self.proc / "loadavg") or "").split()[:3]
        return {
            "cores": os.cpu_count(),
            "temperature": self.cpu_temperature(),
            "frequency": round(current) if current else None,
            "maxFrequency": round(maximum) if maximum else None,
            "load": [float(v) for v in load] if len(load) == 3 else None,
        }

    # ------------------------------------------------------------ memory and disk
    def memory(self) -> dict[str, Any] | None:
        info = parse_meminfo(_read(self.proc / "meminfo") or "")
        total = info.get("MemTotal")
        if not total:
            return None
        used = total - info.get("MemAvailable", info.get("MemFree", 0))
        return {"total": total, "used": used, "percent": round(used / total * 100, 1)}

    def disk(self) -> dict[str, Any] | None:
        try:
            st = os.statvfs(self.disk_path)
        except OSError:
            return None
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - st.f_bfree * st.f_frsize
        # Like df: the part reserved for root counts as neither used nor available.
        usable = used + free
        return {
            "path": str(self.disk_path),
            "total": total,
            "used": used,
            "free": free,
            "percent": round(used / usable * 100, 1) if usable else None,
        }

    # ------------------------------------------------------------ network
    async def _nmcli_wifi(self) -> dict[str, dict[str, Any]]:
        if not self.nmcli:
            return {}
        now = time.monotonic()
        if self._wifi_cache and now - self._wifi_cache[0] < WIFI_CACHE_S:
            return self._wifi_cache[1]
        args = [self.nmcli, "-t", "-f", "ACTIVE,SSID,SIGNAL,DEVICE", "device", "wifi", "list"]
        try:
            # --rescan no: answer from the last scan instead of waiting for a new one.
            result = parse_nmcli_wifi(await run_command([*args, "--rescan", "no"], NMCLI_TIMEOUT_S))
        except CommandError as exc:
            if "not installed" in str(exc):
                log.info("nmcli not available: no Wi-Fi network name")
                self.nmcli = None
            else:
                log.warning("nmcli: %s", exc)
            result = {}
        self._wifi_cache = (now, result)
        return result

    async def network(self) -> dict[str, Any]:
        net = self.sys / "class" / "net"
        names = sorted(p.name for p in net.iterdir()) if net.is_dir() else []
        interfaces = []
        for name in names:
            if name.startswith(VIRTUAL_PREFIXES):
                continue
            path = net / name
            interfaces.append(
                {
                    "name": name,
                    "state": _read(path / "operstate") or "unknown",
                    "mac": _read(path / "address"),
                    "ipv4": self.ipv4(name),
                    "wireless": (path / "wireless").exists() or (path / "phy80211").exists(),
                }
            )

        route = parse_default_route(_read(self.proc / "net" / "route") or "")
        primary = route[0] if route else None
        if primary not in {i["name"] for i in interfaces}:
            primary = next((i["name"] for i in interfaces if i["ipv4"]), None)

        wifi = None
        wireless = [i for i in interfaces if i["wireless"]]
        if wireless:
            # The one carrying the default route, else the first radio.
            device = next((i for i in wireless if i["name"] == primary), wireless[0])
            quality = parse_wireless(_read(self.proc / "net" / "wireless") or "")
            active = (await self._nmcli_wifi()).get(device["name"], {})
            connected = device["state"] == "up"
            signal = active.get("signal") if active else quality.get(device["name"])
            wifi = {
                "interface": device["name"],
                "connected": connected,
                "ssid": active.get("ssid") if connected else None,
                "signal": signal if connected else None,
            }

        return {
            "primary": primary,
            "gateway": route[1] if route else None,
            "interfaces": interfaces,
            "wifi": wifi,
        }

    # ------------------------------------------------------------ all together
    def uptime(self) -> float | None:
        fields = (_read(self.proc / "uptime") or "").split()
        try:
            return round(float(fields[0])) if fields else None
        except ValueError:
            return None

    async def snapshot(self) -> dict[str, Any]:
        cpu = self.cpu()
        cpu["percent"] = await self.cpu_percent()
        return {
            "hostname": socket.gethostname(),
            "uptime": self.uptime(),
            "cpu": cpu,
            "memory": self.memory(),
            "disk": self.disk(),
            "network": await self.network(),
        }
