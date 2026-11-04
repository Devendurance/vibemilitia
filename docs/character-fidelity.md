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

P0 and P1 use the authored pose as a static body. These elements are rendered as independent layers around it:

- Weapon
- Muzzle flash
- Jetpack exhaust
- Respawn shield
- Damage tint and hit particles
- Shadow

The body is not mirrored, redrawn or distorted. That means horizontal facing does not change the character's authored orientation. This is a deliberate fidelity tradeoff, documented rather than hidden. P1 added match scoring, bot navigation and two new weapons without touching the source artwork, the archived original, the cutout, the avatar derivative or the matte pipeline.

A future animated sprite requires new authored or rigged source art. It must go through a separate visual-fidelity review before replacing this asset.

## Validated online roster

P2.5 Slice C adds ten distinct official Vibe Viber skins. Every source is a single-character, full-body 1080 x 1080 render on a flat studio background. No promotional composites or duplicate views were used. All ten sources passed validation and none were rejected.

| Skin ID | Display name | Source |
| --- | --- | --- |
| `viber-010` | VIBER-010 | `vibe-vibers-viber-10.png` |
| `viber-006` | VIBER-006 | `vibe-vibers-viber-6.png` |
| `viber-031` | VIBER-031 | `vibe-vibers-viber-31.png` |
| `viber-123` | VIBER-123 | `vibe-vibers-viber-123.png` |
| `viber-141` | VIBER-141 | `vibe-vibers-viber-141.png` |
| `bureau-023` | BUREAU-023 | `vibe-vibers-bureau-23.png` |
| `bureau-roll-01-07` | BUREAU 01-07 | `vibe-vibers-bureau-roll-1-7.png` |
| `bureau-roll-09-03` | BUREAU 09-03 | `vibe-vibers-bureau-roll-9-3.png` |
| `bureau-roll-25-07` | BUREAU 25-07 | `vibe-vibers-bureau-roll-25-7.png` |
| `bureau-roll-28-02` | BUREAU 28-02 | `vibe-vibers-bureau-roll-28-2.png` |

Each source is archived unchanged under `assets/source/vibe-vibers/<skin-id>-original.png`. The deterministic matte produces a tightly cropped cutout, avatar, alpha-contrast preview and cutout report under `public/sprites/<skin-id>/`.

The runtime manifest is `src/game/characters/roster.json`. It stores stable skin IDs, source and cutout paths, texture keys, source and cutout SHA-256 values, cutout sizes and validation flags.

Regenerate and validate the entire roster:

```bash
npm run prepare:roster
```

All ten assets passed the alpha checks: transparent corners, zero near-background pixels inside the cutout, clean cream and checkerboard previews, and no square backdrop or pale halo.

`viber-010` remains the fallback for new or invalid profiles. P3A added the player-facing picker: all ten characters are available immediately, the selected `skinId` is stored locally, and the server validates it against this manifest before storing it in the authoritative human state.

Online bots draw unique skins from roster entries not already occupied by humans or other bots, retain their skin through death and respawn, and receive a valid skin when backfilled after a disconnect. Human joins replace bots without rerandomizing the remaining bot skins. Humans may choose the same character. Human selections take priority at bot assignment time.

Selected characters persist through death, respawn and match replay. Players cannot change skin during a live match.
