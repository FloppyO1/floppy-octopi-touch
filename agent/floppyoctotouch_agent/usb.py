"""USB sticks plugged into the Pi: list G-code files, import them into OctoPrint, eject.

Sticks are mounted read-only by the system (udev + systemd-mount, see deploy/) under paths
matching ``usb_roots`` (glob patterns, default ``/media/usb*``). The agent never touches anything
outside those mounts: every path from the browser is resolved and checked against its mount.
"""

from __future__ import annotations

import asyncio
import contextlib
import glob
import logging
import os
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from pathlib import Path

from .commands import CommandError, run_command

log = logging.getLogger(__name__)

GCODE_EXTENSIONS = (".gcode", ".gco", ".g")
MAX_DEPTH = 5
MAX_FILES = 1000
# Folders that operating systems leave on sticks.
SKIP_DIRS = {"system volume information", "$recycle.bin", "lost+found"}
POLL_INTERVAL_S = 2.0
CHUNK_BYTES = 256 * 1024
EJECT_TIMEOUT_S = 20


class ApiError(Exception):
    def __init__(self, status: int, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.status = status
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class Mount:
    id: str
    name: str
    path: Path

    def to_json(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name}


def _signature(path: Path) -> tuple[int, int]:
    st = path.stat()
    return st.st_dev, st.st_mtime_ns


def _hidden(name: str) -> bool:
    # Dot files include macOS "._name.gcode" resource forks.
    return name.startswith(".") or name.lower() in SKIP_DIRS


class UsbManager:
    def __init__(self, roots: list[Path], eject_command: list[str], max_file_bytes: int) -> None:
        self.roots = roots
        self.eject_command = eject_command
        self.max_file_bytes = max_file_bytes
        # Ejected mounts stay hidden until they change (re-plugged, or new files in dev).
        self._ejected: dict[Path, tuple[int, int]] = {}

    # ------------------------------------------------------------ discovery
    def mounts(self) -> list[Mount]:
        found: list[Mount] = []
        for pattern in self.roots:
            for match in sorted(glob.glob(str(pattern))):
                path = Path(match)
                try:
                    if not path.is_dir() or not (os.path.ismount(path) or any(path.iterdir())):
                        continue
                    signature = _signature(path)
                except OSError:
                    continue
                if path in self._ejected:
                    if self._ejected[path] == signature:
                        continue
                    del self._ejected[path]
                mount_id = path.name
                if any(m.id == mount_id for m in found):
                    mount_id = f"{mount_id}-{len(found)}"
                # deploy/usb/usb-mount.sh mounts sticks as /media/usb-<label>: show the label.
                name = path.name.removeprefix("usb-") or path.name
                found.append(Mount(mount_id, name, path))
        return found

    def mount(self, mount_id: str) -> Mount:
        for mount in self.mounts():
            if mount.id == mount_id:
                return mount
        raise ApiError(404, "no_such_mount", mount_id)

    def list_files(self) -> list[dict[str, object]]:
        files: list[dict[str, object]] = []
        for mount in self.mounts():
            root = mount.path
            for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
                rel_dir = Path(dirpath).relative_to(root)
                if len(rel_dir.parts) >= MAX_DEPTH:
                    dirnames.clear()
                dirnames[:] = sorted(d for d in dirnames if not _hidden(d))
                for name in sorted(filenames):
                    if _hidden(name) or not name.lower().endswith(GCODE_EXTENSIONS):
                        continue
                    full = Path(dirpath, name)
                    try:
                        if full.is_symlink():
                            continue
                        st = full.stat()
                    except OSError:
                        continue
                    files.append(
                        {
                            "mount": mount.id,
                            "path": (rel_dir / name).as_posix(),
                            "name": name,
                            "size": st.st_size,
                            "date": int(st.st_mtime),
                        }
                    )
                    if len(files) >= MAX_FILES:
                        return files
        return files

    def resolve(self, mount_id: str, rel: str) -> Path:
        """Absolute path of a G-code file on a mount; rejects anything outside it."""
        mount = self.mount(mount_id)
        if not rel or rel.startswith(("/", "\\")) or "\x00" in rel:
            raise ApiError(400, "invalid_path", rel)
        root = mount.path.resolve()
        candidate = (root / rel).resolve()
        if not candidate.is_relative_to(root) or candidate == root:
            raise ApiError(400, "invalid_path", rel)
        if not candidate.name.lower().endswith(GCODE_EXTENSIONS):
            raise ApiError(400, "not_gcode", rel)
        if not candidate.is_file():
            raise ApiError(404, "no_such_file", rel)
        return candidate

    # ------------------------------------------------------------ eject
    async def eject(self, mount_id: str) -> None:
        mount = self.mount(mount_id)
        if self.eject_command:
            args = [part.replace("{path}", str(mount.path)) for part in self.eject_command]
            try:
                await run_command(args, EJECT_TIMEOUT_S)
            except CommandError as exc:
                raise ApiError(503, "eject_failed", str(exc)) from None
            log.info("usb: ejected %s", mount.path)
        else:
            log.info("usb: %s ejected (no eject command configured: only hidden)", mount.path)
        with contextlib.suppress(OSError):
            self._ejected[mount.path] = _signature(mount.path)


# ------------------------------------------------------------------ import
def multipart_parts(filename: str, folder: str) -> tuple[str, bytes, bytes]:
    """(boundary, bytes before the file content, bytes after it) of an OctoPrint upload form."""
    boundary = f"----floppyoctotouch{uuid.uuid4().hex}"
    safe = filename.replace("\\", "_").replace('"', "_").replace("\r", "").replace("\n", "")
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{safe}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}\r\n".encode()
    if folder:
        tail += (
            f'Content-Disposition: form-data; name="path"\r\n\r\n{folder}\r\n--{boundary}\r\n'
        ).encode()
    tail = tail[: -len("\r\n")] + b"--\r\n"
    return boundary, head, tail


async def file_body(
    path: Path, head: bytes, tail: bytes, on_progress: Callable[[int], None]
) -> AsyncIterator[bytes]:
    """Multipart body with the file streamed from disk (reads in a thread)."""
    loop = asyncio.get_running_loop()
    yield head
    sent = 0
    with path.open("rb") as fh:
        while chunk := await loop.run_in_executor(None, fh.read, CHUNK_BYTES):
            sent += len(chunk)
            on_progress(sent)
            yield chunk
    yield tail


# ------------------------------------------------------------------ change notifications
class EventHub:
    """Fan-out of agent events to Server-Sent Events clients (``/local/events``)."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[dict[str, object] | None]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, object] | None]:
        queue: asyncio.Queue[dict[str, object] | None] = asyncio.Queue(maxsize=32)
        self._queues.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, object] | None]) -> None:
        self._queues.discard(queue)

    def publish(self, event: dict[str, object] | None) -> None:
        for queue in list(self._queues):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    def close(self) -> None:
        """Wakes every stream so it can end (app shutdown)."""
        self.publish(None)


class UsbWatcher:
    """Polls the mount set (cheap: a glob and a few stats) and publishes changes."""

    def __init__(self, manager: UsbManager, hub: EventHub) -> None:
        self.manager = manager
        self.hub = hub
        self.current: list[dict[str, str]] = []

    def snapshot(self) -> dict[str, object]:
        return {"type": "usb", "mounts": self.current}

    async def check(self) -> None:
        # The file system is probed in a thread; queues are only touched on the loop.
        found = await asyncio.get_running_loop().run_in_executor(None, self.manager.mounts)
        mounts = [m.to_json() for m in found]
        if mounts != self.current:
            self.current = mounts
            self.hub.publish(self.snapshot())

    async def run(self) -> None:
        while True:
            try:
                await self.check()
            except Exception:  # never let a transient error stop the watcher
                log.exception("usb watcher")
            await asyncio.sleep(POLL_INTERVAL_S)
