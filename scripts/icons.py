#!/usr/bin/env python3
"""Generate PNG icons (web app + Chrome extension) with no dependencies."""
import math, struct, zlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG = (12, 11, 16)
ACCENT = (157, 134, 255)
GLOW = (109, 77, 255)


def png(size):
    rows = []
    c = (size - 1) / 2
    r_outer = size * 0.30
    r_ring = size * 0.40
    radius = size * 0.22  # rounded-square corner
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # rounded square mask
            dx = max(abs(x - c) - (c - radius), 0)
            dy = max(abs(y - c) - (c - radius), 0)
            inside = math.hypot(dx, dy) <= radius + 0.5
            if not inside:
                row += bytes((0, 0, 0, 0))
                continue
            d = math.hypot(x - c, y - c)
            col = BG
            if d <= r_outer:
                t = d / r_outer
                col = tuple(int(ACCENT[i] * (1 - t * 0.35) + GLOW[i] * t * 0.35) for i in range(3))
            elif abs(d - r_ring) <= size * 0.025:
                col = tuple(int(BG[i] * 0.4 + GLOW[i] * 0.6) for i in range(3))
            row += bytes((*col, 255))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


for size in (192, 512):
    (ROOT / "web" / "icons" / f"icon-{size}.png").write_bytes(png(size))
for size in (16, 32, 48, 128):
    (ROOT / "extension" / "icons" / f"icon-{size}.png").write_bytes(png(size))

(ROOT / "web" / "icons" / "icon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    '<rect width="64" height="64" rx="14" fill="#0c0b10"/>'
    '<circle cx="32" cy="32" r="25.6" fill="none" stroke="#6d4dff" stroke-opacity=".6" stroke-width="3.2"/>'
    '<circle cx="32" cy="32" r="19.2" fill="#9d86ff"/></svg>\n'
)
print("icons written")
