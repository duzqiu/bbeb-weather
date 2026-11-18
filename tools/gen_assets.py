"""生成多端应用的占位图标 / 启动图（纯标准库，无第三方依赖）。"""
import math
import os
import struct
import zlib

BG_TOP = (79, 168, 245)
BG_BOT = (29, 95, 196)
SUN = (255, 200, 61)
CLOUD = (255, 255, 255)


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


SHAPES = [
    ("circle", (0.310, 0.290, 0.155), SUN, 1.0),
    ("circle", (0.440, 0.585, 0.125), CLOUD, 0.97),
    ("circle", (0.585, 0.555, 0.105), CLOUD, 0.97),
    ("circle", (0.545, 0.625, 0.135), CLOUD, 0.97),
    ("rrect", (0.345, 0.625, 0.675, 0.705, 0.040), CLOUD, 0.97),
]


def render_rows(size):
    rows = []
    feather = max(1.0, size * 0.004) / size
    for j in range(size):
        v = j / (size - 1)
        br = BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * v
        bg = BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * v
        bb = BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * v
        row = bytearray()
        for i in range(size):
            u = i / (size - 1)
            r, g, b = br, bg, bb
            for kind, p, color, alpha in SHAPES:
                if kind == "circle":
                    cov = circle_cov(u, v, p[0], p[1], p[2], feather)
                else:
                    cov = round_rect_cov(u, v, p[0], p[1], p[2], p[3], p[4], feather)
                if cov <= 0.0:
                    continue
                a = cov * alpha
                r += (color[0] - r) * a
                g += (color[1] - g) * a
                b += (color[2] - b) * a
            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5)))
        rows.append(bytes(row))
    return rows


def write_png(path, w, h, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = b"".join(b"\x00" + r for r in rows)
    comp = zlib.compress(raw, 9)

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
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))
    print(f"{path}  {w}x{h}  {os.path.getsize(path) // 1024} KB")


def icon(size, path):
    write_png(path, size, size, render_rows(size))


def splash(w, h, logo, path):
    """渐变背景 + 居中 logo（只合成 logo 区域，避免整幅逐像素计算）。"""
    rows = [bytearray() for _ in range(h)]
    for j in range(h):
        v = j / (h - 1)
        row = rows[j]
        for i in range(w):
            u = i / (w - 1)
            t = clamp(0.35 * u + 0.65 * v)
            row += bytes(
                (
                    int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t + 0.5),
                    int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t + 0.5),
                    int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t + 0.5),
                )
            )

    feather = max(1.0, logo * 0.004) / logo
    ox = (w - logo) // 2
    oy = (h - logo) // 2
    dest_rows = [memoryview(r) for r in rows]
    # 背景与图标同为不透明，直接按覆盖率替换像素即可
    for j in range(logo):
        v = j / (logo - 1)
        base = dest_rows[oy + j]
        for i in range(logo):
            u = i / (logo - 1)
            r = g = b = None
            for kind, p, color, alpha in SHAPES:
                if kind == "circle":
                    cov = circle_cov(u, v, p[0], p[1], p[2], feather)
                else:
                    cov = round_rect_cov(u, v, p[0], p[1], p[2], p[3], p[4], feather)
                if cov <= 0:
                    continue
                a = cov * alpha
                pr, pg, pb = color
                if r is None:
                    pos = (i + ox) * 3
                    r, g, b = base[pos], base[pos + 1], base[pos + 2]
                r += (pr - r) * a
                g += (pg - g) * a
                b += (pb - b) * a
            if r is not None:
                pos = (i + ox) * 3
                base[pos] = int(r + 0.5)
                base[pos + 1] = int(g + 0.5)
                base[pos + 2] = int(b + 0.5)

    write_png(path, w, h, [bytes(r) for r in rows])


ANDROID_ICONS = {
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

IOS_ICONS = {
    "mainIcon120": 120,
    "mainIcon180": 180,
    "spotlightIcon80": 80,
    "spotlightIcon120": 120,
    "settingsIcon58": 58,
    "settingsIcon87": 87,
    "notificationIcon40": 40,
    "notificationIcon60": 60,
    "appStore1024": 1024,
}

for name, size in ANDROID_ICONS.items():
    icon(size, f"miniapp/android/icons/icon-{name}.png")

for name, size in IOS_ICONS.items():
    icon(size, f"miniapp/ios/icons/{name}.png")

for name, (w, h) in {
    "hdpi": (480, 800),
    "xhdpi": (720, 1280),
    "xxhdpi": (1080, 1920),
}.items():
    splash(w, h, 320, f"miniapp/android/splash/{name}.png")

splash(1080, 1920, 360, "miniapp/ios/splash.png")
