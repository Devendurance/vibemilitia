"""Generates the raster app icons from the hub logo mark.

The mark matches `.hub-brand__mark` in src/app/globals.css: a graphite square
with a lime outline and two lime eyes. `src/app/icon.svg` holds the same
geometry as vector. This script writes the raster copies from the same
64-unit design, so keep the two in step.

Outputs:
  src/app/favicon.ico      16, 32, 48 and 256 px
  src/app/apple-icon.png   180 px
  public/brand/icon-192.png
  public/brand/icon-512.png

Run from the repository root: python scripts/generate-favicons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SUPERSAMPLE = 8
DESIGN = 64  # coordinates below are in this 64-unit space

GRAPHITE = (22, 24, 28, 255)
PIT = (12, 13, 15, 255)
LIME = (215, 255, 46, 255)


def render(size: int) -> Image.Image:
    """Draws the mark at a large size, then downsamples for smooth edges."""
    canvas_size = size * SUPERSAMPLE
    scale = canvas_size / DESIGN
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(x0: float, y0: float, x1: float, y1: float) -> list[float]:
        return [x0 * scale, y0 * scale, x1 * scale, y1 * scale]

    # Rounded tile behind the mark. Its corners stay transparent on the tab.
    draw.rounded_rectangle(box(0, 0, 64, 64), radius=14 * scale, fill=PIT)
    # Lime outline, then the graphite fill inside it.
    draw.rounded_rectangle(box(10, 14, 54, 50), radius=6 * scale, fill=LIME)
    draw.rounded_rectangle(box(13, 17, 51, 47), radius=3.5 * scale, fill=GRAPHITE)
    # Two lime eyes, symmetric about x = 32.
    draw.rounded_rectangle(box(21, 27.5, 30, 36.5), radius=1 * scale, fill=LIME)
    draw.rounded_rectangle(box(34, 27.5, 43, 36.5), radius=1 * scale, fill=LIME)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    favicon_sizes = [16, 32, 48, 256]
    frames = [render(size) for size in favicon_sizes]
    favicon = ROOT / "src" / "app" / "favicon.ico"
    frames[-1].save(favicon, format="ICO", sizes=[(s, s) for s in favicon_sizes])
    print(f"{favicon.relative_to(ROOT)} {favicon.stat().st_size} bytes")

    apple = ROOT / "src" / "app" / "apple-icon.png"
    render(180).save(apple, format="PNG", optimize=True)
    print(f"{apple.relative_to(ROOT)}")

    for size in (192, 512):
        target = ROOT / "public" / "brand" / f"icon-{size}.png"
        render(size).save(target, format="PNG", optimize=True)
        print(f"{target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
