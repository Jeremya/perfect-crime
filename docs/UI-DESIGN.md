# Perfect Crime — UI and visual design (Gate 1)

This document is the visual companion to `Gate 1 — Specs and backlog.pdf`.
The PDF remains the source of truth for game rules, screen behavior, and
product scope. This document defines how Gate 1 should look and feel. If a
visual choice appears to change a rule or add a feature, follow the PDF and
ask the product owner before expanding scope.

The visual brief that produced this document is the explicit design direction
for this project. It makes a narrow visual exception to the PDF's “simple
vector shapes: no illustrations at gate 1” line: use the specified Kenney
stand sprites for the thief and guards, and the Kenney UI Pack for controls.
This exception affects only those character and control assets; keep the board,
cones, lasers, routes, emitters, and other marks as crisp code-drawn shapes.
The PDF remains authoritative for rules, screen behavior, copy, and scope.

## Product and device

- Game: **Perfect Crime** by Yap Corp; daily heist stealth puzzle.
- Mobile web, portrait first; desktop play is centered in a narrow frame.
- Light theme only for Gate 1. Use system fonts only; do not add a web font.
- Keep the initial download under 3 MB. Prefer code-drawn geometry and small
  vector/raster assets; justify any dependency or large asset.
- This is a stealth puzzle. Do not use weapons, blood, or violent imagery.

## Non-negotiable readability rules

> What kills is readable in 3 seconds.

- Draw guard and camera vision as the **exact grid cells** returned by
  `visibleCells`: tinted cells with a crisp outline. Never use smooth,
  triangular, gradient, blurred, shadowed, or glowing cones. The cells shown
  as visible must be exactly the cells that can detect the thief.
- Keep floors, walls, and furniture neutral and desaturated. Reserve saturated
  colors for danger, the diamond, and the exit.
- Never communicate danger with color alone: pair a tint with an outline and
  an icon or other clear marker. Check the design in grayscale and for
  common color-vision deficiencies.
- Put furniture and decorative detail only on wall cells. Walkable floor
  cells stay visually open and unambiguous.
- Do not put explanatory text on the grid. Allow only compact path/status
  badges that are needed during play.
- Keep cell boundaries and danger overlays legible in sunlight and at phone
  size. Avoid visual effects that obscure the board.

## Visual tokens

These named hex tokens establish a starting point for implementation. Adjust
them when rendering shows a contrast or readability problem, while keeping
the semantic color logic above. Check text and control contrast against WCAG
AA where applicable; game overlays also need to remain distinguishable by
shape, outline, and icon.

| Token | Initial value | Use |
|---|---|---|
| `surface-page` | `#F4F2ED` | App background |
| `surface-panel` | `#FFFFFF` | Cards and controls |
| `floor` | `#D9D8D2` | Walkable cells |
| `wall` | `#47515B` | Walls and slate structures |
| `wall-detail` | `#77818A` | Desaturated wall furniture/detail |
| `grid-line` | `#767C81` | Cell boundaries (≈2.7:1 on the floor) |
| `text-primary` | `#202A33` | Main text and thief outline |
| `text-secondary` | `#56616B` | Supporting text |
| `action-primary` | `#176B78` | PLAY and primary Share action |
| `action-secondary` | `#E6E8E6` | Secondary controls |
| `action-primary-soft` | `#D7E6E8` | Disabled primary action (keeps the brand hue) |
| `danger-guard` | `#D99B32` | Guard cone tint only, at about 30% opacity |
| `danger-guard-outline` | `#8A5600` | Guard cone cell outline |
| `danger-camera` | `#8260A8` | Camera cone tint and outline |
| `danger-laser` | `#C74747` | Active laser and caught state |
| `laser-off` | `#69727B` | Inactive dashed laser |
| `objective-diamond` | `#007F8D` | Diamond and objective marker (≈3.3:1 on the floor) |
| `objective-exit` | `#32865A` | Exit and door icon |
| `path-light` | `#FFFFFF` | Planned route fill |
| `path-outline` | `#26313B` | Route outline |

Motion is short and quiet: 120 ms for a press acknowledgement, 180 ms for a
screen or panel entrance (fade plus a 12 px rise), and nothing at all under
`prefers-reduced-motion: reduce`.

Use the type scale `12 / 14 / 16 / 20 / 24 / 32 px`; body and control labels
must be at least 14 px. Use an 8 px spacing scale (`4 px` is permitted only
for fine alignment), rounded control corners around 8 px and card corners
around 12 px. Use a 1 px default outline and a 2 px outline for focus, danger,
and critical selection. Text follows WCAG AA contrast (4.5:1 for regular text,
3:1 for large text); meaningful non-text outlines and icons should reach 3:1
against their adjacent surface. Primary touch targets are at least 44 × 44 px.

## Board and world rendering

- Board: top-down building on an 8-column × 12-row grid, origin at the top
  left. Floor is light warm gray; walls are dark slate. The board is a card:
  a 6 px inset from the page edge, a soft shadow and a 2 px frame, so the grid
  reads as one object rather than tiles floating on the background.
- Thief: one Kenney Top-down Shooter character in its **stand** pose, no
  weapon, dark enough to remain visible over danger cells, with a light edge.
- Guards: a different **stand** character from the same pack, no weapon;
  tint all guards consistently. Make facing readable.
- Guard cone: amber cells at about 30% fill opacity plus a crisp dark amber
  outline (`danger-guard-outline`) that stays visible against the floor.
- Camera cone: violet cells at about 30% fill opacity plus a crisp violet
  outline. Include a camera icon/marker so it remains distinct from guards.
- Laser: red solid line/cell treatment while active; gray dashed treatment
  while inactive. Show the cycle at the emitter with small on/off ticks.
- Diamond: cyan and visibly distinct from floor; exit: green door icon.
- Planned path: thick rounded near-white line with a dark outline. Pause
  badges use a compact form such as `⏸ 2`.
- Patrols: thin dotted line with small direction arrows; keep them secondary
  to the active danger cells and player's path.
- Caught state: flash/mark the fatal cells in red, add a clear icon and the
  localized cause label (guard, camera, or laser). No blood or impact imagery.
- Ghost preview: show the guard positions and their exact cones at the tick
  under the finger; use reduced opacity and an explicit ghost treatment so
  it cannot be confused with the tick-0 state.
- Draw floors, cones, lasers, patrol lines, and the plan in Phaser/code or
  pre-made cell sprites. Do not rely on a decorative tileset to define game
  rules or walkability.

## Layout and interaction

- Portrait 9:16 composition. On desktop, center the game in a frame no wider
  than 480 px.
- Design and inspect at **390 × 844** and **360 × 640**. Keep the entire grid
  visible between a 64 px top bar and a 96 px bottom action bar where the
  viewport allows; adapt cell size and safe areas without hiding essential
  state on the smaller viewport.
- Rendering density: the canvas renders at the device pixel ratio, capped at 3,
  read once at boot: a later change (browser zoom, another screen) applies on
  reload. Scenes lay out in CSS px through `yapViewSize` and read pointers
  through `yapPointerView`. Create texts with `yapText`/`yapTextStyle` and bake
  textures with `yapBakeTexture`; the source guards `hidpi-guard.test.ts` and
  `text-guard.test.ts` enforce this.
- Top bar: level name, ticks/par, pauses remaining.
- Bottom bar: Clear, the largest primary PLAY action, and Hint only when
  available. Put primary actions in the bottom third for one-thumb use.
- Keep all touch targets at least 44 × 44 px and text at least 14 px except
  nonessential decorative metadata.
- First-encounter guidance is one sentence, dismissed with a tap, and must
  not cover the grid's key area.
- Consent is a non-blocking banner on the first-launch tutorial; it must not
  prevent play or obscure the route-critical board area.

## Screen design checklist

The screen rules and copy remain those in the Gate 1 PDF and FR/EN
dictionaries. Apply this visual checklist to the existing ten screens:

1. **First launch / T1:** start directly in the tutorial, with an animated
   hand demonstrating a route and a non-blocking consent banner.
2. **Home:** daily heist number and status, cleared attempts/stars when
   applicable, streak, countdown, Play, Share when cleared, Tutorial, Settings.
3. **Planning:** grid, patrols, tick-0 cones, route drawing, pause badges,
   and the optional ghost preview.
4. **Execution:** animate the plan, show tick counter, ×2 speed, and Stop.
5. **Failure:** replay the last moments in slow motion with a focused zoom,
   fatal cells, cause, and attempt number; on return retain the plan and show
   a red fatal-cell marker.
6. **Win:** attempts, ticks, par, stars, emoji-line preview, dominant Share,
   Improve my score, and Home.
7. **Challenge card:** shared result and Take the challenge / Later actions.
8. **Comparison:** player vs friend metrics, verdict, See their plan, and
   Share my result.
9. **Settings:** FR/EN, sound, vibration, optional nickname, consent, privacy.
10. **First-encounter bubble:** one short sentence, tap to dismiss, never over
    the board's key area.

The social preview image is 1200 × 630, spoiler-free, with the heist map and
the title “Daily Heist #N”; never include a player path or solution.

## Asset and component guidance

Allowed reference packs are CC0 and may be used commercially (credit optional):

- [Kenney Top-down Shooter](https://opengameart.org/content/topdown-shooter):
  use only weapon-free stand poses for thief and guard characters.
- [Kenney UI Pack](https://kenney-assets.itch.io/ui-pack): use one consistent
  color family for primary actions (PLAY and primary Share) and a neutral
  family for secondary actions.

Use the Kenney Top-down Shooter stand poses for the thief and guards, with no
weapons; do not replace these two characters with geometric placeholders in a
Gate 1 implementation. Map each selected sprite to its role in a small
component/sprite sheet. Use Kenney UI Pack sprites for primary and secondary
controls. Elements without a suitable sprite should be explicitly marked
**drawn in code** (grid, cells, cones, routes, lasers, path, markers, and
camera/laser emitters). Do not add a dependency or asset bundle that breaks
the 3 MB initial-download budget.

Current Gate 1 sprite mapping: `public/assets/kenney/thief-hitman-stand.png`
uses Kenney's **Hitman 1 / stand** pose for the thief;
`public/assets/kenney/guard-man-brown-stand.png` uses **Man Brown / stand** for
guards, consistently backed by the amber guard marker. Both are copied from the
CC0 Top-down Shooter pack; see `public/assets/kenney/LICENSE-topdown-shooter.txt`.
The board and threat marks remain drawn in code. Kenney UI Pack button sprites
have not yet been integrated.

## Visual design deliverables and review

The visual handoff for Gate 1 consists of:

1. A style tile with named palette tokens, type and spacing scales, radii, and
   outline widths (the tokens above are the initial proposal).
2. Mockups for all ten screens at 390 × 844, plus Planning and Failure at
   360 × 640.
3. A component sheet mapping UI elements to Kenney UI Pack sprites or
   “drawn in code”.
4. A world-sprite map naming the thief and guard poses, allowed wall-cell
   furniture, and camera/laser emitter treatments.
5. A one-page readability check showing one heist with two guards, one camera,
   and one laser: tick-0 cones and the ghost preview at tick 8.

Store source files and exports for these handoff artifacts under
`docs/design/`, and link them from the implementing PR. This written spec is
the visual reference; its token table does not count as the mockups, component
sheet, sprite map, or readability-check artifact.

For each UI story, check its relevant screen at both reference sizes and on a
real phone preview. Verify that a player can identify walkable cells, the
current route, and every active threat within three seconds; danger remains
understandable without color; and no decoration competes with gameplay.

## Explicit exclusions

No dark theme, weapons, blood, ads, purchases, accounts, leaderboards,
notifications, currencies, shop, editor, or other screens/features beyond the
Gate 1 scope. Sounds are outside this visual-design specification.
