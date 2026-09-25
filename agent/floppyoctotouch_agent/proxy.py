"""Same-origin reverse proxy towards OctoPrint (HTTP and WebSocket).

The browser talks only to the agent; the agent adds the ``X-Api-Key`` header so the key is
never exposed to JavaScript.
"""

from __future__ import annotations

import asyncio
import logging

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


class OctoPrintProxy:
    def __init__(self, upstream: str, api_key: str) -> None:
        self.upstream = URL(upstream)
        self.api_key = api_key

    def target(self, request: web.Request) -> URL:
        return self.upstream.join(URL(request.raw_path, encoded=True))

    def _upstream_headers(self, request: web.Request) -> dict[str, str]:
        headers = {k: v for k, v in request.headers.items() if k.lower() not in _DROP_REQUEST}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key
        return headers

    async def handle(self, request: web.Request) -> web.StreamResponse:
        if request.headers.get("Upgrade", "").lower() == "websocket":
            return await self._handle_websocket(request)
        return await self._handle_http(request)

    async def _handle_http(self, request: web.Request) -> web.StreamResponse:
        session = request.app[CLIENT_SESSION]
        body = request.content if request.body_exists else None
        try:
            async with session.request(
                request.method,
                self.target(request),
                headers=self._upstream_headers(request),
                data=body,
                allow_redirects=False,
            ) as upstream:
                headers = {
                    k: v for k, v in upstream.headers.items() if k.lower() not in _DROP_RESPONSE
                }
                response = web.StreamResponse(status=upstream.status, headers=headers)
                if upstream.content_length is not None:
                    response.content_length = upstream.content_length
                await response.prepare(request)
                async for chunk in upstream.content.iter_chunked(64 * 1024):
                    await response.write(chunk)
                await response.write_eof()
                return response
        except aiohttp.ClientConnectionError as exc:
            log.warning("OctoPrint unreachable for %s %s: %s", request.method, request.path, exc)
            return web.json_response(
                {"error": "octoprint_unreachable", "detail": str(exc)}, status=502
            )

    async def _handle_websocket(self, request: web.Request) -> web.StreamResponse:
        session = request.app[CLIENT_SESSION]
        target = self.target(request).with_scheme(
            "wss" if self.upstream.scheme == "https" else "ws"
        )
        headers = {"X-Api-Key": self.api_key} if self.api_key else {}

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
