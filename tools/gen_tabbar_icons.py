"""生成 tabBar 图标（81x81 PNG，透明背景，纯标准库）。"""
import math
import os
import struct
import zlib

SIZE = 81
GRAY = (138, 138, 138)
GREEN = (7, 193, 96)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def circle_cov(x, y, cx, cy, r, feather):
    d = math.hypot(x - cx, y - cy)
    return clamp((r - d) / feather + 0.5)


def segment_cov(x, y, x1, y1, x2, y2, half, feather):
    dx, dy = x2 - x1, y2 - y1
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else clamp(((x - x1) * dx + (y - y1) * dy) / length2)
    px, py = x1 + t * dx, y1 + t * dy
    d = math.hypot(x - px, y - py)
    return clamp((half - d) / feather + 0.5)


def render(size, shapes):
    rows = []
    feather = max(0.8, size * 0.01) / size

    for j in range(size):
        v = j / (size - 1)
        row = bytearray()
        for i in range(size):
            u = i / (size - 1)
            cov = 0.0
            for kind, p in shapes:
                if kind == "circle":
                    c = circle_cov(u, v, p[0], p[1], p[2], feather)
                else:
                    c = segment_cov(u, v, p[0], p[1], p[2], p[3], p[4], feather)
                if c > cov:
                    cov = c
                    if cov >= 1.0:
                        break
            row += bytes((0, 0, 0, int(round(cov * 255))))
        rows.append(bytes(row))
    return rows


def write_png(path, w, h, rows, color):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    # RGBA，颜色由 RGB 通道决定，透明度来自 alpha 通道
    out = []
    for r in rows:
        buf = bytearray()
        for k in range(0, len(r), 4):
            buf += bytes((color[0], color[1], color[2], r[k + 3]))
        out.append(bytes(buf))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + r for r in out)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))
    print(f"{path}  {w}x{h}  {os.path.getsize(path)} B")


def weather_shapes():
    shapes = [("circle", (0.50, 0.50, 0.195))]
    for k in range(8):
        a = math.pi * 2 * k / 8
        x1, y1 = 0.5 + 0.275 * math.cos(a), 0.5 + 0.275 * math.sin(a)
        x2, y2 = 0.5 + 0.385 * math.cos(a), 0.5 + 0.385 * math.sin(a)
        shapes.append(("seg", (x1, y1, x2, y2, 0.028)))
    return shapes


def mine_shapes():
    return [
        ("circle", (0.50, 0.300, 0.135)),
        ("circle", (0.50, 1.000, 0.400)),
    ]


for name, shapes in (("weather", weather_shapes()), ("mine", mine_shapes())):
    gray_rows = render(SIZE, shapes)
    write_png(f"miniprogram/images/tabbar/{name}.png", SIZE, SIZE, gray_rows, GRAY)
    green_rows = render(SIZE, shapes)
    write_png(
        f"miniprogram/images/tabbar/{name}-active.png", SIZE, SIZE, green_rows, GREEN
    )
