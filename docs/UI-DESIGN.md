# Perfect Crime — UI and visual design (Gate 1)

This document is the visual companion to `Gate 1 — Specs and backlog.pdf`.
The PDF remains the source of truth for game rules, screen behavior, and
product scope. This document defines how Gate 1 looks and feels. If a visual
choice appears to change a rule or add a feature, follow the PDF and ask the
product owner before expanding scope.

The direction is **"plan d'architecte"**: every screen is a sheet of an
architect's file — paper and ink, a typewriter for the facts, a serif for the
words, red for what the player marks and what catches them. It was approved
screen by screen on 2026-10-30; its design is
`docs/design/2026-10-30-plan-style-design.md` and its mockups are in
`docs/design/plan-style/`. Everything is drawn in code: characters, threats,
controls and the board alike. There is no sprite pack and no web font, in line
with the PDF's "simple vector shapes: no illustrations at gate 1".

## Product and device

- Game: **Perfect Crime** by Yap Corp; daily heist stealth puzzle.
- Mobile web, portrait first; desktop play is centered in a narrow frame.
- Light theme only for Gate 1. System fonts only; no web font.
- Keep the initial download under 3 MB. Prefer code-drawn geometry; justify
  any dependency or asset.
- This is a stealth puzzle. Do not use weapons, blood, or violent imagery.

## Non-negotiable readability rules

> What kills is readable in 3 seconds.

- Draw guard and camera vision as the **exact grid cells** returned by
  `visibleCells`: tinted cells with a crisp outline. Never use smooth,
  triangular, gradient, blurred, shadowed, or glowing cones. The cells shown
  as visible must be exactly the cells that can detect the thief.
- Keep the plan neutral: paper floors, hatched walls, ink lines. Reserve
  saturated colour for danger, the diamond, the exit and the player's route.
- Never communicate danger with colour alone: pair a tint with an outline and
  a token shape (the guard's "G", the camera's box, the laser's nubs). Check
  the design in grayscale and for common colour-vision deficiencies.
- Walkable floor cells stay visually open and unambiguous; detail lives on
  wall cells only.
- Do not put explanatory text on the grid. Allow only compact path/status
  badges that are needed during play.
- Keep danger overlays legible in sunlight and at phone size. Nothing may
  obscure the board: notes and stamps never cover a cell that matters.
- No glow and no gradient anywhere. Hard offset shadows for cards, soft
  shadows only for physical objects (Home's folder and its sheet).

## Visual tokens

`YAP_PALETTE` in `src/game/board.ts` holds every colour. Text meets WCAG AA
(4.5:1 for regular text, 3:1 for large text); meaningful non-text marks reach
3:1 against their surface. `tests/unit/board.test.ts` pins these floors.

| Token | Value | Use |
|---|---|---|
| `paper-page` | `#F2EFE6` | Page and canvas clear colour (with a 20 px grid of ink at 5%), `index.html` shell and `theme-color` |
| `paper` | `#FCFBF6` | Board floor, cards, secondary buttons, notes |
| `ink` | `#1E3A5F` | Text, outlines, wall edges, primary buttons |
| `ink-muted` | `#4E6480` | Secondary text (≥ 4.5:1 on paper) |
| `ink-disabled` | `#BEC5CC` | Disabled primary (ink at 28% on paper) |
| ink-soft | `ink` at 16% | The faint grid between floor cells |
| `hatch-ground` | `#DDE4EE` | Wall fill under the 45° ink hatching |
| `marker` | `#D2403A` | The player's route, pause badges, streak checks |
| `stamp` | `#C9302C` | Stamps, the caught state, the fatal cell, the active laser |
| `guard-cone` / `guard-cone-edge` | `#E8A030` at 24% / `#C27A16` | Guard cones |
| `camera-cone` | `#7A54A8` (18% tint and outline) | Camera cones and lens |
| `laser-off` | `#69727B` | Inactive dashed laser |
| `diamond-edge` / `diamond-fill` | `#0E7C88` / `#D3F0F2` | Diamond |
| `exit-door` | `#2E7D4F` | Door symbol |
| `guard-token` / `guard-token-ink` | `#F6DDAE` / `#8A5600` | Guard token, its "G" and wedge |
| `thief-token` | `#1B1F24` | Thief disc (paper mask band and ring) |
| `graphite` | `#5B6470` | Pencil: the ghost preview and the hint |
| `kraft` / `kraft-edge` / `kraft-ink` | `#E4D4AE` / `#B99E66` / `#5C4A24` | Home's folder |
| `star` | `#B8860B` | Stars |

The older tokens (`surface-*`, `grid-line`, `text-*`, `action-*`, `path-*`)
remain only for the dev viewer's chrome; the game screens and the share
previews use the tokens above.

**Type.** Two system stacks: serif (`ui-serif, "New York", Georgia, …`) for
titles and sentences, mono (`ui-monospace, "SF Mono", Menlo, …`) for kickers,
numbers, stats and buttons, in capitals with tracking. The roles live in
`YAP_TEXT_ROLES` (`src/game/text.ts`):

| Role | Family, size | Use |
|---|---|---|
| `screenTitle` | serif 27 | Header title (fitted down to 18) |
| `cardTitle` | serif 22 | Card and fiche titles |
| `body` | serif 16 | Sentences, row labels |
| `caption` | serif 15 italic | Captions, notes |
| `kicker` | mono 12, capitals, 0.12 em | Decorative kickers only |
| `stat` | mono 14, capitals, 0.12 em | Stats, countdowns, facts |
| `statLarge` | mono 22 bold, 0.12 em | The playback's tick counter |
| `button` / `buttonPrimary` | mono 14 / 15 bold, capitals | Button labels |

Essential text is at least 14 px; only decorative kickers and stamps may go to
12 px, never below. A label that does not fit at 360 px loses its tracking,
then wraps. A tracked text drops its spacing for an emoji (`yapCanTrack`), which
Phaser would otherwise split in two.

**Lines and shapes.** Ink lines of 1.5–2 px; buttons radius 6 px, 52 px tall;
cards radius 3 px with a hard shadow (4, 5 px, ink at 15%); touch targets at
least 44 × 44 px.

**Motion.** 120 ms for a press acknowledgement, 180 ms for an entrance (fade
plus a 12 px rise), a stamp's thump from 1.35× to its size in 180 ms, the
first-launch hand's loop (1.6 s drawing, 0.8 s rest), the route fading behind
the thief during the playback. Under `prefers-reduced-motion: reduce`
everything is static: stamps simply appear, the hand stays still.

## Board and world rendering

- Board (`docs/design/2026-10-30-plan-style-design.md` §7): a top-down plan of
  an 8-column × 12-row grid, origin at the top left. The border walls render
  as a thin 10 px frame (uniform cells for a level whose border is not all
  walls), so the interior cells take the room: 59 px at 390 × 844. One
  geometry (`yapLevelLayout`, `yapCellRect`, `yapCellAt` in
  `src/game/board.ts`) serves drawing, input, the ghost, the failure zoom,
  the viewer and the e2e strokes.
- Plan sheet: paper floor, an ink-soft 0.8 px grid between floor cells only,
  walls in `hatch-ground` with 45° ink hatching, a 1.8 px ink edge wherever
  floor meets wall, and a double ink frame (2 px + 0.8 px). No card shadow, no
  rounded board corners.
- Thief: a dark `thief-token` disc with a paper mask band and two eyes, and a
  2.5 px paper ring so it stays visible over any cone.
- Guards: a `guard-token` disc with a "G" and a filled facing wedge just
  outside it.
- Guard cone: exact cells tinted `guard-cone` at 24% with a crisp 1.5 px
  `guard-cone-edge` outline. Camera cone: `camera-cone` at 18% with a 1.5 px
  outline. Cameras are a paper box with an ink outline on their wall cell —
  flush with the board's edge, across the frame, for a border camera — and a
  violet lens on the side they face.
- Laser: a thin 2.5 px `stamp` beam with emitter nubs and a faint red cell
  tint while active; a dashed `laser-off` line while inactive. The cycle shows
  at the emitter with small on/off ticks.
- Diamond: an outlined gem with facets; exit: an architectural door symbol
  (threshold, open leaf, quarter-circle swing) on its wall side.
- Planned path: a 5.5 px `marker` line with round caps and joins, thicker than
  a laser and without nubs. During the playback the part not yet walked is at
  about 30%. Pause badges are a paper pill with a marker outline, two bars and
  the count.
- Patrols: an ink dashed line (4/4) at 55% with small arrowheads; secondary to
  the cones and the route.
- Caught state: the detector's cone turns `stamp` red, the fatal cell gets a
  3 px red outline, a ring and an X, and the REPÉRÉ stamp lands beside it once
  the replay settles, with the localized cause label. No blood or impact
  imagery.
- Ghost preview: the guard positions and their exact cones at the tick under
  the finger, in pencil (graphite, dashed outlines, about 50% opacity) so it
  cannot be confused with the tick-0 state. The hint route is graphite dots,
  never red, and its pauses are graphite pause badges; the friend's plan is a
  solid ink line.

## Layout and interaction

- Portrait 9:16 composition. On desktop, center the game in a frame no wider
  than 480 px.
- Design and inspect at **390 × 844** and **360 × 640**. Keep the entire grid
  visible between the 64 px header and the 96 px footer; adapt the cell size
  without hiding essential state on the smaller viewport.
- Rendering density: the canvas renders at the device pixel ratio, capped at 3,
  read once at boot: a later change (browser zoom, another screen) applies on
  reload. Scenes lay out in CSS px through `yapViewSize` and read pointers
  through `yapPointerView`. Create texts with the text factory (`yapText`,
  `yapRoleText`) and bake textures with `yapBakeTexture`; the source guards
  `hidpi-guard.test.ts` and `text-guard.test.ts` enforce this.
- Header (every screen): a mono kicker over the serif title on the left, the
  stats on the right, a hairline under it.
- Planning footer: the caption, then Clear, Hint (only when available) or
  Preview (once the route is complete), and the widest primary PLAY. Primary
  actions sit in the bottom third for one-thumb use.
- First launch: the consent note sits at the very top; the header and the
  board move down under it, so it covers no board cell and the stats stay
  visible. It never blocks play.
- First-encounter guidance is one sentence, dismissed with a tap, and must
  not cover the grid's key area.

### The kit

- Base components in `src/game/kit.ts`: `yapPaperPage`, `yapHeader`,
  `yapButton` (primary or secondary, 52 px, 120 ms press, `fireOn: 'up'` for
  Share, which needs the release's user activation), `yapCard`, `yapRule`,
  `yapShowToast` (a paper note), and the row helpers `yapActionRow` and
  `yapPlanningRow`. Home's actions come from `yapHomeActions`
  (`src/game/home-layout.ts`). `kit-guard.test.ts` keeps private button
  helpers out of the scenes.
- Screen pieces in `src/game/kit-screens.ts`, their geometry in
  `src/game/compose.ts`: `yapStamp` (red double border, −9°, the thump, never
  under 12 px — it falls back to a shorter text), `yapLeaderRow` (label ·
  dotted leader · value), `yapDayBoxRow` (the seven days, a red ✓ per won day,
  today ringed), `yapRuler` (the playback's progress), `yapSeal` (wax seal,
  broken once a friend's plan opens) and `yapFolder` (Home's kraft folder with
  its tilted paper sheet).
- The board's drawing lives in `src/game/render.ts`, its pure geometry in
  `src/game/plan-geometry.ts`.

## Screen design checklist

The screen rules and copy remain those in the Gate 1 PDF and the FR/EN
dictionaries. As built:

1. **First launch / T1:** the tutorial at once, the consent note at the top
   (OK and No thanks, ≥ 44 px), and the hand that draws the start of the route
   over a dashed red ghost until the first touch.
2. **Home:** the tagline over "Perfect Crime" and the week's ★ total; the
   kraft folder of the day (DOSSIER Nº n · weekday) with the mini plan, the
   par, the star thresholds and the threats, and the status stamp (À FAIRE,
   RÉUSSI · n ESSAIS with the stars); the streak kicker, the seven day boxes
   and the countdown; Play, Share once cleared, Archive, Tutorial. Before and
   after the week, the first or the last heist with its stamp. Archive rows:
   number, weekday, status stamp, stars.
3. **Planning:** grid, patrols, tick-0 cones, route drawing, pause badges, the
   optional ghost preview, the plan preview (X3) and the hint (C7).
4. **Execution:** the plan played with the route fading behind the thief, the
   tick counter, the ruler, ×2 and Stop.
5. **Failure:** the last moments replayed slowly with a focused zoom, the red
   detector cone and fatal cell, the REPÉRÉ stamp, the cause and the attempt
   number; back on the plan, the plan is kept and the fatal-cell marker stays.
6. **Win:** the board dimmed behind the report fiche (kicker, title, leader
   rows with gold stars, the share telegram) with the CASSE RÉUSSI stamp; Share
   dominant and full width, then Improve my score and Home or Next level.
7. **Challenge card:** the memo (the sender's result in typewriter capitals,
   the You / Friend grid), a small plan card when it fits, the wax seal over
   the friend's plan; Take the challenge and Later.
8. **Comparison:** both columns filled and a verdict stamp; the seal broken
   and See their plan. "Share my result" is a follow-up story.
9. **Settings:** not at Gate 1 (no screen yet).
10. **First-encounter bubble:** one short sentence, tap to dismiss, never over
    the board's key area.

The social preview image (`tools/og.ts`, built into `public/icons/`) is
1200 × 630 and spoiler-free: a sheet of the file — the paper page, the tagline
in typewriter capitals, the title "Daily heist #N" in the typewriter font over
a double ink rule,
and the heist as a plan (hatched walls, the double frame, the start, the
diamond, the door, the threats as their tokens at tick 0). Never a player
path, a cone or a solution.

## Assets

None for the game itself: the thief, the guards, the threats, the board and
every control are drawn in code. The component sheet is the code above
(`kit.ts`, `kit-screens.ts`, `render.ts`); the visual references are the
design document and its mockups in `docs/design/plan-style/`. Do not add a
dependency or an asset bundle that breaks the 3 MB initial-download budget;
icons and share previews in `public/icons/` are generated by the build.

## Review

For each UI story, check its screens at both reference sizes, in EN and FR,
and on a real phone preview. Verify that a player can identify walkable cells,
the current route, and every active threat within three seconds; that danger
remains understandable without colour (grayscale copy); and that no decoration
competes with gameplay.

## Explicit exclusions

No dark theme, weapons, blood, ads, purchases, accounts, leaderboards,
notifications, currencies, shop, editor, or other screens/features beyond the
Gate 1 scope. Sounds are outside this visual-design specification.
