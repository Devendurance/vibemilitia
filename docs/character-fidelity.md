# Character Fidelity Review

## Selected character

`VIBER-010` is based on `vibe-vibers-viber-10.png` from the provided Vibe Vibers assets under `public/brand/vibe_vibers_characters/`.

The unmodified source is archived separately at `assets/source/vibe-vibers/viber-010-original.png`.

SHA-256 of the source:

```text
49dc4eacb29ffdecc5b88fbc2b307a3945850d36018086d1c0ed612173a70207
```

## Processing method

`scripts/prepare_character.py` performs a deterministic matte:

1. Samples the flat studio background from the image border.
2. Flood-fills only the edge-connected background region. Enclosed light details are not keyed out.
3. Reconstructs the 1-pixel rim where the source blends into the studio backdrop.
4. Removes surviving studio-color slivers inside concave corners.
5. Keeps every interior character pixel byte for byte.
6. Crops to a tight sprite boundary with a 10-pixel safety pad.
7. Clears the RGB channels of fully transparent texels so no pale fringe bleeds during GPU filtering.
8. Writes contrast previews and a report with checksums.

No Tripo AI, image generation, upscaling model, redraw or manual repaint was used.

Reproduce the output:

```bash
python scripts/prepare_character.py
```

## Output

- Sprite: `public/sprites/viber-010/viber-010-cutout.png`
- Size: 728 x 962
- Transparent corners: yes
- Transparent area: 26.4 percent of the cropped frame
- Near-background pixels still visible: 0
- Archived source checksum: matches the provided PNG
- Previews: `public/sprites/viber-010/previews/alpha-contrast.png` and `game-scale.png`
- Report: `public/sprites/viber-010/cutout-report.json`

The source render uses crisp geometric edges, so the resulting alpha is effectively binary. This preserves the original silhouette instead of inventing a softer edge.

## Visual checks

The contrast preview places the exact cutout on graphite, signal lime, magenta, sky mist, cream and a checkerboard. The character's cream eye panels remain opaque. The mint visor, dark outline, copper arm, green helmet and cyan boot trim remain unchanged. No square background or pale studio halo is visible.

In game, the sprite is rendered at a 128-pixel display height on the arena. The HUD portrait uses the same cutout. A square backdrop would be visible against the sky and ground; none appears in the browser screenshots.

## Perspective limitation

The source artwork is a 3/4 frontal voxel portrait. It does not have a side profile, separate limbs, a jaw rig or frames for walking, jumping or aiming.

P0 uses the authored pose as a static body. These elements are rendered as independent layers around it:

- Weapon
- Muzzle flash
- Jetpack exhaust
- Respawn shield
- Damage tint and hit particles
- Shadow

The body is not mirrored, redrawn or distorted. That means horizontal facing does not change the character's authored orientation. This is a deliberate fidelity tradeoff, documented rather than hidden.

A future animated sprite requires new authored or rigged source art. It must go through a separate visual-fidelity review before replacing this asset.

## Other characters

The same pipeline works for other flat-background Vibe Vibers portraits:

```bash
python scripts/prepare_character.py --source public/brand/vibe_vibers_characters/<file>.png --id viber-<id>
```

Each output should be reviewed against the contrast preview before being added to gameplay. The roster is intentionally out of scope for P0.
