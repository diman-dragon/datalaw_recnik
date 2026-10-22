#!/usr/bin/env python3
"""Подставляет иконку и заставку в сгенерированный проект android/ (замена @capacitor/assets).

Берёт готовые картинки из ./assets (icon-only, icon-foreground, splash, splash-dark) и
перезаписывает одноимённые файлы шаблона Capacitor, сохраняя их размеры:
  res/mipmap-*/ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
  res/drawable*/splash.png  (каталоги *night* — тёмная заставка)
  res/values/ic_launcher_background.xml — цвет фона адаптивной иконки

Нужен только Pillow:  pip install pillow
Запуск:  python3 scripts/android_icons.py [путь/к/android/app/src/main/res]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
DEFAULT_RES = ROOT / "android" / "app" / "src" / "main" / "res"
BACKGROUND = "#0A0A0B"


def load(name: str) -> Image.Image:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"Нет {path}. Создайте исходники: python3 scripts/make-icons.py")
    return Image.open(path).convert("RGBA")


def fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Масштабирует по меньшей стороне, обрезая лишнее по центру."""
    w, h = img.size
    scale = max(size[0] / w, size[1] / h)
    resized = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def round_mask(img: Image.Image) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def main(res: Path) -> int:
    if not res.is_dir():
        raise SystemExit(f"Нет каталога {res} — сначала: npx cap add android")

    icon = load("icon-only.png")
    fg = load("icon-foreground.png")
    splash = load("splash.png")
    splash_dark = load("splash-dark.png")
    mono = load("icon-monochrome.png")

    counts = {"icon": 0, "round": 0, "foreground": 0, "mono": 0, "splash": 0}
    for path in sorted(res.rglob("*.png")):
        name = path.name
        try:
            size = Image.open(path).size
        except OSError:
            continue
        if name == "ic_launcher.png":
            fit(icon, size).save(path)
            counts["icon"] += 1
        elif name == "ic_launcher_round.png":
            round_mask(fit(icon, size)).save(path)
            counts["round"] += 1
        elif name == "ic_launcher_foreground.png":
            fit(fg, size).save(path)
            fit(mono, size).save(path.with_name("ic_launcher_monochrome.png"))  # тематические иконки Android 13+
            counts["foreground"] += 1
            counts["mono"] += 1
        elif name == "splash.png":
            night = "night" in path.parent.name
            fit(splash_dark if night else splash, size).save(path)
            counts["splash"] += 1

    # monochrome-слой в adaptive-иконках
    for xml in (res / "mipmap-anydpi-v26").glob("ic_launcher*.xml"):
        text = xml.read_text(encoding="utf-8")
        if "<monochrome" not in text and "</adaptive-icon>" in text:
            text = text.replace(
                "</adaptive-icon>", '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>'
            )
            xml.write_text(text, encoding="utf-8")

    bg = res / "values" / "ic_launcher_background.xml"
    bg.parent.mkdir(parents=True, exist_ok=True)
    bg.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{BACKGROUND}</color>\n</resources>\n',
        encoding="utf-8",
    )

    print("иконки/заставка обновлены:", counts)
    if counts["icon"] == 0:
        print("ВНИМАНИЕ: ic_launcher.png не найден — шаблон Android изменился?", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RES))
