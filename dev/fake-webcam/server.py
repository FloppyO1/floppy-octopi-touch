"""Fake webcam for development: an MJPEG stream in the style of mjpg-streamer / camera-streamer.

    GET /?action=stream     multipart/x-mixed-replace MJPEG stream
    GET /?action=snapshot   latest JPEG frame

Frames come from ffmpeg's `testsrc` pattern (moving colours and a frame counter), so a frozen
image in the dashboard is easy to spot. Runs in the octoprint/octoprint image (Python + ffmpeg),
standard library only.
"""

from __future__ import annotations

import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = 8080
FPS = 5
BOUNDARY = "fakewebcamframe"
FFMPEG = [
    "ffmpeg", "-hide_banner", "-loglevel", "error", "-re",
    "-f", "lavfi", "-i", f"testsrc=size=640x480:rate={FPS}",
    "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "7", "-",
]  # fmt: skip

latest: bytes | None = None
frame_ready = threading.Condition()


def produce_frames() -> None:
    global latest
    while True:
        proc = subprocess.Popen(FFMPEG, stdout=subprocess.PIPE)
        buffer = b""
        assert proc.stdout is not None
        while chunk := proc.stdout.read(16384):
            buffer += chunk
            # A baseline JPEG from ffmpeg ends with the EOI marker and has no embedded thumbnail.
            while (end := buffer.find(b"\xff\xd9")) >= 0:
                frame, buffer = buffer[: end + 2], buffer[end + 2 :]
                start = frame.find(b"\xff\xd8")
                if start >= 0:
                    with frame_ready:
                        latest = frame[start:]
                        frame_ready.notify_all()
        proc.wait()
        time.sleep(1)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        action = parse_qs(urlparse(self.path).query).get("action", [""])[0]
        if action == "snapshot":
            self.snapshot()
        elif action == "stream":
            self.stream()
        else:
            self.send_error(404, "use ?action=stream or ?action=snapshot")

    def snapshot(self) -> None:
        with frame_ready:
            frame_ready.wait_for(lambda: latest is not None, timeout=5)
            frame = latest
        if frame is None:
            self.send_error(503, "no frame yet")
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(frame)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(frame)

    def stream(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        last = None
        try:
            while True:
                with frame_ready:
                    frame_ready.wait_for(lambda: latest is not last, timeout=5)
                    frame = latest
                if frame is None or frame is last:
                    continue
                last = frame
                header = (
                    f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\n"
                    f"Content-Length: {len(frame)}\r\n\r\n"
                ).encode()
                self.wfile.write(header + frame + b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass


if __name__ == "__main__":
    threading.Thread(target=produce_frames, daemon=True).start()
    print(f"fake webcam on :{PORT} ({FPS} fps)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
