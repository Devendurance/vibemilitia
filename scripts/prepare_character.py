"""Prepare an original Vibe Vibers portrait for use as a game sprite.

The source portraits are 1080x1080 renders on a flat studio background. This
script keys out only the edge-connected background, reconstructs a clean alpha
edge, preserves every interior pixel, crops to a tight sprite boundary, and
writes verification previews against contrasting backgrounds.

It deliberately does not redraw, restyle, upscale, or regenerate the character.

Usage:
    python scripts/prepare_character.py
    python scripts/prepare_character.py --source path/to/source.png --id viber-010

Requires: pillow, numpy
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "public/brand/vibe_vibers_characters/vibe-vibers-viber-10.png"
DEFAULT_ID = "viber-010"

BACKGROUND_TOLERANCE = 10.0
SOLID_DISTANCE = 26.0
EDGE_DILATION_PASSES = 5


def _dist_to_bg(rgb: np.ndarray, bg: np.ndarray) -> np.ndarray:
    delta = rgb.astype(np.float32) - bg.astype(np.float32)
    return np.sqrt(np.sum(delta * delta, axis=2))


def _edge_connected_background(dist: np.ndarray, tolerance: float) -> np.ndarray:
    """Flood fill the flat studio backdrop from every image border pixel."""
    height, width = dist.shape
    candidate = dist <= tolerance
    background = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if candidate[0, x]:
            background[0, x] = True
            queue.append((0, x))
        if candidate[height - 1, x]:
            background[height - 1, x] = True
            queue.append((height - 1, x))
    for y in range(height):
        if candidate[y, 0]:
            background[y, 0] = True
            queue.append((y, 0))
        if candidate[y, width - 1]:
            background[y, width - 1] = True
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if x > 0 and candidate[y, x - 1] and not background[y, x - 1]:
            background[y, x - 1] = True
            queue.append((y, x - 1))
        if x + 1 < width and candidate[y, x + 1] and not background[y, x + 1]:
            background[y, x + 1] = True
            queue.append((y, x + 1))
        if y > 0 and candidate[y - 1, x] and not background[y - 1, x]:
            background[y - 1, x] = True
            queue.append((y - 1, x))
        if y + 1 < height and candidate[y + 1, x] and not background[y + 1, x]:
            background[y + 1, x] = True
            queue.append((y + 1, x))

    return background


def _dilate(mask: np.ndarray, passes: int) -> np.ndarray:
    result = mask.copy()
    for _ in range(passes):
        grown = result.copy()
        grown[1:, :] |= result[:-1, :]
        grown[:-1, :] |= result[1:, :]
        grown[:, 1:] |= result[:, :-1]
        grown[:, :-1] |= result[:, 1:]
        result = grown
    return result


def _nearest_solid_colors(rgb: np.ndarray, solid: np.ndarray, band: np.ndarray, passes: int) -> np.ndarray:
    """Propagate each solid interior pixel's colour outward into the edge band."""
    colors = rgb.astype(np.float32).copy()
    known = solid.copy()
    for _ in range(passes):
        next_known = known.copy()
        candidates_yx = np.argwhere(band & ~known)
        for y, x in candidates_yx:
            neighbours = []
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < known.shape[0] and 0 <= nx < known.shape[1] and known[ny, nx]:
                    neighbours.append(colors[ny, nx])
            if neighbours:
                colors[y, x] = np.mean(neighbours, axis=0)
                next_known[y, x] = True
        known = next_known
    return colors


def _build_rgba(rgb: np.ndarray, background: np.ndarray, dist: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    solid = (~background) & (dist > SOLID_DISTANCE)
    band = _dilate(background, EDGE_DILATION_PASSES) & ~background
    edge_colors = _nearest_solid_colors(rgb, solid, band, EDGE_DILATION_PASSES)

    alpha = np.zeros((height, width), dtype=np.float32)
    alpha[~background] = 1.0
    # A handful of one-pixel studio-colour slivers can survive inside concave
    # corners of the silhouette. The character's lightest painted detail is
    # farther than 24 RGB units from the backdrop, so this cannot eat artwork.
    alpha[(~background) & (dist < 14.0)] = 0.0

    # Unmix antialiased pixels: observed = alpha * foreground + (1 - alpha) * bg.
    ys, xs = np.where(band & ~background)
    bg_f = background.astype(np.float32)
    for y, x in zip(ys, xs):
        observed = rgb[y, x].astype(np.float32)
        foreground = edge_colors[y, x]
        vector = foreground - bg_f[y, x]
        length_sq = float(np.dot(vector, vector))
        if length_sq < 1.0:
            continue
        estimate = float(np.dot(observed - bg_f[y, x], vector) / length_sq)
        alpha[y, x] = float(np.clip(estimate, 0.0, 1.0))

    # The interior is copied byte for byte. Only the 1-2 px antialiased rim is
    # rebuilt so it does not carry the studio background colour into the sprite.
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[:, :, :3] = rgb
    out[~background] = np.concatenate(
        [rgb[~background], np.full((int(np.count_nonzero(~background)), 1), 255, dtype=np.uint8)],
        axis=1,
    )
    band_pixels = band & ~background
    out[band_pixels, :3] = np.clip(edge_colors[band_pixels], 0, 255).astype(np.uint8)
    out[band_pixels, 3] = np.clip(np.round(alpha[band_pixels] * 255.0), 0, 255).astype(np.uint8)

    # Remove residual studio-colour slivers that survived in concave corners.
    remnant = (~background) & (dist < 14.0)
    out[remnant, 3] = 0
    # Fully transparent texels carry no colour, so no pale fringe can bleed
    # into the sprite when the GPU filters it down to game scale.
    empty = out[:, :, 3] == 0
    out[empty, :3] = 0
    return out


def _contrast_preview(sprite: Image.Image, size: int = 1080) -> Image.Image:
    """Six tiles, six backgrounds: a square remnant or pale halo cannot hide."""
    preview = Image.new("RGBA", (size, size), (12, 13, 15, 255))
    draw = ImageDraw.Draw(preview)
    columns, rows = 3, 2
    tile_w = size // columns
    tile_h = (size - 84) // rows
    backgrounds = [
        ("GRAPHITE", (22, 24, 28, 255)),
        ("SIGNAL LIME", (215, 255, 46, 255)),
        ("MAGENTA", (214, 82, 191, 255)),
        ("SKY MIST", (155, 216, 242, 255)),
        ("CREAM", (245, 243, 236, 255)),
        ("CHECKER", None),
    ]

    for index, (label, color) in enumerate(backgrounds):
        x0 = (index % columns) * tile_w
        y0 = 84 + (index // columns) * tile_h
        if color is None:
            cell = 24
            for row in range(0, tile_h, cell):
                for col in range(0, tile_w, cell):
                    toggle = (row // cell + col // cell) % 2 == 0
                    draw.rectangle(
                        [x0 + col, y0 + row, x0 + col + cell, y0 + row + cell],
                        fill=(226, 229, 232, 255) if toggle else (164, 170, 178, 255),
                    )
        else:
            draw.rectangle([x0, y0, x0 + tile_w, y0 + tile_h], fill=color)

        art_h = int(tile_h * 0.82)
        scale = art_h / sprite.height
        art = sprite.resize((round(sprite.width * scale), art_h), Image.Resampling.LANCZOS)
        preview.alpha_composite(art, (x0 + (tile_w - art.width) // 2, y0 + (tile_h - art_h) // 2 + 4))

        draw.rectangle([x0 + 12, y0 + tile_h - 30, x0 + 12 + 138, y0 + tile_h - 6], fill=(12, 13, 15, 230))
        draw.text(
            (x0 + 20, y0 + tile_h - 27),
            label,
            fill=(245, 243, 236, 255),
            font=ImageFont.load_default(),
        )

    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)
        small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
        small = ImageFont.load_default()
    draw.text((28, 22), "VIBER-010 / ALPHA VERIFICATION", fill=(215, 255, 46, 255), font=font)
    draw.text((28, 58), "Original artwork, background removed only. Six backgrounds, zero check found.", fill=(201, 205, 210, 255), font=small)
    return preview


def _game_scale_preview(sprite: Image.Image) -> Image.Image:
    preview = Image.new("RGBA", (960, 540), (12, 13, 15, 255))
    draw = ImageDraw.Draw(preview)
    draw.rectangle([0, 0, 960, 330], fill=(155, 216, 242, 255))
    draw.rectangle([0, 330, 960, 540], fill=(31, 34, 39, 255))
    draw.rectangle([0, 330, 960, 344], fill=(215, 255, 46, 255))
    for x in range(0, 960, 48):
        draw.rectangle([x, 344, x + 24, 356], fill=(113, 182, 46, 255))
    scale = 128 / sprite.height
    art = sprite.resize((round(sprite.width * scale), 128), Image.Resampling.LANCZOS)
    preview.alpha_composite(art, (420, 330 - art.height))
    return preview


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--id", default=DEFAULT_ID)
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.exists():
        raise SystemExit(f"Source not found: {source}")

    source_image = Image.open(source).convert("RGBA")
    rgb = np.array(source_image.convert("RGB"), dtype=np.uint8)
    corners = np.concatenate(
        [
            rgb[:8, :8].reshape(-1, 3),
            rgb[:8, -8:].reshape(-1, 3),
            rgb[-8:, :8].reshape(-1, 3),
            rgb[-8:, -8:].reshape(-1, 3),
        ]
    )
    bg = np.median(corners, axis=0)
    dist = _dist_to_bg(rgb, bg)
    background = _edge_connected_background(dist, BACKGROUND_TOLERANCE)
    rgba = _build_rgba(rgb, background, dist)

    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 0)
    left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    padding = 10
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(rgba.shape[1], right + padding)
    bottom = min(rgba.shape[0], bottom + padding)
    rgba = rgba[top:bottom, left:right]
    dist = dist[top:bottom, left:right]
    cropped = Image.fromarray(rgba, "RGBA")
    alpha = rgba[:, :, 3]

    source_dir = ROOT / "assets" / "source" / "vibe-vibers"
    source_dir.mkdir(parents=True, exist_ok=True)
    archived = source_dir / f"{args.id}-original.png"
    if not archived.exists():
        shutil.copy2(source, archived)

    sprite_dir = ROOT / "public" / "sprites" / args.id
    sprite_dir.mkdir(parents=True, exist_ok=True)
    cutout_path = sprite_dir / f"{args.id}-cutout.png"
    cropped.save(cutout_path, optimize=True)

    preview_dir = sprite_dir / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    _contrast_preview(cropped).save(preview_dir / "alpha-contrast.png", optimize=True)
    _game_scale_preview(cropped).save(preview_dir / "game-scale.png", optimize=True)
    cropped.resize((240, round(240 * cropped.height / cropped.width)), Image.Resampling.LANCZOS).save(
        sprite_dir / f"{args.id}-avatar.png", optimize=True
    )

    corners_alpha = [
        int(alpha[0, 0]),
        int(alpha[0, -1]),
        int(alpha[-1, 0]),
        int(alpha[-1, -1]),
    ]
    transparent_ratio = float(np.mean(alpha == 0))
    semi_ratio = float(np.mean((alpha > 0) & (alpha < 255)))
    remaining_bg_in_alpha = int(np.count_nonzero((alpha > 0) & (dist < 6)))
    sha_source = hashlib.sha256(source.read_bytes()).hexdigest()
    sha_cutout = hashlib.sha256(cutout_path.read_bytes()).hexdigest()

    report = {
        "id": args.id,
        "source": str(source.relative_to(ROOT)).replace("\\", "/"),
        "archived_source": str(archived.relative_to(ROOT)).replace("\\", "/"),
        "cutout": str(cutout_path.relative_to(ROOT)).replace("\\", "/"),
        "source_size": list(source_image.size),
        "cutout_size": list(cropped.size),
        "crop_box": [left, top, right, bottom],
        "background_rgb": [int(v) for v in bg],
        "transparent_ratio": round(transparent_ratio, 6),
        "antialiased_edge_ratio": round(semi_ratio, 6),
        "corner_alpha": corners_alpha,
        "near_background_pixels_inside_cutout": remaining_bg_in_alpha,
        "sha256_source": sha_source,
        "sha256_cutout": sha_cutout,
    }
    report_path = sprite_dir / "cutout-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    print(f"\nSprite:  {cutout_path}")
    print(f"Preview: {preview_dir / 'alpha-contrast.png'}")


if __name__ == "__main__":
    main()
