"""Generates the app icons (a dumbbell on a dark background) without external libraries."""
import struct
import sys
import zlib

BG = (11, 13, 16)
FG = (74, 222, 128)


def png(size: int) -> bytes:
    def inside(x: float, y: float) -> bool:
        # coordinates normalised to 0..1
        u, v = x / size, y / size
        bar = 0.30 <= u <= 0.70 and 0.47 <= v <= 0.53
        inner = (0.26 <= u <= 0.34 or 0.66 <= u <= 0.74) and 0.32 <= v <= 0.68
        outer = (0.18 <= u <= 0.25 or 0.75 <= u <= 0.82) and 0.38 <= v <= 0.62
        return bar or inner or outer

    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            rows.extend(FG if inside(x + 0.5, y + 0.5) else BG)

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b'')


out = sys.argv[1]
for name, size in (('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
    with open(f'{out}/{name}', 'wb') as f:
        f.write(png(size))
