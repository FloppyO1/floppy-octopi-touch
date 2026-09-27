"""OctoPrint stand-in for the installer test.

/api/version is 200 with the admin key or the user key, 403 without. The Plugin Manager (admin
key only) "installs" the Cancel Objects plugin by creating PLUGIN_MARKER, which the fake OctoPrint
Python reports as installed; /api/job reports the state in JOB_STATE (Operational without it).
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

API_KEY = sys.argv[1]
USER_KEY = sys.argv[3] if len(sys.argv) > 3 else None  # valid, but no admin rights
PLUGIN_MARKER = Path("/tmp/fake-cancelobject")
JOB_STATE = Path("/tmp/fake-job-state")


class Handler(BaseHTTPRequestHandler):
    def _key(self) -> str | None:
        key = self.headers.get("X-Api-Key")
        if key == API_KEY:
            return "admin"
        if USER_KEY and key == USER_KEY:
            return "user"
        return None

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        if self.path == "/robots.txt":
            self._json(200, {})
        elif self._key() is None:
            self._json(403, {"error": "Forbidden"})
        elif self.path.startswith("/api/version"):
            self._json(200, {"api": "0.1", "server": "1.11.8", "text": "OctoPrint 1.11.8"})
        elif self.path.startswith("/api/job"):
            state = JOB_STATE.read_text().strip() if JOB_STATE.exists() else "Operational"
            self._json(200, {"state": state})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            body = {}
        if self.path != "/api/plugin/pluginmanager":
            self._json(404, {"error": "not found"})
        elif self._key() != "admin":
            self._json(403, {"error": "Forbidden"})
        elif body.get("command") == "install" and "Cancelobject" in str(body.get("url")):
            PLUGIN_MARKER.touch()
            self._json(200, {"in_progress": True})
        elif body.get("command") == "uninstall" and body.get("plugin") == "cancelobject":
            PLUGIN_MARKER.unlink(missing_ok=True)
            self._json(200, {"needs_restart": True})
        else:
            self._json(400, {"error": "bad request"})

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args: object) -> None:
        pass


HTTPServer(("127.0.0.1", int(sys.argv[2])), Handler).serve_forever()
