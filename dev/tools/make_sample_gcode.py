"""Generate small sample G-code files with embedded slicer thumbnails (stdlib only).

The files mimic PrusaSlicer (PNG and QOI thumbnails) and OrcaSlicer (PNG thumbnail block) output,
so the thumbnail extraction and file metadata can be tested without a real slicer.

    docker run --rm -v "$PWD/dev:/dev-dir" -w /dev-dir python:3.11-slim-bookworm \
        python tools/make_sample_gcode.py sample-gcode
"""

from __future__ import annotations

import base64
import json
import math
import struct
import sys
import zlib
from collections.abc import Callable
from pathlib import Path

Pixel = tuple[int, int, int, int]
Shape = Callable[[float, float], float]  # (u, v) in [-1, 1] -> shade in [0, 1] or <0 for background

BG: Pixel = (24, 26, 31, 255)


# ------------------------------------------------------------------ image encoders
def render(width: int, height: int, shape: Shape, color: tuple[int, int, int]) -> list[Pixel]:
    scale = min(width, height) / 2 * 0.8
    pixels: list[Pixel] = []
    for y in range(height):
        for x in range(width):
            u = (x + 0.5 - width / 2) / scale
            v = (y + 0.5 - height / 2) / scale
            shade = shape(u, v)
            if shade < 0:
                pixels.append(BG)
            else:
                pixels.append(tuple(int(c * (0.45 + 0.55 * shade)) for c in color) + (255,))
    return pixels


def encode_png(width: int, height: int, pixels: list[Pixel]) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for p in pixels[y * width : (y + 1) * width]:
            raw.extend(p)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def encode_qoi(width: int, height: int, pixels: list[Pixel]) -> bytes:
    """Minimal QOI encoder (https://qoiformat.org/qoi-specification.pdf)."""
    out = bytearray(b"qoif" + struct.pack(">II", width, height) + bytes([4, 0]))
    index: list[Pixel] = [(0, 0, 0, 0)] * 64
    prev: Pixel = (0, 0, 0, 255)
    run = 0
    for i, px in enumerate(pixels):
        if px == prev:
            run += 1
            if run == 62 or i == len(pixels) - 1:
                out.append(0xC0 | (run - 1))
                run = 0
            continue
        if run:
            out.append(0xC0 | (run - 1))
            run = 0
        r, g, b, a = px
        h = (r * 3 + g * 5 + b * 7 + a * 11) % 64
        if index[h] == px:
            out.append(h)
        else:
            index[h] = px
            if a == prev[3]:
                dr = (r - prev[0] + 128) % 256 - 128
                dg = (g - prev[1] + 128) % 256 - 128
                db = (b - prev[2] + 128) % 256 - 128
                if -2 <= dr <= 1 and -2 <= dg <= 1 and -2 <= db <= 1:
                    out.append(0x40 | (dr + 2) << 4 | (dg + 2) << 2 | (db + 2))
                elif -32 <= dg <= 31 and -8 <= dr - dg <= 7 and -8 <= db - dg <= 7:
                    out.append(0x80 | (dg + 32))
                    out.append((dr - dg + 8) << 4 | (db - dg + 8))
                else:
                    out.extend((0xFE, r, g, b))
            else:
                out.extend((0xFF, r, g, b, a))
        prev = px
    out.extend(b"\x00" * 7 + b"\x01")
    return bytes(out)


# ------------------------------------------------------------------ shapes
def cube(u: float, v: float) -> float:
    if abs(u) <= 0.75 and abs(v) <= 0.75:
        return 0.6 + 0.4 * (1 - (u + v + 1.5) / 3)
    return -1


def disc(u: float, v: float) -> float:
    r = math.hypot(u, v)
    if r <= 1:
        return 1 - 0.6 * r
    return -1


def triangle(u: float, v: float) -> float:
    if -0.8 <= v <= 0.8 and abs(u) <= (v + 0.8) / 1.6:
        return 1 - (v + 0.8) / 2.4
    return -1


# ------------------------------------------------------------------ G-code
def thumbnail_block(tag: str, width: int, height: int, data: bytes) -> list[str]:
    b64 = base64.b64encode(data).decode()
    lines = [f"; {tag} begin {width}x{height} {len(b64)}"]
    lines += [f"; {b64[i : i + 78]}" for i in range(0, len(b64), 78)]
    lines.append(f"; {tag} end")
    lines.append(";")
    return lines


def square_layers(
    size: float, layers: int, layer_height: float, cx: float = 110.0, cy: float = 110.0
) -> tuple[list[str], float]:
    """Concentric square perimeters centred on the bed. Returns (lines, filament used mm)."""
    e = 0.0
    e_per_mm = 0.0333  # 0.4 mm line, 0.2 mm layer, 1.75 mm filament
    lines: list[str] = []
    for layer in range(layers):
        z = layer_height * (layer + 1)
        lines += [";LAYER_CHANGE", f";Z:{z:.2f}", f";HEIGHT:{layer_height:.2f}", f"G1 Z{z:.3f} F600"]
        for ring in range(3):
            half = size / 2 - ring * 0.45
            corners = [
                (cx - half, cy - half),
                (cx + half, cy - half),
                (cx + half, cy + half),
                (cx - half, cy + half),
                (cx - half, cy - half),
            ]
            lines.append(f"G0 X{corners[0][0]:.3f} Y{corners[0][1]:.3f} F6000")
            for (x0, y0), (x1, y1) in zip(corners, corners[1:], strict=False):
                e += math.hypot(x1 - x0, y1 - y0) * e_per_mm
                lines.append(f"G1 X{x1:.3f} Y{y1:.3f} E{e:.5f} F1800")
    return lines, e


def start_gcode(hotend: int, bed: int) -> list[str]:
    return [
        "M73 P0 R2",
        f"M140 S{bed}",
        f"M104 S{hotend}",
        f"M190 S{bed}",
        f"M109 S{hotend}",
        "G28 ; home all axes",
        "G90",
        "M82 ; absolute extrusion",
        "G92 E0",
        "G1 Z5 F3000",
    ]


def end_gcode() -> list[str]:
    return [
        "G1 Z10 F600",
        "M104 S0",
        "M140 S0",
        "M107",
        "G28 X0",
        "M84",
        "M73 P100 R0",
    ]


def prusaslicer(name: str, shape: Shape, color, thumbs: list[tuple[str, int, int]]) -> str:
    lines = ["; generated by PrusaSlicer 2.8.1+win64 on 2026-09-25 at 10:00:00 UTC", ";"]
    lines.append(";")
    for fmt, w, h in thumbs:
        pixels = render(w, h, shape, color)
        if fmt == "PNG":
            lines += thumbnail_block("thumbnail", w, h, encode_png(w, h, pixels))
        else:
            lines += thumbnail_block("thumbnail_QOI", w, h, encode_qoi(w, h, pixels))
    lines += [";", f"; external perimeters extrusion width = 0.45mm ({name})", ";"]
    lines += start_gcode(200, 60)
    body, filament = square_layers(20, 5, 0.2)
    lines += body
    lines += end_gcode()
    lines += [
        f"; filament used [mm] = {filament:.2f}",
        "; estimated printing time (normal mode) = 2m 10s",
        "; estimated first layer printing time (normal mode) = 25s",
        "; layer_height = 0.2",
        "; filament_type = PLA",
        "; nozzle_diameter = 0.4",
        "; printer_model = TataraA8",
    ]
    return "\n".join(lines) + "\n"


def orcaslicer(name: str, shape: Shape, color) -> str:
    w = h = 300
    lines = [
        "; HEADER_BLOCK_START",
        "; generated by OrcaSlicer 2.3.1 on 2026-09-25 at 10:00:00",
        "; total layer number: 5",
        "; estimated printing time (normal mode) = 2m 5s",
        "; HEADER_BLOCK_END",
        "",
        "; THUMBNAIL_BLOCK_START",
    ]
    lines += thumbnail_block("thumbnail", w, h, encode_png(w, h, render(w, h, shape, color)))
    lines += ["; THUMBNAIL_BLOCK_END", "", "; CONFIG_BLOCK_START", f"; object = {name}"]
    lines += ["; CONFIG_BLOCK_END", ""]
    lines += start_gcode(230, 80)
    body, filament = square_layers(24, 5, 0.2)
    lines += body
    lines += end_gcode()
    lines += [f"; filament used [mm] = {filament:.2f}"]
    return "\n".join(lines) + "\n"


# Several objects for "cancel object": PrusaSlicer names for "OctoPrint comments" and for
# "Firmware-specific" labels (no id/copy, "(Instance N)" for copies), square size, centre.
OBJECTS_SPEC = [
    ("Shape-Box id:0 copy 0", "Shape-Box (Instance 1)", 24.0, (60.0, 60.0)),
    ("Shape-Box id:0 copy 1", "Shape-Box (Instance 2)", 24.0, (160.0, 60.0)),
    ("Shape-Cylinder id:1 copy 0", "Shape-Cylinder", 34.0, (60.0, 160.0)),
    ("Clip id:2 copy 0", "Clip", 12.0, (165.0, 165.0)),
]


def objects_prusaslicer(firmware: bool) -> str:
    """PrusaSlicer "Label objects": OctoPrint comments, or Firmware-specific (M486, Marlin flavor)."""

    def start(index: int, name: str, with_name: bool = False) -> list[str]:
        if firmware:
            return [f"M486 S{index}"] + ([f"M486 A{name}"] if with_name else [])
        return [f"; printing object {name}"]

    def stop(name: str) -> list[str]:
        return ["M486 S-1"] if firmware else [f"; stop printing object {name}"]

    objects = [(fw if firmware else octo, size, centre) for octo, fw, size, centre in OBJECTS_SPEC]

    lines = ["; generated by PrusaSlicer 2.8.1+win64 on 2026-09-27 at 10:00:00 UTC", ";", ""]
    for index, (name, _, _) in enumerate(objects):
        lines += start(index, name, with_name=True) + stop(name)
    lines.append("")
    lines += start_gcode(200, 60)
    lines.append("M83 ; relative extrusion")
    e_per_mm = 0.0333
    filament = 0.0
    for layer in range(10):
        z = 0.2 * (layer + 1)
        lines += [";LAYER_CHANGE", f";Z:{z:.2f}", f"G1 Z{z:.3f} F600"]
        for index, (name, size, (cx, cy)) in enumerate(objects):
            half = size / 2
            corners = [
                (cx - half, cy - half),
                (cx + half, cy - half),
                (cx + half, cy + half),
                (cx - half, cy + half),
                (cx - half, cy - half),
            ]
            lines += start(index, name)
            lines.append(f"G0 X{corners[0][0]:.3f} Y{corners[0][1]:.3f} F6000")
            for (x0, y0), (x1, y1) in zip(corners, corners[1:], strict=False):
                e = math.hypot(x1 - x0, y1 - y0) * e_per_mm
                filament += e
                lines.append(f"G1 X{x1:.3f} Y{y1:.3f} E{e:.5f} F1800")
            lines.append("G4 P250 ; slow enough to cancel an object in the Virtual Printer")
            lines += stop(name)
    lines += end_gcode()
    outlines = [
        {
            "name": name,
            "polygon": [
                [cx - size / 2, cy - size / 2],
                [cx + size / 2, cy - size / 2],
                [cx + size / 2, cy + size / 2],
                [cx - size / 2, cy + size / 2],
            ],
        }
        for name, size, (cx, cy) in objects
    ]
    lines += [
        f"; filament used [mm] = {filament:.2f}",
        "; estimated printing time (normal mode) = 1m 40s",
        "; layer_height = 0.2",
        "; filament_type = PLA",
        "; printer_model = TataraA8",
        "; objects_info = " + json.dumps({"objects": outlines}, separators=(",", ":")),
    ]
    return "\n".join(lines) + "\n"


def main(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files = {
        "calibration-cube_prusaslicer.gcode": prusaslicer(
            "calibration cube", cube, (255, 170, 40), [("PNG", 16, 16), ("PNG", 220, 124)]
        ),
        "coaster_prusaslicer-qoi.gcode": prusaslicer(
            "coaster", disc, (40, 200, 190), [("QOI", 16, 16), ("QOI", 220, 124)]
        ),
        "tatara-logo_orcaslicer.gcode": orcaslicer("tatara logo", triangle, (120, 130, 255)),
        "four-objects_prusaslicer.gcode": objects_prusaslicer(firmware=False),
        "four-objects-m486_prusaslicer.gcode": objects_prusaslicer(firmware=True),
    }
    for filename, content in files.items():
        (out / filename).write_text(content, encoding="utf-8", newline="\n")
        print(f"{filename}: {len(content) // 1024} KiB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sample-gcode")
