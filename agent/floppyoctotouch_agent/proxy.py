"""Same-origin reverse proxy towards OctoPrint (HTTP and WebSocket).

The browser talks only to the agent; the agent adds the ``X-Api-Key`` header so the key is
never exposed to JavaScript.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

import aiohttp
from aiohttp import web
from yarl import URL

log = logging.getLogger(__name__)

PROXIED_PREFIXES = ("/api", "/sockjs", "/plugin", "/downloads")

# Headers that must not be forwarded as-is (RFC 7230 hop-by-hop + ones we set ourselves).
_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
_DROP_REQUEST = _HOP_BY_HOP | {"host", "x-api-key", "authorization", "origin", "referer"}
_DROP_RESPONSE = _HOP_BY_HOP | {"content-length"}

CLIENT_SESSION = web.AppKey("client_session", aiohttp.ClientSession)
WEBCAM_STALL_S = 10.0


def _cut(request: web.Request) -> None:
    """Closes the browser connection without ending the chunked body: the reply is incomplete."""
    if request.transport is not None:
        request.transport.close()


class OctoPrintProxy:
    name = "OctoPrint"
    unreachable = "octoprint_unreachable"
    # Longest silence of the upstream while a reply is read; None = no limit (long OctoPrint calls).
    read_timeout_s: float | None = None

    def __init__(self, upstream: str, api_key: Callable[[], str]) -> None:
        # A callable: the key can be replaced at runtime (System → API key).
        self.upstream = URL(upstream)
        self.api_key = api_key

    def target(self, request: web.Request) -> URL:
        return self.upstream.join(URL(request.raw_path, encoded=True))

    def _upstream_headers(self, request: web.Request) -> dict[str, str]:
        headers = {k: v for k, v in request.headers.items() if k.lower() not in _DROP_REQUEST}
        if key := self.api_key():
            headers["X-Api-Key"] = key
        return headers

    async def handle(self, request: web.Request) -> web.StreamResponse:
        if request.headers.get("Upgrade", "").lower() == "websocket":
            return await self._handle_websocket(request)
        return await self._handle_http(request)

    async def _handle_http(self, request: web.Request) -> web.StreamResponse:
        session = request.app[CLIENT_SESSION]
        body = request.content if request.body_exists else None
        extra = {}
        if self.read_timeout_s is not None:
            extra["timeout"] = aiohttp.ClientTimeout(
                total=None, sock_connect=5, sock_read=self.read_timeout_s
            )
        try:
            async with session.request(
                request.method,
                self.target(request),
                headers=self._upstream_headers(request),
                data=body,
                allow_redirects=False,
                **extra,
            ) as upstream:
                headers = {
                    k: v for k, v in upstream.headers.items() if k.lower() not in _DROP_RESPONSE
                }
                response = web.StreamResponse(status=upstream.status, headers=headers)
                if upstream.content_length is not None:
                    response.content_length = upstream.content_length
                await response.prepare(request)
                endless = upstream.content_type.startswith("multipart/x-mixed-replace")
                try:
                    async for chunk in upstream.content.iter_chunked(64 * 1024):
                        await response.write(chunk)
                    if endless:
                        # After a clean end Chromium keeps showing the last frame and fires no
                        # event: a cut connection breaks the image, the page notices and reconnects.
                        log.warning("%s stream ended by %s", self.name, request.path)
                        _cut(request)
                    else:
                        await response.write_eof()
                except ConnectionResetError:
                    # The browser went away (e.g. an endless MJPEG stream was closed).
                    pass
                except (aiohttp.ClientError, TimeoutError) as exc:
                    # Upstream failed or stalled halfway: never end the body as if it were complete.
                    log.warning(
                        "%s failed during %s: %s", self.name, request.path, exc or "timeout"
                    )
                    _cut(request)
                return response
        except aiohttp.ClientConnectionError as exc:
            log.warning(
                "%s unreachable for %s %s: %s", self.name, request.method, request.path, exc
            )
            return web.json_response({"error": self.unreachable, "detail": str(exc)}, status=502)

    async def _handle_websocket(self, request: web.Request) -> web.StreamResponse:
        session = request.app[CLIENT_SESSION]
        target = self.target(request).with_scheme(
            "wss" if self.upstream.scheme == "https" else "ws"
        )
        key = self.api_key()
        headers = {"X-Api-Key": key} if key else {}

        try:
            upstream = await session.ws_connect(target, headers=headers, max_msg_size=0)
        except (aiohttp.ClientError, aiohttp.WSServerHandshakeError) as exc:
            log.warning("WebSocket upstream connection failed: %s", exc)
            return web.json_response(
                {"error": "octoprint_unreachable", "detail": str(exc)}, status=502
            )

        client = web.WebSocketResponse(max_msg_size=0)
        await client.prepare(request)

        async def pump(src, dst) -> None:
            async for msg in src:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    await dst.send_str(msg.data)
                elif msg.type == aiohttp.WSMsgType.BINARY:
                    await dst.send_bytes(msg.data)
                else:
                    break

        tasks = [
            asyncio.create_task(pump(client, upstream)),
            asyncio.create_task(pump(upstream, client)),
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await upstream.close()
            await client.close()
        return client

    def add_routes(self, app: web.Application) -> None:
        for prefix in PROXIED_PREFIXES:
            app.router.add_route("*", prefix, self.handle)
            app.router.add_route("*", prefix + "/{tail:.*}", self.handle)


class WebcamProxy(OctoPrintProxy):
    """``/webcam/<path>`` → ``<webcam_url>/<path>``, as OctoPi's haproxy does for camera-streamer.

    OctoPrint's default stream URL is the relative ``/webcam/?action=stream``, so the kiosk gets the
    stream through the agent without knowing where the streamer listens. No API key is added.
    """

    name = "Webcam"
    unreachable = "webcam_unreachable"

    def __init__(self, upstream: str) -> None:
        super().__init__(upstream, lambda: "")
        # A streamer that stops sending frames (camera unplugged, USB hiccup) but keeps the
        # connection open would freeze the image: cut it after this long without data.
        self.read_timeout_s = WEBCAM_STALL_S

    def target(self, request: web.Request) -> URL:
        rest = request.raw_path.removeprefix("/webcam").lstrip("/")
        return self.upstream.join(URL("/" + rest, encoded=True))

    async def handle(self, request: web.Request) -> web.StreamResponse:
        if request.method not in ("GET", "HEAD"):
            raise web.HTTPMethodNotAllowed(request.method, ["GET", "HEAD"])
        return await self._handle_http(request)

    def add_routes(self, app: web.Application) -> None:
        app.router.add_route("*", "/webcam", self.handle)
        app.router.add_route("*", "/webcam/{tail:.*}", self.handle)
