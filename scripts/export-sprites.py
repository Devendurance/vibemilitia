"""Exports the approved art into public/sprites at 2x world size.

    python scripts/export-sprites.py <folder with the approved source PNGs>

Each source is trimmed to its visible pixels, then downscaled with Lanczos.
Sources stay out of the repo. Run this again whenever the art changes, then
paste the printed anchors into src/game/systems/LoadoutArt.ts.
"""
import json
import sys
from pathlib import Path

from PIL import Image

SOURCE = Path(sys.argv[1])
OUT = Path("public/sprites")

GUNS = {
    "vibe-rifle": (152, 60),
    "scatter-blaster": (152, 60),
    "vibe-lance": (152, 60),
    "akimbo-single-a": (128, 60),
    "akimbo-single-b": (128, 60),
    "vibe-smg": (116, 68),
    "heavy-cannon": (176, 84),
    "rocket-launcher": (184, 80),
}
THROWN = {
    "grenade-contact": (52, 52),
    "grenade-frag": (52, 60),
    "grenade-stinking": (52, 60),
}
BULLETS = {
    "proj-bullet-player": (32, 14),
    "proj-bullet-scatter": (26, 16),
    "proj-bullet-precision": (68, 12),
    "proj-bullet-akimbo": (32, 12),
    "proj-bullet-smg": (28, 12),
    "proj-bullet-heavy": (56, 24),
    "proj-rocket-projectile": (68, 24),
}
PICKUPS = {
    "medkit": "pickup-medkit",
    "grenade-contact": "pickup-grenade-contact",
    "grenade-frag": "pickup-grenade-frag",
    "grenade-stinking": "pickup-grenade-stinking",
}
ICON_HEIGHT = 36
ICON_WIDTH = 66
GRENADE_ICON = 54


def load(name):
    image = Image.open(SOURCE / f"{name}.png").convert("RGBA")
    box = image.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
    return image.crop(box)


def fit(image, width, height):
    scale = min(width / image.width, height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.LANCZOS)


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    return path.stat().st_size


def main():
    total = 0
    sizes = {}
    for name, (width, height) in GUNS.items():
        art = fit(load(name), width, height)
        total += save(art, OUT / "loadout" / f"{name}.png")
        sizes[name] = art.size
    for name, (width, height) in THROWN.items():
        art = fit(load(name), width, height)
        total += save(art, OUT / "loadout" / f"{name}.png")
        sizes[name] = art.size
    for name, (width, height) in BULLETS.items():
        art = fit(load(name), width, height)
        total += save(art, OUT / "projectiles" / f"{name}.png")
        sizes[name] = art.size
    for name, key in PICKUPS.items():
        total += save(fit(load(name), 96, 96), OUT / "loadout" / f"{key}.png")

    for name in [
        "vibe-rifle",
        "scatter-blaster",
        "vibe-lance",
        "vibe-smg",
        "heavy-cannon",
        "rocket-launcher",
    ]:
        total += save(fit(load(name), ICON_WIDTH, ICON_HEIGHT), OUT / "icons" / f"{name}.png")
    # Akimbo reads as two guns at icon size, so both layers share one canvas.
    first = fit(load("akimbo-single-a"), ICON_WIDTH, 19)
    second = fit(load("akimbo-single-b"), ICON_WIDTH, 19)
    pair = Image.new("RGBA", (ICON_WIDTH, ICON_HEIGHT), (0, 0, 0, 0))
    pair.alpha_composite(second, (0, 0))
    pair.alpha_composite(first, (0, ICON_HEIGHT - first.height))
    total += save(pair, OUT / "icons" / "akimbo-rifles.png")
    for name in ["grenade-contact", "grenade-frag", "grenade-stinking", "medkit"]:
        total += save(fit(load(name), GRENADE_ICON, GRENADE_ICON), OUT / "icons" / f"{name}.png")

    print(json.dumps(sizes))
    print(f"total {total} bytes")


main()
