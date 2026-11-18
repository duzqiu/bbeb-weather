"""生成分享封面图（500x400，微信推荐 5:4），纯标准库。"""
import math
import os
import struct
import zlib

W, H = 500, 400

SKY_TOP = (121, 192, 255)
SKY_BOT = (42, 111, 214)
SUN = (255, 210, 74)
CLOUD = (255, 255, 255)
CITY = (24, 48, 104)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def circle_cov(x, y, cx, cy, r, feather):
    d = math.hypot(x - cx, y - cy)
    return clamp((r - d) / feather + 0.5)


def round_rect_cov(x, y, x0, y0, x1, y1, rad, feather):
    cx = clamp(x, x0 + rad, x1 - rad)
    cy = clamp(y, y0 + rad, y1 - rad)
    d = math.hypot(x - cx, y - cy)
    return clamp((rad - d) / feather + 0.5)


# 归一化坐标（0~1）
CLOUDS = [
    (0.30, 0.52, 0.085),
    (0.42, 0.47, 0.070),
    (0.50, 0.55, 0.080),
]
CLOUD_BASE = (0.24, 0.55, 0.58, 0.615, 0.030)
BUILDINGS = [
    (0.02, 0.07, 0.10),
    (0.08, 0.12, 0.16),
    (0.13, 0.17, 0.08),
    (0.186, 0.23, 0.20),
    (0.24, 0.275, 0.12),
    (0.30, 0.345, 0.24),
    (0.36, 0.40, 0.09),
    (0.42, 0.47, 0.17),
    (0.49, 0.53, 0.11),
    (0.55, 0.60, 0.21),
    (0.62, 0.66, 0.13),
    (0.68, 0.73, 0.07),
    (0.75, 0.80, 0.18),
    (0.82, 0.87, 0.11),
    (0.89, 0.94, 0.15),
    (0.95, 0.99, 0.09),
]
GROUND_Y = 0.80


def render():
    rows = []
    feather = 1.6 / W

    for j in range(H):
        v = j / (H - 1)
        br = SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * v
        bg = SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * v
        bb = SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * v
        row = bytearray()

        for i in range(W):
            u = i / (W - 1)
            r, g, b = br, bg, bb

            # 太阳光晕
            glow = circle_cov(u, v, 0.745, 0.245, 0.20, feather * 1.6)
            if glow > 0:
                a = glow * 0.22
                r += (SUN[0] - r) * a
                g += (SUN[1] - g) * a
                b += (SUN[2] - b) * a

            # 太阳
            sun = circle_cov(u, v, 0.745, 0.245, 0.105, feather)
            if sun > 0:
                r += (SUN[0] - r) * sun
                g += (SUN[1] - g) * sun
                b += (SUN[2] - b) * sun

            # 云
            cov = 0.0
            for cx, cy, cr in CLOUDS:
                cov = max(cov, circle_cov(u, v, cx, cy, cr, feather))
            cov = max(
                cov,
                round_rect_cov(u, v, CLOUD_BASE[0], CLOUD_BASE[1],
                               CLOUD_BASE[2], CLOUD_BASE[3], CLOUD_BASE[4], feather),
            )
            if cov > 0:
                a = cov * 0.92
                r += (CLOUD[0] - r) * a
                g += (CLOUD[1] - g) * a
                b += (CLOUD[2] - b) * a

            # 城市剪影
            if v >= GROUND_Y:
                r += (CITY[0] - r) * 0.55
                g += (CITY[1] - g) * 0.55
                b += (CITY[2] - b) * 0.55
            else:
                for x0, x1, hfrac in BUILDINGS:
                    if x0 <= u <= x1 and v >= 1.0 - hfrac:
                        r += (CITY[0] - r) * 0.42
                        g += (CITY[1] - g) * 0.42
                        b += (CITY[2] - b) * 0.42
                        break

            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5)))
        rows.append(bytes(row))
    return rows


def write_png(path, w, h, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))
    print(path, f"{w}x{h}", os.path.getsize(path), "bytes")


write_png("miniprogram/images/share-cover.png", W, H, render())
