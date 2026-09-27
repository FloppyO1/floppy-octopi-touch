"""Printed objects of a G-code file and their footprint on the bed, for "cancel object".

Recognised labels (see docs/PLAN.md, session 11):

- Cancel Objects plugin, which rewrites uploaded files: ``@Object NAME`` / ``@Objectstop NAME``;
- PrusaSlicer / OrcaSlicer "OctoPrint comments": ``; printing object NAME`` /
  ``; stop printing object NAME``;
- Marlin ``M486 S<id>`` (``-1`` = outside any object) with ``M486 A<name>``;
- Cura ``;MESH:NAME`` (``NONMESH`` ends it), Klipper ``EXCLUDE_OBJECT_START NAME=…`` / ``…_END``.

The footprint is the convex hull of the object's extrusion moves, unless the file ships the outlines
(PrusaSlicer ``; objects_info = {…}``, Klipper ``EXCLUDE_OBJECT_DEFINE … POLYGON=[…]``). Results are
cached on disk by path + size + mtime, like the thumbnails.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

MAX_SCAN_BYTES = 512 * 1024 * 1024
MAX_LINE_BYTES = 256 * 1024
GRID_MM = 0.5  # extrusion points are snapped to this grid before the hull
DEFAULT_CACHE_ENTRIES = 200

_KLIPPER_NAME = re.compile(r"NAME=(?:'([^']*)'|\"([^\"]*)\"|(\S+))")
_KLIPPER_POLYGON = re.compile(r"POLYGON=(\[\[.*?\]\])")


@dataclass
class _Object:
    name: str
    m486: int | None = None
    points: set[tuple[float, float]] = field(default_factory=set)
    outline: list[list[float]] | None = None


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Andrew's monotone chain, counter-clockwise, without repeating the first point."""
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


class ObjectScanner:
    """Feed it the lines of a G-code file, then read :meth:`result`."""

    def __init__(self) -> None:
        self.objects: dict[str, _Object] = {}
        self.current: _Object | None = None
        self.processed = False  # the Cancel Objects plugin rewrote the file
        self.labels: set[str] = set()
        self._m486_names: dict[int, str] = {}
        self._m486_last: int | None = None
        self._absolute_xy = True
        self._absolute_e = True
        self._x = 0.0
        self._y = 0.0
        self._e = 0.0

    # ------------------------------------------------------------ objects
    def _object(self, name: str) -> _Object:
        name = name.strip()
        obj = self.objects.get(name)
        if obj is None:
            obj = self.objects[name] = _Object(name)
        return obj

    def _start(self, name: str, label: str) -> None:
        self.labels.add(label)
        self.current = self._object(name) if name.strip() else None

    def _stop(self) -> None:
        self.current = None

    # ------------------------------------------------------------ lines
    def feed(self, raw: str) -> None:
        line = raw.strip()
        if not line:
            return
        first = line[0]
        if first in "Gg":
            self._move(line)
        elif first == ";":
            self._comment(line)
        elif first == "@":
            self._at_command(line)
        elif line.startswith(("M486", "m486")):
            self._m486(line)
        elif line.startswith(("M82", "m82")) and line[3:4] in ("", " ", ";"):
            self._absolute_e = True
        elif line.startswith(("M83", "m83")) and line[3:4] in ("", " ", ";"):
            self._absolute_e = False
        elif line.startswith("EXCLUDE_OBJECT"):
            self._klipper(line)

    def _comment(self, line: str) -> None:
        body = line[1:].strip()
        if body.startswith("printing object "):
            self._start(body[16:], "comments")
        elif body.startswith("stop printing object"):
            self._stop()
        elif line.startswith(";MESH:"):
            name = line[6:].strip()
            if name == "NONMESH":
                self._stop()
            else:
                self._start(name, "cura")
        elif body.startswith("objects_info = "):
            self._objects_info(body[15:])

    def _at_command(self, line: str) -> None:
        # @Object NAME, @Objectstop NAME, @Objectinfo NAME X… Y… (tag "Object" = plugin default)
        if line.startswith("@Objectstop"):
            self.processed = True
            self._stop()
        elif line.startswith("@Objectinfo"):
            self.processed = True
        elif line.startswith("@Object "):
            self.processed = True
            self._start(line[8:], "plugin")

    def _m486(self, line: str) -> None:
        words = line.split(";", 1)[0].split()
        for word in words[1:]:
            key, value = word[:1].upper(), word[1:]
            if key == "S":
                try:
                    index = int(value)
                except ValueError:
                    continue
                self.labels.add("m486")
                self._m486_last = index
                if index < 0:
                    self._stop()
                else:
                    name = self._m486_names.get(index, f"#{index}")
                    obj = self._object(name)
                    obj.m486 = index
                    self.current = obj
            elif key == "A" and self._m486_last is not None and self._m486_last >= 0:
                name = line.split("A", 1)[1].split(";", 1)[0].strip().strip('"')
                self._name_m486(self._m486_last, name)
                break  # the rest of the line is the name

    def _name_m486(self, index: int, name: str) -> None:
        if not name:
            return
        self._m486_names[index] = name
        placeholder = self.objects.pop(f"#{index}", None)
        obj = self._object(name)
        obj.m486 = index
        if placeholder is not None:
            obj.points |= placeholder.points
            if self.current is placeholder:
                self.current = obj

    def _klipper(self, line: str) -> None:
        match = _KLIPPER_NAME.search(line)
        name = next((g for g in match.groups() if g), "") if match else ""
        if line.startswith("EXCLUDE_OBJECT_DEFINE"):
            polygon = _KLIPPER_POLYGON.search(line)
            if name and polygon:
                with contextlib.suppress(ValueError):
                    self._object(name).outline = json.loads(polygon.group(1))
        elif line.startswith("EXCLUDE_OBJECT_START"):
            self._start(name, "klipper")
        elif line.startswith("EXCLUDE_OBJECT_END"):
            self._stop()

    def _objects_info(self, text: str) -> None:
        try:
            data = json.loads(text)
        except ValueError:
            return
        for item in data.get("objects", []) if isinstance(data, dict) else []:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                polygon = item.get("polygon")
                if isinstance(polygon, list) and len(polygon) >= 3:
                    self._object(item["name"]).outline = polygon

    def _move(self, line: str) -> None:
        words = line.split(";", 1)[0].split()
        command = words[0].upper()
        if command in ("G0", "G1", "G2", "G3"):
            x = y = e = None
            for word in words[1:]:
                key = word[:1].upper()
                if key in "XYE":
                    try:
                        value = float(word[1:])
                    except ValueError:
                        continue
                    if key == "X":
                        x = value
                    elif key == "Y":
                        y = value
                    else:
                        e = value
            start = (self._x, self._y)
            if x is not None:
                self._x = x if self._absolute_xy else self._x + x
            if y is not None:
                self._y = y if self._absolute_xy else self._y + y
            if e is not None:
                extruding = e > self._e if self._absolute_e else e > 0
                if self._absolute_e:
                    self._e = e
                if extruding and self.current is not None and (x is not None or y is not None):
                    # Both ends of the extruded segment belong to the object.
                    for px, py in (start, (self._x, self._y)):
                        self.current.points.add(
                            (round(px / GRID_MM) * GRID_MM, round(py / GRID_MM) * GRID_MM)
                        )
        elif command == "G90":
            self._absolute_xy = True
        elif command == "G91":
            self._absolute_xy = False
        elif command == "G92":
            for word in words[1:]:
                if word[:1].upper() == "E":
                    with contextlib.suppress(ValueError):
                        self._e = float(word[1:])

    # ------------------------------------------------------------ result
    def result(self, truncated: bool = False) -> dict[str, object]:
        objects = []
        for obj in self.objects.values():
            if obj.outline:
                hull = [(float(p[0]), float(p[1])) for p in obj.outline if len(p) >= 2]
            else:
                hull = convex_hull(list(obj.points))
            if hull:
                xs = [p[0] for p in hull]
                ys = [p[1] for p in hull]
                bbox = [min(xs), min(ys), max(xs), max(ys)]
                center = [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)]
            else:
                bbox = center = None
            objects.append(
                {
                    "name": obj.name,
                    "m486": obj.m486,
                    "polygon": [[round(x, 2), round(y, 2)] for x, y in hull],
                    "center": center,
                    "bbox": [round(v, 2) for v in bbox] if bbox else None,
                }
            )
        return {
            "objects": objects,
            "labels": sorted(self.labels),
            "processed": self.processed,
            "truncated": truncated,
        }


def scan_file(path: Path) -> dict[str, object]:
    scanner = ObjectScanner()
    read = 0
    with path.open("rb") as fh:
        while read < MAX_SCAN_BYTES:
            line = fh.readline(MAX_LINE_BYTES)
            if not line:
                return scanner.result()
            read += len(line)
            scanner.feed(line.decode("utf-8", errors="replace"))
    return scanner.result(truncated=True)


class ObjectCache:
    """``<dir>/<sha1(key)>.json``; one scan at a time (the Pi may be printing)."""

    def __init__(self, directory: Path, max_entries: int = DEFAULT_CACHE_ENTRIES) -> None:
        self.directory = directory
        self.max_entries = max_entries
        self._work = asyncio.Semaphore(1)

    def _path(self, key: str) -> Path:
        return self.directory / (hashlib.sha1(key.encode()).hexdigest() + ".json")

    def _lookup(self, path: Path) -> tuple[Path, dict[str, object] | None]:
        st = path.stat()
        target = self._path(f"objects:{path}:{st.st_size}:{st.st_mtime_ns}")
        try:
            return target, json.loads(target.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            return target, None

    def _scan_and_store(self, path: Path, target: Path) -> dict[str, object]:
        result = scan_file(path)
        try:
            self._store(target, result)
        except OSError as exc:
            log.warning("object cache: %s", exc)
        return result

    async def objects_for_file(self, path: Path) -> dict[str, object]:
        loop = asyncio.get_running_loop()
        target, cached = await loop.run_in_executor(None, self._lookup, path)
        if cached is not None:
            return cached
        async with self._work:
            return await loop.run_in_executor(None, self._scan_and_store, path, target)

    def _store(self, target: Path, result: dict[str, object]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.directory, prefix=".objects-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(result, fh)
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        entries = [p for p in self.directory.iterdir() if not p.name.startswith(".")]
        if len(entries) > self.max_entries:
            entries.sort(key=lambda p: p.stat().st_mtime)
            for old in entries[: len(entries) - self.max_entries]:
                old.unlink(missing_ok=True)
