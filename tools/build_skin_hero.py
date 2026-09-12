#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_skin_hero.py — 把竖版图片重构成适合 WorkBuddy 皮肤背景的横版图

为什么需要这一步
────────────────
skin-css 生成的背景是：

    #root { background: ... url(hero) right center / cover no-repeat fixed; }

竖版图（手机壁纸、竖版海报，例如 1080x1439）在 16:9 窗口下，cover 会按宽度铺满
→ 放大约 1.78 倍 → 垂直居中裁切，只露出原图中间约 43%。结果是：顶部的 logo、
标题、品牌标识必然被裁掉。

本脚本把竖图重新构图为横版：左侧用面板底色填充（正好落在 WorkBuddy 的内容区，
且会被 studio 自带的渐变遮罩覆盖），右侧原图 **完整保留不裁切**，接缝处做 alpha
淡出过渡。这样品牌信息与画面主体都在，左侧又是干净的可用区域。

用法
────
    # 单张：填充色自动取图片左边缘的平均色
    python build_skin_hero.py --image poster.jpg --out hero.jpg

    # 指定填充色，并直接产出一个可用的主题目录
    python build_skin_hero.py --image poster.jpg \
        --surface "#F3FBF5" \
        --theme-id my-theme --theme-name "我的主题" --accent "#049647" \
        --themes-dir ./studio/themes

    # 批量：用一个 JSON 配置一次生成多个主题
    python build_skin_hero.py --config skins.json

    skins.json 示例：
    [
      {"image": "poster-a.jpg", "theme_id": "theme-a", "theme_name": "主题 A",
       "surface": "#F3FBF5", "accent": "#049647"},
      {"image": "poster-b.jpg", "theme_id": "theme-b", "theme_name": "主题 B",
       "surface": "#0B1A12", "accent": "#3AC06E", "text": "#E9F6EE"}
    ]

输出
────
  --out           单张模式下的输出图片路径
  --themes-dir    给了就额外写 <themes-dir>/<theme-id>/{hero.jpg,theme.json}
                  theme.json 符合 studio 的 theme schema（schemaVersion=1，
                  colors 四项均为 6 位 HEX，id 仅小写字母数字与连字符）

依赖
────
  Pillow：pip install Pillow
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow。请先安装：pip install Pillow")

# ── 默认参数 ──────────────────────────────────────────────────
CANVAS_W = 2560          # 画布宽。16:9，主流窗口 cover 后基本 1:1 或轻微缩小
CANVAS_H = 1440
FADE_PX = 160            # 原图左边缘的 alpha 淡出宽度
JPEG_QUALITY = 88
EDGE_SAMPLE_RATIO = 0.06 # 取左侧 6% 宽度采样填充色
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")   # 与 studio 的 THEME_ID 一致

DEFAULT_SURFACE = "#F7FBFF"
DEFAULT_TEXT = "#17344F"
DEFAULT_FALLBACK_ACCENT = "#24C9D7"


# ── 颜色工具 ──────────────────────────────────────────────────

def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) != 6:
        raise ValueError(f"颜色必须是 6 位 HEX，收到：#{value}")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(rgb[:3])


def sample_edge_color(image: Image.Image) -> tuple[int, int, int]:
    """取左边缘平均色，作为左侧填充底色（比硬编码更贴合原图）"""
    width, height = image.size
    strip = image.crop((0, 0, max(1, int(width * EDGE_SAMPLE_RATIO)), height))
    return strip.resize((1, 1), Image.LANCZOS).getpixel((0, 0))[:3]


def dominant_color(image: Image.Image) -> tuple[int, int, int]:
    """按像素占比求主色，用于给 accent 一个合理建议值"""
    width, height = image.size
    small = image.convert("RGB").resize(
        (200, max(1, int(200 * height / width))), Image.LANCZOS
    )
    quantized = small.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette = quantized.get_palette()
    _, index = sorted(quantized.getcolors(), reverse=True)[0]
    return tuple(palette[index * 3:index * 3 + 3])


def luminance(rgb) -> float:
    """感知亮度，用于判断该配深色还是浅色的面板底色"""
    r, g, b = [c / 255 for c in rgb[:3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ── 核心：竖图 → 横版背景 ─────────────────────────────────────

def build_hero(
    src_path: str,
    surface: str | None = None,
    canvas_w: int = CANVAS_W,
    canvas_h: int = CANVAS_H,
    fade: int = FADE_PX,
):
    """返回 (合成后的图, 原图缩放尺寸, 实际使用的填充色)"""
    source = Image.open(src_path).convert("RGB")
    src_w, src_h = source.size

    fill_rgb = hex_to_rgb(surface) if surface else sample_edge_color(source)

    # contain 到画布高度（保证原图完整，不裁切）
    scale = canvas_h / src_h
    new_w, new_h = int(round(src_w * scale)), canvas_h
    if new_w > canvas_w:            # 极宽的图则改为按宽度适配
        scale = canvas_w / src_w
        new_w, new_h = canvas_w, int(round(src_h * scale))

    resized = source.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (canvas_w, canvas_h), fill_rgb)

    # 左边缘 alpha 淡出，避免原图与填充色之间出现硬边
    mask = Image.new("L", (new_w, new_h), 255)
    drawer = ImageDraw.Draw(mask)
    for x in range(min(fade, new_w)):
        drawer.line([(x, 0), (x, new_h)], fill=int(255 * x / fade))

    canvas.paste(resized, (canvas_w - new_w, (canvas_h - new_h) // 2), mask)
    return canvas, (new_w, new_h), fill_rgb


def write_theme(theme_dir: str, theme_id: str, theme_name: str, accent: str,
                surface: str, text: str, secondary: str | None = None):
    """写一个符合 studio theme schema 的主题目录（hero.jpg 需已就位）"""
    manifest = {
        "schemaVersion": 1,
        "id": theme_id,
        "name": theme_name,
        "hero": "hero.jpg",
        "colors": {
            "accent": accent,
            "secondary": secondary or accent,
            "surface": surface,
            "text": text,
        },
        "copy": None,
    }
    os.makedirs(theme_dir, exist_ok=True)
    with open(os.path.join(theme_dir, "theme.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


# ── 任务组装 ──────────────────────────────────────────────────

def process_one(job: dict, themes_dir: str | None, args) -> dict:
    image_path = job["image"]
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"找不到图片：{image_path}")

    theme_id = job.get("theme_id")
    if theme_id and not ID_RE.match(theme_id):
        raise ValueError(f"theme_id 只能用小写字母、数字和连字符：{theme_id}")

    surface = job.get("surface") or args.surface
    canvas_w = int(job.get("width") or args.width)
    canvas_h = int(job.get("height") or args.height)
    quality = int(job.get("quality") or args.quality)

    hero, (new_w, new_h), fill_rgb = build_hero(image_path, surface, canvas_w, canvas_h, args.fade)

    # 输出路径：优先 job.out > --out（单任务）> 按 theme_id / 文件名推导
    out_path = job.get("out") or (args.out if len(args.config_jobs) == 1 else None)
    if not out_path:
        if theme_id and themes_dir:
            out_path = os.path.join(themes_dir, theme_id, "hero.jpg")
        else:
            base = theme_id or os.path.splitext(os.path.basename(image_path))[0]
            out_path = os.path.join(args.out_dir or ".", f"{base}.jpg")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    # 主题目录走 JPEG（体积小且 studio 接受 .jpg）
    hero.save(out_path, "JPEG", quality=quality, optimize=True, progressive=True)

    result = {
        "image": image_path,
        "hero": out_path,
        "size": f"{new_w}x{new_h}",
        "fill": rgb_to_hex(fill_rgb),
        "kb": os.path.getsize(out_path) // 1024,
    }

    # 需要产出主题目录时，补写 theme.json
    if theme_id and themes_dir:
        source_img = Image.open(image_path).convert("RGB")
        accent = job.get("accent") or args.accent or rgb_to_hex(dominant_color(source_img))
        if not HEX_RE.match(accent):
            accent = DEFAULT_FALLBACK_ACCENT
        # 没显式给 surface 时，用实际填充色作为面板底色，保证 UI 与背景协调
        resolved_surface = (surface or rgb_to_hex(fill_rgb)).upper()
        # 没给 text 时按底色亮度自动选深/浅文字
        text = job.get("text") or args.text
        if not text:
            text = DEFAULT_TEXT if luminance(hex_to_rgb(resolved_surface)) > 0.5 else "#E9F6EE"
        theme_dir = os.path.join(themes_dir, theme_id)
        write_theme(
            theme_dir=theme_dir,
            theme_id=theme_id,
            theme_name=job.get("theme_name") or args.theme_name or theme_id,
            accent=accent.upper(),
            surface=resolved_surface,
            text=text.upper(),
            secondary=job.get("secondary") or args.secondary,
        )
        result["theme"] = theme_dir

    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description="把竖版图片重构成适合 WorkBuddy 皮肤背景的横版图",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("用法\n────")[-1].strip(),
    )
    parser.add_argument("--image", help="单张模式：输入的竖版图片")
    parser.add_argument("--out", help="单张模式：输出图片路径")
    parser.add_argument("--config", help="批量模式：JSON 配置路径")
    parser.add_argument("--out-dir", help="批量模式：输出目录（未指定 theme_id 时）")
    parser.add_argument("--surface", help="左侧填充色（6 位 HEX）。默认取图片左边缘平均色")
    parser.add_argument("--accent", help="主题主色（写入 theme.json 用）")
    parser.add_argument("--secondary", help="主题辅色")
    parser.add_argument("--text", help="主题正文色。默认按底色亮度自动选深/浅")
    parser.add_argument("--theme-id", help="产出主题目录时的主题 id（小写字母数字连字符）")
    parser.add_argument("--theme-name", help="主题显示名，可中文")
    parser.add_argument("--themes-dir", help="studio 主题目录，给了就同时写 hero.jpg + theme.json")
    parser.add_argument("--width", type=int, default=CANVAS_W, help=f"画布宽，默认 {CANVAS_W}")
    parser.add_argument("--height", type=int, default=CANVAS_H, help=f"画布高，默认 {CANVAS_H}")
    parser.add_argument("--fade", type=int, default=FADE_PX, help=f"接缝淡出宽度，默认 {FADE_PX}")
    parser.add_argument("--quality", type=int, default=JPEG_QUALITY, help=f"JPEG 质量，默认 {JPEG_QUALITY}")
    args = parser.parse_args()

    if args.config:
        with open(args.config, encoding="utf-8") as fh:
            args.config_jobs = json.load(fh)
        if not isinstance(args.config_jobs, list):
            sys.exit("--config 文件必须是一个数组")
    elif args.image:
        args.config_jobs = [{"image": args.image, "out": args.out,
                             "theme_id": args.theme_id, "theme_name": args.theme_name}]
    else:
        parser.error("需要 --image 或 --config")

    failures = 0
    for job in args.config_jobs:
        try:
            result = process_one(job, args.themes_dir, args)
            parts = [f"{result['size']:<10}", f"{result['kb']:>5}KB", f"fill={result['fill']}"]
            if "theme" in result:
                parts.append(f"theme={result['theme']}")
            print(f"[OK]  {os.path.basename(result['image'])[:34]:<36} {'  '.join(parts)}")
        except Exception as error:  # noqa: BLE001 - 批量模式下单条失败不应中断其余
            failures += 1
            print(f"[FAIL] {job.get('image')}: {error}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
