# Design System Inspired by Vibe Vibers Battlegrounds

## 1. Visual Theme & Atmosphere

A bright, toy-like voxel diorama framed by a dense, high-contrast HUD. The 3D world is sunny, saturated, and playful: sky blue, warm copper, cream, and chunky blocky greenery. Every interface element sits on top of it as a near-black graphite panel with one loud signal color, a neon lime-yellow that marks everything you can act on. The overall feel is competitive, arcade-energetic, and slightly streetwear: confident, chunky, and a little cheeky. Type is heavy and uppercase for anything that acts like a title or a button, and quiet and sentence-cased for anything that explains.

### Key Characteristics

- **One loud signal color.** Signal Lime (`#D7FF2E`) is reserved for primary actions, the active nav tab, the active selection in a segmented control, and the single hero CTA. If it's lime, it's clickable or selected.
- **Floating HUD over a live 3D world.** Panels are never full-bleed. They float with a 24px inset from the viewport edge, sit on graphite at near-opaque alpha, and let the world show through the gutters.
- **Heavy uppercase display type with wide letterforms.** Titles like BATTLE ROYALE and LOADOUT use an expanded, heavy grotesk in uppercase. Body copy stays in a neutral sans in sentence case.
- **Keycap-driven affordances.** Every hotkey is shown as a small square keycap (`2`, `Q`, `F`, `E`, `Enter`). Keybinds are part of the visual language, not a hidden tooltip.
- **Status is communicated with small mono-caps pills.** States like SOON, AT RISK, IN 19 H, and Paper III are small, outlined or tinted pills with a mono label. They read like telemetry.
- **Warm copper as the world's counter-accent.** Copper (`#C7692F`) appears in voxel props and in reward/loot framing, so the UI borrows it for "earned" moments without competing with lime.
- **Tight corners, restrained radii.** Most containers use 6-8px radii. Only pills and keycaps go fully round or nearly square, which keeps the chunky feel without looking bubbly.
- **Thin 1px borders do the work that shadows would do in a lighter design.** Panels are separated by hairline `#2E333A` borders, with depth coming from the black-on-world contrast.

---

## 2. Color Palette & Roles

Hex values below are sampled by eye from the screenshot. Treat them as the working palette and tune only if you have the original file or design source.

### Primary

| Name | Hex | Role |
|---|---|---|
| Signal Lime | `#D7FF2E` | Primary CTA (PLAY), active nav tab, active segmented control, selected states. The brand color. |
| Graphite | `#16181C` | Default panel and card surface. Sits on the 3D world at 94-96% opacity. |
| Pit Black | `#0C0D0F` | Deepest surface: text on lime, input wells, keycap body, tooltip backgrounds. |

### Accent Colors

| Name | Hex | Role |
|---|---|---|
| Solar Yellow | `#F4E21C` | Logo mark and hazard-style emphasis only. Never used for interactive elements, so it doesn't compete with lime. |
| Ember Copper | `#C7692F` | Reward and loot framing, voxel-world warm accents, Rare-tier borders on in-game popups. |
| Alert Red | `#E5484D` | AT RISK label and destructive or danger popups. Tinted background `#2A1214`. |
| Sky Mist | `#9BD8F2` | Optional secondary info accent (informational popups, map sky tints). Use sparingly. |

### Interactive

| Name | Hex | Role |
|---|---|---|
| Lime Hover | `#E6FF6B` | Primary button hover. Lightens lime by roughly 6% lightness. |
| Lime Pressed | `#B8DB1E` | Primary button active/pressed. Darkens lime by roughly 12%. |
| Focus Ring | `#D7FF2E` | 2px outline with 2px offset on any focused control. |
| Link | `#D7FF2E` | Inline links, underlined on hover. Never use lime for non-interactive text. |
| Disabled Fill | `#2A2E34` | Disabled button or segment background. |
| Disabled Text | `#5C6168` | Disabled label color. |

### Neutral Scale

| Token | Hex | Role |
|---|---|---|
| N0 · Ink | `#F5F3EC` | Primary text on dark surfaces. Warm white, not pure white. |
| N1 · Bright | `#C9CDD2` | Secondary text, nav labels at rest, body copy in popups. |
| N2 · Muted | `#9AA0A7` | Captions, helper text, inactive segments, placeholders beyond focus. |
| N3 · Dim | `#5C6168` | Tertiary metadata, disabled text, placeholder text. |
| N4 · Iron | `#2A2E34` | Keycap body, inactive pill background. |
| N5 · Coal | `#1F2227` | Raised surface (cards nested inside panels, inactive tabs). |
| N6 · Night | `#0C0D0F` | Deepest background, behind popups. |

### Surface & Borders

| Token | Value | Role |
|---|---|---|
| Surface 0 (World) | Live 3D scene, no overlay | Base layer. Never tint the world. |
| Surface 1 (Panel) | `#16181C` at 94% opacity | Main HUD panels (identity card, mode panel, loadout tray). |
| Surface 2 (Raised) | `#1F2227` | Nested cards, inactive segmented options, tab backgrounds. |
| Border Default | `#2E333A` 1px | Panel and card edges. |
| Border Strong | `#3D434B` 1px | Ghost button outlines, popup edges, dashed empty slots use 1px dashed `#3D434B`. |
| Overlay Scrim | `rgba(8,9,11,0.72)` | Modal backdrop, only used for full-screen menus, never for in-game popups. |

---

## 3. Typography Rules

### Font Family

- **Display (titles, CTAs, mode names, panel headings):** `Archivo` at weight 800, with `font-stretch: 125%` (expanded). Fallback stack: `"Archivo", "Archivo Expanded", "Helvetica Neue", Arial, sans-serif`. Always uppercase for titles and CTAs.
- **Secondary (UI, body, descriptions, inputs):** `Inter` at weights 400, 500, 600, 700. Fallback stack: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Sentence case for body copy.
- **Telemetry (pills, timers, keybinds, footer status, counters):** `JetBrains Mono` at weights 500 and 700. Fallback stack: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`. Uppercase with +0.08em tracking.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Display 1 | Archivo (expanded) | 72px desktop / 48px mobile | 800 | 0.95 | -0.01em | Hero or splash headline. Uppercase. Use at most once per screen. |
| Display 2 | Archivo (expanded) | 36px / 28px mobile | 800 | 1.0 | 0.01em | Mode titles such as BATTLE ROYALE. Uppercase. |
| Heading 3 | Archivo (expanded) | 16px | 700 | 1.2 | 0.14em | Panel headers such as LOADOUT, SEASON 1, STASH. Uppercase. |
| Body Large | Inter | 18px | 500 | 1.45 | 0 | Hero subtitle, mode descriptor lead. |
| Body Regular | Inter | 14px | 400 | 1.5 | 0 | Panel body copy, popup body, descriptions. |
| Link | Inter | 14px | 600 | 1.4 | 0 | Lime, underline on hover. |
| Input | Inter | 15px | 500 | 1.2 | 0 | Input value text. Placeholder uses N3. |
| Caption | JetBrains Mono | 11px | 500 | 1.3 | 0.08em | Uppercase. Pill labels, footer telemetry, timer chips. |
| Keybind | JetBrains Mono | 12px | 700 | 1 | 0 | Inside keycap chips only. |
| CTA Label | Archivo (expanded) | 28px desktop / 22px compact | 800 | 1 | 0.02em | Large PLAY button label. Uppercase. |

### Principles

- **Uppercase is for things you press or things that name a place.** Mode names, panel headers, and CTAs go uppercase. Sentences never do.
- **Expanded width is the signature.** Keep Archivo at 125% stretch for every display role. Don't fall back to a normal-width heavy sans for titles.
- **Mono is for data, not decoration.** Use JetBrains Mono for timers, pill labels, keybinds, and footer telemetry. Never use it for body copy or headings.
- **Weight contrast does the hierarchy.** Titles are 800, labels 700, body 400 to 500. Avoid medium-weight titles.
- **Tracking grows as size shrinks.** Panel headers get +0.14em, pill labels +0.08em, display text stays near 0 or slightly negative.
- **Keep sentences short.** Descriptions run one to two lines. If it needs a third line, it belongs in a tooltip or a secondary screen.

---

## 4. Component Stylings

### Buttons

**Primary Button (PLAY, hero CTA)**
- Background: `#D7FF2E`
- Text Color: `#0C0D0F`
- Padding: 0 28px
- Border Radius: 4px
- Border: none
- Font Size: 28px (hero), 14px (standard primary)
- Font Weight: 800 (hero, Archivo expanded), 700 (standard, Inter)
- Font Family: Archivo expanded (hero), Inter (standard)
- Height: 88px (hero), 44px (standard)
- Line Height: 1
- Hover State: background `#E6FF6B`, arrow glyph shifts 2px right, 120ms ease-out
- Active State: background `#B8DB1E`, translateY(1px), no shadow
- Keybind chip: 22px keycap inside the button's right gutter, bordered with `#0C0D0F` at 20% opacity

**Secondary / Ghost Button (Standings, Sign out)**
- Background: transparent
- Text Color: `#F5F3EC`
- Padding: 0 20px
- Border Radius: 6px
- Border: 1px solid `#3D434B`
- Font Size: 14px
- Font Weight: 600
- Font Family: Inter
- Height: 44px
- Line Height: 1
- Hover State: background `#1F2227`, border `#D7FF2E`
- Active State: background `#2A2E34`, border `#D7FF2E`

**Tertiary Button (inline text action, edit icon)**
- Background: transparent
- Text Color: `#9AA0A7`
- Padding: 4px 8px
- Border Radius: 4px
- Border: none
- Font Size: 13px
- Font Weight: 600
- Font Family: Inter
- Height: 32px
- Line Height: 1
- Hover State: text `#F5F3EC`, background `#1F2227`
- Active State: text `#D7FF2E`

### Cards & Containers

**Standard Card (identity card, season card, pass card)**
- Background: `#16181C` at 94% opacity
- Text Color: `#F5F3EC`
- Padding: 16px 18px
- Border Radius: 8px
- Border: 1px solid `#2E333A`
- Box Shadow: Base (see section 6)
- Width: 100% of its column, or 380px fixed for the identity card
- Hover State: border `#3D434B` (only for cards that are clickable)
- Active State: border `#D7FF2E`

**Feature Card (Wide, mode selection panel)**
- Background: `#16181C` at 94% opacity
- Text Color: `#F5F3EC`
- Padding: 20px
- Border Radius: 8px
- Border: 1px solid `#2E333A`
- Box Shadow: Medium
- Width: 420px fixed on desktop, full width on mobile
- Thumbnail tile: 96px square, 6px radius, saturated scene art, sits left of the title block

**Highlighted Container (in-game interactive text popup)**
- Background: `rgba(22,24,28,0.94)` with `backdrop-filter: blur(8px)`
- Text Color: `#F5F3EC` for title, `#C9CDD2` for body
- Padding: 14px 16px 16px
- Border Radius: 6px
- Border: 1px solid `#3D434B`, plus a 2px top edge in the popup's type color (see variants below)
- Box Shadow: High
- Width: 340px fixed, `max-width: 90vw`
- Anchor: attaches to a world object or HUD element with a 6px tail, centered on the anchor's top edge

Popup variants (keep the same geometry, change only the top edge and tint):

| Variant | Top edge | Background tint | Title color | Use |
|---|---|---|---|---|
| Info | `#D7FF2E` | none | `#F5F3EC` | Hints, mode status, quest prompts |
| Reward | `#C7692F` | `#2A1D14` at 40% | `#F5F3EC` | Loot pickups, unlocks, LP gains |
| Warning | `#E5484D` | `#2A1214` at 60% | `#FFB4B6` | AT RISK, zone closing, low resources |
| Neutral | `#3D434B` | none | `#C9CDD2` | Passive notices, tutorial aside |

Popup internals:
- Title: Heading 3 style (Archivo expanded, 16px, uppercase, 0.14em tracking) at 700 weight
- Body: Body Regular, max 2 lines
- Footer (optional): a single keybind chip plus one-word action label, separated by 12px gap, aligned right
- Entrance: opacity 0 to 1 and translateY 8px to 0 over 160ms `cubic-bezier(0.2, 0.8, 0.2, 1)`
- Exit: opacity 1 to 0 over 120ms, no translate
- Dismiss: `Esc` or the keybind in the footer
- Stacking: max 3 visible at once, newest on top, older collapse into a single "+N" pill

### Inputs & Forms

**Text Input**
- Background: `#0C0D0F`
- Text Color: `#F5F3EC`
- Padding: 0 14px
- Border Radius: 6px
- Border: 1px solid `#2E333A`
- Font Size: 15px
- Font Weight: 500
- Font Family: Inter
- Height: 44px
- Placeholder Color: `#5C6168`
- Focus State: border `#D7FF2E`, outer ring 2px `rgba(215,255,46,0.25)`
- Disabled State: background `#16181C`, text `#5C6168`, border `#2A2E34`, cursor not-allowed

**Input Label**
- Font: Inter 12px, weight 600, uppercase, 0.08em tracking, color `#9AA0A7`
- Spacing: 6px below label before the input

**Input Helper Text**
- Font: Inter 12px, weight 400, color `#9AA0A7`
- Error variant: color `#E5484D`, prefix with a 4px square bullet in the same color

**Segmented Control (Easy / Normal / Hard / Merciless, Solo / Duo)**
- Track background: `#16181C`, border 1px `#2E333A`, padding 4px, radius 6px
- Segment: height 36px, padding 0 16px, Inter 14px 600, color `#9AA0A7`
- Active segment: background `#D7FF2E`, text `#0C0D0F`
- Hover on inactive: text `#F5F3EC`, background `#1F2227`

### Navigation

**Primary Navigation (top tab bar)**
- Background: `rgba(22,24,28,0.94)`
- Text Color: `#C9CDD2`
- Padding: 4px
- Border Radius: 8px
- Border: 1px solid `#2E333A`
- Layout: horizontal segments with 1px dividers in `#2E333A`, centered at top
- Box Shadow: Base

**Navigation Link (tab item)**
- Padding: 14px 20px
- Font: Archivo expanded 14px, weight 700, uppercase, 0.08em tracking
- Keybind chip: 22px keycap at the right of the label, mono 12px
- Default: text `#C9CDD2`, background transparent
- Hover: text `#F5F3EC`, background `#1F2227`
- Active: background `#D7FF2E`, text `#0C0D0F`, keycap inverts to `#0C0D0F` body with lime label
- Locked state: text `#5C6168`, lock glyph 14px inline

---

## 5. Layout Principles

### Spacing System

Base unit: **4px.**

| Token | Value | Usage Context |
|---|---|---|
| space-1 | 4px | Icon-to-label micro gaps, keycap padding |
| space-2 | 8px | Between chips in a row, button internal gap |
| space-3 | 12px | Between related text blocks, pill spacing |
| space-4 | 16px | Standard card padding (compact), gutters between panels |
| space-5 | 20px | Feature card padding, nav link horizontal padding |
| space-6 | 24px | Viewport inset for HUD panels, section gap in popups |
| space-7 | 32px | Gap between HUD columns on desktop |
| space-8 | 40px | Hero block to first panel |
| space-9 | 48px | Large block separation in full-screen menus |
| space-10 | 64px | Hero title offset from top nav |
| space-11 | 80px | Reserved for full-bleed screens (rankings, locker) |

### Grid & Container

- **Max width:** none for the world. HUD panels are anchored to the viewport edges with a 24px inset.
- **Column strategy:** HUD uses three anchor zones, not a grid. Top-center for navigation, top-left for identity, right column for the mode panel (420px), bottom-center for loadout (auto width), bottom-left for footer telemetry.
- **Menu screens (Locker, Rankings, Stash, Friends):** 12 columns, 24px gutter, max content width 1280px, centered over a dimmed world scene.
- **Section patterns:**
  - **World-first HUD (homepage hero):** full-bleed 3D world, floating panels only. No hero text block.
  - **Floating panel:** rounded graphite card with heading, body, and one action row.
  - **Segmented selector row:** label on the left, segmented track on the right.
  - **Bottom tray:** horizontal row of slotted cards with a header tab overlapping the top edge.
  - **Status strip:** small mono telemetry bar anchored to the bottom-left, 11px caption style.

### Whitespace Philosophy

Spacing is generous between HUD zones and tight within them. The world needs breathing room so the panels read as objects rather than walls of UI, but within a panel everything stays dense: 12px between related lines, 16px between blocks, and tight pills. That mirrors the mood of an arcade lobby: open space for the game to breathe, compressed controls that feel fast to read. Dense inside, airy outside.

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| radius-0 | 0px | Pixel-edged world props and decorative bars only. Never on UI. |
| radius-1 | 4px | Keycaps, primary buttons, tags. |
| radius-2 | 6px | Secondary buttons, inputs, segmented controls, popups. |
| radius-3 | 8px | Panels, cards, top navigation bar, feature cards. |
| radius-pill | 999px | Status pills (SOON, AT RISK, IN 19 H), avatar frames. |

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, background only | Nav links at rest, segmented track, inline text blocks. |
| Subtle | `box-shadow: 0 0 0 1px #2E333A` (border-only) | Standard cards and the identity card at rest. |
| Base | `box-shadow: 0 8px 24px rgba(0,0,0,0.35)` | Main HUD panels, top navigation bar, bottom loadout tray. |
| Medium | `box-shadow: 0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)` | Feature card (mode panel), hover-lifted cards. |
| High | `box-shadow: 0 24px 60px rgba(0,0,0,0.6)` | In-game popups, modals, full-screen overlays. |
| Glow | `box-shadow: 0 0 0 1px rgba(215,255,46,0.4), 0 0 24px rgba(215,255,46,0.25)` | Hero PLAY button and any element in its "ready" or "selected" state. Use only once per screen. |

---

## 7. Do's and Don'ts

### Do

- Use `#D7FF2E` for exactly one primary action per screen, plus selected or active states.
- Keep every HUD panel floating with a 24px inset from the viewport edge and 1px `#2E333A` border.
- Show every hotkey as a keycap chip with the mono font at 12px.
- Set every display title in Archivo at 800 weight, 125% stretch, and uppercase.
- Use the four popup variants (Info, Reward, Warning, Neutral) and never invent a fifth color for popups.
- Keep in-game popups to 340px wide, max two body lines, and max three visible at a time.
- Tag status with a mono-caps pill (SOON, AT RISK, IN 19 H), never with a colored filled button.
- Let the 3D world remain unobscured in the gutters. Never apply a full-screen tint over the world during gameplay.

### Don't

- Don't use lime for body text, borders on non-interactive elements, or decorative accents.
- Don't use pure white `#FFFFFF`. Text is `#F5F3EC`.
- Don't set titles in regular or medium weight. Titles start at 700 and go up to 800.
- Don't use rounded radii above 8px on panels or 6px on buttons. Only pills go fully rounded.
- Don't place more than one lime CTA on the same visible surface.
- Don't stack more than three in-game popups, and don't anchor popups to the screen center during gameplay.
- Don't use drop shadows heavier than High on in-game popups. Heavier shadows fight the flat-graphic world.
- Don't put keybind labels in a regular sans. They belong in JetBrains Mono inside a keycap.

---

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | 0 to 767px | Panels stack into a full-width bottom sheet. Top nav collapses to a 5-item icon bar with labels hidden. PLAY button spans full width, 56px height. Identity card moves to the top-left as a compact 64px row. Mode panel becomes the bottom sheet. Loadout tray becomes a horizontal scroll row. |
| Tablet | 768 to 1199px | Identity card shrinks to 300px. Mode panel fixed at 360px on the right. Top nav keeps full labels at 13px. Loadout tray shows 4 slots max, with the 5th as an overflow chip. |
| Desktop | 1200 to 1599px | Layout as shown in the source screenshot: identity top-left, nav top-center, mode panel right at 420px, loadout bottom-center, footer telemetry bottom-left. |
| Wide | 1600px and up | Panels keep their fixed widths. World fills the viewport. Hero Display 1 scales to 72px and stops growing. |

### Touch Targets

- **Minimum size:** 44 × 44px for any tappable element.
- **Recommended size:** 48 × 48px for primary actions, 56px height for mobile PLAY.
- **Spacing between targets:** 8px minimum between adjacent buttons, 12px between nav segments on touch.

### Collapsing Strategy

- **Hero / PLAY:** full-width on mobile, 88px desktop height drops to 56px mobile height. The keybind chip is hidden on touch.
- **Cards:** stack vertically under 768px. Feature card becomes full width with the thumbnail shrinking to 72px.
- **Navigation:** top tab bar collapses into a 5-slot icon bar at the bottom of the screen on mobile. Keycap numbers are hidden on touch but remain visible on hover-capable devices.
- **Forms (segmented controls):** segmented tracks stay horizontal, but each segment grows to 44px height on touch.
- **Buttons:** ghost buttons stack into a 2-column grid under 480px.
- **Spacing:** space-6 (24px) inset shrinks to 12px on mobile. Internal padding stays at 16px.
- **Popups:** on mobile, popups anchor to the bottom of the screen above the loadout tray, full width minus 16px margins, instead of attaching to world objects.

---

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary action, active state, selected state: `#D7FF2E`
- Primary action hover: `#E6FF6B`, pressed: `#B8DB1E`
- Panel surface: `#16181C` at 94% opacity
- Raised surface: `#1F2227`
- Border default: `#2E333A`, strong: `#3D434B`
- Primary text: `#F5F3EC`, secondary: `#C9CDD2`, muted: `#9AA0A7`, dim: `#5C6168`
- Reward accent: `#C7692F`
- Warning / danger: `#E5484D`
- Info accent (sparingly): `#9BD8F2`
- Deepest background: `#0C0D0F`

### Iteration Guide

1. Always use `#D7FF2E` for the primary CTA (PLAY) and the active nav tab. Use `#0C0D0F` as the text color on lime, never white.
2. Set every display title and CTA label to `font-family: "Archivo", "Archivo Expanded", "Helvetica Neue", Arial, sans-serif; font-weight: 800; font-stretch: 125%; text-transform: uppercase;`.
3. Set body copy to `font-family: "Inter", system-ui, sans-serif; font-weight: 400; font-size: 14px; line-height: 1.5;` and color `#C9CDD2`.
4. Render every hotkey as a 22px square keycap: `background: #2A2E34; border-bottom: 2px solid #0C0D0F; border-radius: 4px; font: 700 12px "JetBrains Mono", monospace;`.
5. Render every HUD panel as `background: rgba(22,24,28,0.94); border: 1px solid #2E333A; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);` and position it 24px from the viewport edge.
6. Build in-game popups at `width: 340px; max-width: 90vw; border-radius: 6px; border: 1px solid #3D434B; background: rgba(22,24,28,0.94); backdrop-filter: blur(8px); box-shadow: 0 24px 60px rgba(0,0,0,0.6);` with a 2px top edge in the variant color (Info `#D7FF2E`, Reward `#C7692F`, Warning `#E5484D`, Neutral `#3D434B`).
7. Animate popups in with `opacity 0→1` and `translateY(8px)→0` over 160ms `cubic-bezier(0.2, 0.8, 0.2, 1)`. Animate out in 120ms with opacity only.
8. Cap visible in-game popups at 3. Collapse older ones into a single `+N` mono pill.
9. Style status pills as `border-radius: 999px; padding: 4px 10px; font: 500 11px "JetBrains Mono", monospace; text-transform: uppercase; letter-spacing: 0.08em;` with an outline (`1px solid #9AA0A7`) for neutral status and a tinted fill (`#2A1214` background, `#E5484D` text) for AT RISK.
10. Use segmented controls for mutually exclusive choices (difficulty, squad size). Active segment is `background: #D7FF2E; color: #0C0D0F;`, inactive is `color: #9AA0A7`.
11. Keep the 3D world visible in the gutters. Never apply a full-screen overlay during gameplay; only menus may use `rgba(8,9,11,0.72)`.
12. Never use more than one lime CTA per visible surface, and never use lime for text, borders on non-interactive elements, or decoration.
