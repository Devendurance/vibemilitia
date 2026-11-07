"""Converts raw README captures into optimized WebP files under docs/media/.

Input:  artifacts/readme-media/*.png (written by scripts/capture-readme-media.mjs)
Output: docs/media/*.webp, named for the README alt text

Run from the repository root:  python scripts/optimize-readme-media.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "artifacts" / "readme-media"
TARGET = ROOT / "docs" / "media"

# raw capture -> published name, maximum width in pixels
OUTPUTS = [
    ("01-hub.png", "hub-overview.webp", 1280),
    ("10-hub-character-roster.png", "character-roster.webp", 1280),
    ("03-online-ffa-combat.png", "online-ffa-combat.webp", 1280),
    ("04-akimbo-combat.png", "akimbo-rifles-combat.webp", 1280),
    ("05-stinking-cloud.png", "stinking-grenade-cloud.webp", 1280),
    ("06-elimination-loot.png", "elimination-loot.webp", 900),
    ("07-match-results.png", "match-results.webp", 1280),
    ("08-mobile-landscape.png", "mobile-landscape-controls.webp", 1280),
    ("09-practice-normal.png", "practice-normal.webp", 1280),
]


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for source_name, target_name, max_width in OUTPUTS:
        source = SOURCE / source_name
        if not source.exists():
            raise SystemExit(f"missing raw capture: {source}")
        image = Image.open(source).convert("RGB")
        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.LANCZOS)
        destination = TARGET / target_name
        image.save(destination, "WEBP", quality=82, method=6)
        print(f"{destination.relative_to(ROOT)} {image.width}x{image.height} {destination.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
