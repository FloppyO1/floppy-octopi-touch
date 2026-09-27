"""File endpoints of the agent: G-code thumbnails, USB sticks and the local event stream.

GET  /local/thumbnail?path=<local storage path>&v=<file date>
GET  /local/objects?path=<local storage path>  → printed objects and their footprint (cancel object)
GET  /local/usb                         → {"mounts": [...], "files": [...]}
GET  /local/usb/thumbnail?mount=<id>&path=<path>
POST /local/usb/import {"mount", "path", "folder"} → NDJSON progress, then the result
POST /local/usb/eject  {"mount"}
GET  /local/events                      → Server-Sent Events ("usb" mount changes); always open
                                          in the kiosk page: the kiosk watchdog watches it
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path

import aiohttp
from aiohttp import web
from yarl import URL

from .config import Config
from .objects import ObjectCache
from .proxy import CLIENT_SESSION
from .thumbnails import (
    Thumbnail,
    ThumbnailCache,
    extract_from_stream,
    thumbnail_for_file,
)
from .usb import (
    GCODE_EXTENSIONS,
    ApiError,
    EventHub,
    UsbManager,
    UsbWatcher,
    file_body,
    multipart_parts,
)
from .watchdog import KioskWatchdog

log = logging.getLogger(__name__)

PROGRESS_INTERVAL_S = 0.25
SSE_PING_S = 15
IMAGE_CACHE = "public, max-age=3600"


def _error(status: int, code: str, detail: str = "") -> web.Response:
    return web.json_response({"error": code, "detail": detail}, status=status)


def _image(thumb: Thumbnail | None) -> web.Response:
    if thumb is None:
        return web.json_response(
            {"error": "no_thumbnail"}, status=404, headers={"Cache-Control": IMAGE_CACHE}
        )
    return web.Response(
        body=thumb.data, content_type=thumb.mime, headers={"Cache-Control": IMAGE_CACHE}
    )


def _storage_path(rel: str) -> str:
    """Validates a relative OctoPrint storage path (``folder/file.gcode``)."""
    if (
        not rel
        or rel.startswith(("/", "\\"))
        or "\x00" in rel
        or any(part in ("", ".", "..") for part in rel.split("/"))
    ):
        raise ApiError(400, "invalid_path", rel)
    return rel


async def _json_object(request: web.Request) -> dict[str, object]:
    try:
        data = await request.json()
    except ValueError:
        raise ApiError(400, "invalid_json") from None
    if not isinstance(data, dict):
        raise ApiError(400, "invalid_json")
    return data


def _string(data: dict[str, object], key: str, default: str | None = None) -> str:
    value = data.get(key, default)
    if not isinstance(value, str):
        raise ApiError(400, "invalid_request", f"{key} must be a string")
    return value


class FilesApi:
    def __init__(self, config: Config, watchdog: KioskWatchdog | None = None) -> None:
        self.config = config
        self.watchdog = watchdog or KioskWatchdog(0, None)
        self.cache = ThumbnailCache(config.data_dir / "thumbnails")
        self.objects = ObjectCache(config.data_dir / "objects")
        self.usb = UsbManager(
            config.usb_roots, config.usb_eject_command, config.usb_max_file_mb * 1024 * 1024
        )
        self.hub = EventHub()
        self.watcher = UsbWatcher(self.usb, self.hub)

    # ------------------------------------------------------------ thumbnails
    def _uploads_file(self, rel: str) -> Path | None:
        root = self.config.uploads_dir
        try:
            root = root.resolve()
            candidate = (root / rel).resolve()
        except OSError:
            return None
        if not candidate.is_relative_to(root):
            raise ApiError(400, "invalid_path", rel)
        return candidate if candidate.is_file() else None

    async def _download_thumbnail(
        self, session: aiohttp.ClientSession, rel: str, version: str
    ) -> Thumbnail | None:
        """Fallback when OctoPrint's uploads folder is not readable: scan its download."""
        url = URL(self.config.octoprint_url).with_path(f"/downloads/files/local/{rel}")
        headers = {"Accept-Encoding": "identity"}
        if self.config.api_key:
            headers["X-Api-Key"] = self.config.api_key

        async def compute() -> Thumbnail | None:
            async with session.get(url, headers=headers) as resp:
                if resp.status == 404:
                    raise ApiError(404, "no_such_file", rel)
                if resp.status != 200:
                    raise ApiError(502, "download_failed", f"HTTP {resp.status}")
                scanner = await extract_from_stream(resp.content.iter_chunked(64 * 1024))
            return await asyncio.get_running_loop().run_in_executor(None, scanner.best)

        return await self.cache.get(f"http:{rel}:{version}", compute)

    async def local_thumbnail(self, request: web.Request) -> web.Response:
        rel = _storage_path(request.query.get("path", ""))
        if not rel.lower().endswith(GCODE_EXTENSIONS):
            raise ApiError(400, "not_gcode", rel)
        path = self._uploads_file(rel)
        if path is not None:
            return _image(await thumbnail_for_file(self.cache, path))
        try:
            thumb = await self._download_thumbnail(
                request.app[CLIENT_SESSION], rel, request.query.get("v", "")
            )
        except aiohttp.ClientError as exc:
            raise ApiError(502, "octoprint_unreachable", str(exc)) from None
        return _image(thumb)

    async def local_objects(self, request: web.Request) -> web.Response:
        rel = _storage_path(request.query.get("path", ""))
        if not rel.lower().endswith(GCODE_EXTENSIONS):
            raise ApiError(400, "not_gcode", rel)
        path = self._uploads_file(rel)
        if path is None:
            # No download fallback: the whole file would have to go through the proxy.
            raise ApiError(404, "no_such_file", rel)
        return web.json_response(await self.objects.objects_for_file(path))

    # ------------------------------------------------------------ USB
    async def usb_list(self, request: web.Request) -> web.Response:
        loop = asyncio.get_running_loop()
        files = await loop.run_in_executor(None, self.usb.list_files)
        mounts = await loop.run_in_executor(None, self.usb.mounts)
        return web.json_response({"mounts": [m.to_json() for m in mounts], "files": files})

    async def usb_thumbnail(self, request: web.Request) -> web.Response:
        path = await asyncio.get_running_loop().run_in_executor(
            None, self.usb.resolve, request.query.get("mount", ""), request.query.get("path", "")
        )
        return _image(await thumbnail_for_file(self.cache, path))

    async def usb_eject(self, request: web.Request) -> web.Response:
        data = await _json_object(request)
        await self.usb.eject(_string(data, "mount"))
        await self.watcher.check()
        return web.json_response({"ok": True})

    async def _upload(
        self,
        session: aiohttp.ClientSession,
        path: Path,
        folder: str,
        size: int,
        progress: list[int],
    ) -> dict[str, object]:
        boundary, head, tail = multipart_parts(path.name, folder)
        headers = {
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            # A known length: no chunked upload for OctoPrint's streaming form parser.
            "Content-Length": str(len(head) + size + len(tail)),
            "Accept-Encoding": "identity",
        }
        if self.config.api_key:
            headers["X-Api-Key"] = self.config.api_key

        def on_progress(sent: int) -> None:
            progress[0] = sent

        body: AsyncIterator[bytes] = file_body(path, head, tail, on_progress)
        url = f"{self.config.octoprint_url}/api/files/local"
        async with session.post(url, data=body, headers=headers) as resp:
            text = (await resp.read()).decode(errors="replace")
            if resp.status not in (200, 201):
                log.warning("usb import of %s failed: HTTP %s %s", path, resp.status, text[:200])
                return {"error": "upload_failed", "status": resp.status, "detail": text[:300]}
        try:
            local = json.loads(text)["files"]["local"]
        except (ValueError, KeyError, TypeError):
            local = {}
        log.info("usb: imported %s into '%s'", path, folder or "/")
        return {"done": True, "name": local.get("name", path.name), "path": local.get("path")}

    async def usb_import(self, request: web.Request) -> web.StreamResponse:
        data = await _json_object(request)
        folder = _string(data, "folder", "").strip("/")
        if folder:
            _storage_path(folder)
        path = await asyncio.get_running_loop().run_in_executor(
            None, self.usb.resolve, _string(data, "mount"), _string(data, "path")
        )
        size = path.stat().st_size
        if size > self.usb.max_file_bytes:
            raise ApiError(413, "too_large", f"{size} bytes")

        response = web.StreamResponse(
            headers={"Content-Type": "application/x-ndjson", "Cache-Control": "no-cache"}
        )
        await response.prepare(request)

        async def emit(message: dict[str, object]) -> None:
            await response.write((json.dumps(message) + "\n").encode())

        progress = [0]
        upload = asyncio.create_task(
            self._upload(request.app[CLIENT_SESSION], path, folder, size, progress)
        )
        try:
            await emit({"sent": 0, "total": size})
            while not upload.done():
                await asyncio.wait({upload}, timeout=PROGRESS_INTERVAL_S)
                await emit({"sent": progress[0], "total": size})
            try:
                result = upload.result()
            except (aiohttp.ClientError, OSError) as exc:
                result = {"error": "upload_failed", "detail": str(exc)}
            await emit(result)
            await response.write_eof()
        except ConnectionResetError:
            log.info("usb import of %s cancelled by the client", path)
        finally:
            if not upload.done():
                upload.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await upload
        return response

    # ------------------------------------------------------------ events
    async def events(self, request: web.Request) -> web.StreamResponse:
        await self.watcher.check()
        queue = self.hub.subscribe()
        kiosk_page = self.watchdog.connected(request.remote)
        response = web.StreamResponse(
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )
        try:
            await response.prepare(request)
            await response.write(b"retry: 3000\n\n")
            event: dict[str, object] | None = self.watcher.snapshot()
            # A None event means the agent is shutting down.
            while event is not None:
                payload = json.dumps(event)
                await response.write(f"event: {event['type']}\ndata: {payload}\n\n".encode())
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), SSE_PING_S)
                        break
                    except TimeoutError:
                        await response.write(b": ping\n\n")
        except ConnectionResetError:
            pass
        finally:
            self.hub.unsubscribe(queue)
            if kiosk_page:
                self.watchdog.disconnected()
        return response

    # ------------------------------------------------------------ wiring
    @web.middleware
    async def errors(self, request: web.Request, handler) -> web.StreamResponse:
        try:
            return await handler(request)
        except ApiError as exc:
            return _error(exc.status, exc.code, exc.detail)

    async def _watch(self, app: web.Application) -> AsyncIterator[None]:
        task = asyncio.create_task(self.watcher.run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def _shutdown(self, app: web.Application) -> None:
        await self.watchdog.close()
        self.hub.close()

    def add_routes(self, app: web.Application) -> None:
        app.middlewares.append(self.errors)
        app.cleanup_ctx.append(self._watch)
        app.on_shutdown.append(self._shutdown)
        app.router.add_get("/local/thumbnail", self.local_thumbnail)
        app.router.add_get("/local/objects", self.local_objects)
        app.router.add_get("/local/usb", self.usb_list)
        app.router.add_get("/local/usb/thumbnail", self.usb_thumbnail)
        app.router.add_post("/local/usb/import", self.usb_import)
        app.router.add_post("/local/usb/eject", self.usb_eject)
        app.router.add_get("/local/events", self.events)
