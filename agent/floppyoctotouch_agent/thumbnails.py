"""Thumbnails embedded in G-code by PrusaSlicer, OrcaSlicer and friends, with a disk cache.

Slicers write base64 blocks in the comment header, before the first command::

    ; thumbnail begin 220x124 1296        (PNG; also thumbnail_PNG)
    ; thumbnail_JPG begin 220x124 5120
    ; thumbnail_QOI begin 220x124 10788
    ; iVBORw0KGgoAAAANSUhEUgAAANwAAAB8…
    ; thumbnail end

The largest valid image wins. Browsers cannot show QOI, so it is converted to PNG (stdlib only).
The scan stops at the first G-code command, so big files cost only their header.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import inspect
import logging
import os
import re
import struct
import tempfile
import zlib
from collections.abc import AsyncIterable, Callable
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

# Upper bounds: a header is a few hundred KB even with several large thumbnails.
MAX_SCAN_BYTES = 8 * 1024 * 1024
MAX_LINE_BYTES = 64 * 1024
MAX_IMAGE_PIXELS = 1024 * 1024
DEFAULT_CACHE_ENTRIES = 1000

_BEGIN = re.compile(rb"^;\s*thumbnail(?:_(?:png|jpg|qoi))?\s+begin\s+(\d+)\s*x\s*(\d+)", re.I)
_END = re.compile(rb"^;\s*thumbnail(?:_(?:png|jpg|qoi))?\s+end", re.I)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MIME_EXT = {"image/png": ".png", "image/jpeg": ".jpg"}


@dataclass(frozen=True)
class Thumbnail:
    mime: str
    data: bytes


# ------------------------------------------------------------------ image formats
def decode_qoi(data: bytes) -> tuple[int, int, bytes]:
    """QOI → (width, height, RGBA bytes). https://qoiformat.org/qoi-specification.pdf"""
    if len(data) < 22 or data[:4] != b"qoif":
        raise ValueError("not a QOI image")
    width, height = struct.unpack(">II", data[4:12])
    total = width * height
    if not 0 < total <= MAX_IMAGE_PIXELS:
        raise ValueError("unsupported QOI size")
    out = bytearray(total * 4)
    index = [(0, 0, 0, 0)] * 64
    r, g, b, a = 0, 0, 0, 255
    pos, end, px, run = 14, len(data) - 8, 0, 0
    while px < total:
        if run:
            run -= 1
        elif pos < end:
            op = data[pos]
            pos += 1
            if op == 0xFE:
                r, g, b = data[pos], data[pos + 1], data[pos + 2]
                pos += 3
            elif op == 0xFF:
                r, g, b, a = data[pos], data[pos + 1], data[pos + 2], data[pos + 3]
                pos += 4
            elif op >> 6 == 0:
                r, g, b, a = index[op]
            elif op >> 6 == 1:
                r = (r + ((op >> 4) & 3) - 2) & 0xFF
                g = (g + ((op >> 2) & 3) - 2) & 0xFF
                b = (b + (op & 3) - 2) & 0xFF
            elif op >> 6 == 2:
                dg = (op & 0x3F) - 32
                extra = data[pos]
                pos += 1
                r = (r + dg + (extra >> 4) - 8) & 0xFF
                g = (g + dg) & 0xFF
                b = (b + dg + (extra & 0x0F) - 8) & 0xFF
            else:
                run = op & 0x3F
            index[(r * 3 + g * 5 + b * 7 + a * 11) % 64] = (r, g, b, a)
        else:
            raise ValueError("truncated QOI image")
        out[px * 4 : px * 4 + 4] = bytes((r, g, b, a))
        px += 1
    return width, height, bytes(out)


def encode_png(width: int, height: int, rgba: bytes) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(kind + payload)
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)

    stride = width * 4
    raw = b"".join(b"\x00" + rgba[y * stride : (y + 1) * stride] for y in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        PNG_MAGIC
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )


def to_browser_image(data: bytes) -> Thumbnail | None:
    """Recognises the image by its magic bytes (tags lie) and makes it displayable."""
    if data.startswith(PNG_MAGIC):
        return Thumbnail("image/png", data)
    if data.startswith(b"\xff\xd8"):
        return Thumbnail("image/jpeg", data)
    if data.startswith(b"qoif"):
        try:
            return Thumbnail("image/png", encode_png(*decode_qoi(data)))
        except (ValueError, IndexError):
            return None
    return None


# ------------------------------------------------------------------ G-code scanning
class ThumbnailScanner:
    """Fed one line at a time; ``feed`` returns False once the header is over."""

    def __init__(self) -> None:
        self._blocks: list[tuple[int, bytes]] = []
        self._current: list[bytes] | None = None
        self._area = 0

    def feed(self, line: bytes) -> bool:
        text = line.strip()
        if self._current is not None:
            if _END.match(text):
                try:
                    data = base64.b64decode(b"".join(self._current), validate=True)
                    self._blocks.append((self._area, data))
                except (binascii.Error, ValueError):
                    pass
                self._current = None
                return True
            if text.startswith(b";"):
                self._current.append(text[1:].strip())
                return True
            self._current = None  # unterminated block: the header is over
        if not text:
            return True
        if not text.startswith(b";"):
            return False
        match = _BEGIN.match(text)
        if match:
            self._current = []
            self._area = int(match.group(1)) * int(match.group(2))
        return True

    def best(self) -> Thumbnail | None:
        for _, data in sorted(self._blocks, key=lambda block: block[0], reverse=True):
            image = to_browser_image(data)
            if image:
                return image
        return None


def extract_from_file(path: Path) -> Thumbnail | None:
    scanner = ThumbnailScanner()
    read = 0
    with path.open("rb") as fh:
        while read < MAX_SCAN_BYTES:
            line = fh.readline(MAX_LINE_BYTES)
            if not line:
                break
            read += len(line)
            if not scanner.feed(line):
                break
    return scanner.best()


async def extract_from_stream(chunks: AsyncIterable[bytes]) -> ThumbnailScanner:
    """Scans a byte stream (an HTTP download); the caller decodes with ``best()``."""
    scanner = ThumbnailScanner()
    pending = b""
    read = 0
    async for chunk in chunks:
        read += len(chunk)
        pending += chunk
        *lines, pending = pending.split(b"\n")
        for line in lines:
            if not scanner.feed(line[:MAX_LINE_BYTES]):
                return scanner
        pending = pending[-MAX_LINE_BYTES:]
        if read >= MAX_SCAN_BYTES:
            return scanner
    scanner.feed(pending)
    return scanner


# ------------------------------------------------------------------ cache
class ThumbnailCache:
    """``<dir>/<sha1(key)>.png|.jpg`` for thumbnails, ``.none`` for files without one."""

    def __init__(self, directory: Path, max_entries: int = DEFAULT_CACHE_ENTRIES) -> None:
        self.directory = directory
        self.max_entries = max_entries
        self._locks: dict[str, asyncio.Lock] = {}
        # One extraction at a time: the Pi also runs OctoPrint (and maybe a print).
        self._work = asyncio.Semaphore(1)

    @staticmethod
    def file_key(path: Path) -> str:
        st = path.stat()
        return f"file:{path}:{st.st_size}:{st.st_mtime_ns}"

    def _digest(self, key: str) -> str:
        return hashlib.sha1(key.encode()).hexdigest()

    def lookup(self, key: str) -> Thumbnail | None | bool:
        """The cached thumbnail, None if cached as "no thumbnail", False on a miss."""
        base = self.directory / self._digest(key)
        for mime, ext in MIME_EXT.items():
            try:
                return Thumbnail(mime, base.with_suffix(ext).read_bytes())
            except FileNotFoundError:
                continue
        if base.with_suffix(".none").exists():
            return None
        return False

    async def get(self, key: str, compute: Callable[[], object]) -> Thumbnail | None:
        """Cached value for ``key``, or ``await compute()`` / ``compute()`` in a thread."""
        cached = self.lookup(key)
        if cached is not False:
            return cached  # type: ignore[return-value]
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self.lookup(key)
            if cached is not False:
                return cached  # type: ignore[return-value]
            async with self._work:
                result = compute()
                if inspect.isawaitable(result):
                    result = await result
            thumb = result if isinstance(result, Thumbnail) else None
            try:
                self._store(key, thumb)
            except OSError as exc:
                log.warning("thumbnail cache: %s", exc)
        self._locks.pop(key, None)
        return thumb

    def _store(self, key: str, thumb: Thumbnail | None) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        target = (self.directory / self._digest(key)).with_suffix(
            MIME_EXT[thumb.mime] if thumb else ".none"
        )
        fd, tmp = tempfile.mkstemp(dir=self.directory, prefix=".thumb-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(thumb.data if thumb else b"")
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        self._prune()

    def _prune(self) -> None:
        entries = [p for p in self.directory.iterdir() if not p.name.startswith(".")]
        if len(entries) <= self.max_entries:
            return
        entries.sort(key=lambda p: p.stat().st_mtime)
        for old in entries[: len(entries) - self.max_entries]:
            old.unlink(missing_ok=True)


async def thumbnail_for_file(cache: ThumbnailCache, path: Path) -> Thumbnail | None:
    loop = asyncio.get_running_loop()
    return await cache.get(
        ThumbnailCache.file_key(path),
        lambda: loop.run_in_executor(None, extract_from_file, path),
    )
