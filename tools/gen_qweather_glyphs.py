"""拉取和风天气图标字体与代码映射，生成小程序可直接使用的字形表。

用法：python3 tools/gen_qweather_glyphs.py
产物：miniprogram/libs/qweather-glyphs.ts
"""

import re
import urllib.request

CSS_URL = "https://icons.qweather.com/assets/font/qweather-icons.css"
OUT = "miniprogram/libs/qweather-glyphs.ts"

BACKSLASH = chr(92)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "ignore")


def main() -> None:
    css = fetch(CSS_URL)
    pairs = re.findall(r'\.qi-(\w+)::before\s*\{\s*content:\s*"([^"]+)"', css)

    entries = []
    for code, value in pairs:
        if not code.isdigit():
            continue
        matched = re.fullmatch(BACKSLASH * 2 + r"([0-9a-fA-F]{1,6})", value)
        if not matched:
            continue
        entries.append((code, int(matched.group(1), 16)))

    lines = [
        "// libs/qweather-glyphs.ts",
        "// 和风天气图标：icon code → 字形（QWeather Icons，CC BY 4.0）",
        "// 由 tools/gen_qweather_glyphs.py 生成，请勿手改",
        "",
        "const GLYPHS: Record<string, string> = {",
    ]
    for code, codepoint in entries:
        lines.append('  "%s": "%su%04X",' % (code, BACKSLASH, codepoint))
    lines += [
        "}",
        "",
        "export function glyphOf(code: string): string {",
        '  return GLYPHS[code] || ""',
        "}",
        "",
    ]

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))
    print("codes:", len(entries), "->", OUT)


if __name__ == "__main__":
    main()
