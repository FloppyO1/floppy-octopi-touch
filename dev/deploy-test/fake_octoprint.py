"""OctoPrint stand-in for the installer test: /api/version is 200 with the API key, 403 without."""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

API_KEY = sys.argv[1]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        if self.path == "/robots.txt":
            self._json(200, {})
        elif not self.path.startswith("/api/version"):
            self._json(404, {"error": "not found"})
        elif self.headers.get("X-Api-Key") == API_KEY:
            self._json(200, {"api": "0.1", "server": "1.11.8", "text": "OctoPrint 1.11.8"})
        else:
            self._json(403, {"error": "Forbidden"})

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args: object) -> None:
        pass


HTTPServer(("127.0.0.1", 5000), Handler).serve_forever()
