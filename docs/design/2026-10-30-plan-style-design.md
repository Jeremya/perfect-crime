# Perfect Crime — "Plan d'architecte" visual design (C1 visual pass 3)

Status: direction and screens approved by the product owner on 2026-10-30;
this document is the written design to plan from. Mockups:
`docs/design/plan-style/visual-directions.png` (the three directions, B chosen)
and `docs/design/plan-style/screens.png` (B applied to the other screens).

## 1. Intent

The product owner finds the app ugly and wants it **"épuré, classe, tout en
étant attrayant à l'œil"**: clean, refined, and still eye-catching. An audit
of the built app (Chromium, iPhone emulation 390×844 at DPR 3, real pointer
input) found why it reads as a prototype:

1. **Everything is blurry on phones.** The Phaser canvas renders at CSS size
   (390×844 backing pixels) on a 1170×2532 screen, so every glyph, line and
   sprite is upscaled ×3. Compare `plan-style/before-blur-canvas.png` (game
   text) with `plan-style/before-blur-dom.png` (the same text by the browser).
2. **Wireframe look.** Grey boxes with heavy dark outlines, `sans-serif`
   (Helvetica on iOS, not the system face), and four separate button helpers
   (`level`, `home`, `challenge`, `consent` scenes) whose sizes and radii drift.
3. **Heavy board.** A full ring of dark "keyboard key" wall cells and a strong
   grid everywhere: a spreadsheet framed in black, not a building.
4. **Illegible characters.** The Kenney sprites are 33×43 px images upscaled
   into blobs (the guard reads as a brown bean in a disc); the exit is a green
   square with a dot that reads as a button.
5. **Empty or broken compositions.** Win and challenge cards two-thirds empty,
   "Later" overlapping the challenge card border, the planning instruction
   touching the buttons, the Home map a flat dark slab in another style than
   the board (`plan-style/before-planning.png`, `before-win.png`).

The chosen direction, **B "Plan d'architecte"**, turns the whole game into the
file of a heist: you plan on a blueprint, and every screen is a piece of that
file (a folder, a report, a stamp, a sealed envelope).

## 2. What the product owner decided

- Direction **B** over A "Galerie" and C "Diorama".
- All six screen mockups in `screens.png` approved as shown ("tout est
  propre"), plus the planning screen of direction B in `visual-directions.png`.
- **Characters become drawn plan symbols** (masked thief token, guard token
  with a "G" and a facing wedge) **instead of the Kenney stand sprites**, and
  controls are drawn in code instead of the Kenney UI Pack. `UI-DESIGN.md`
  must be updated to record this.
- The player's route is a **red marker** line; the laser stays red and is
  told apart by shape (see §7).
- Visual work only: same rules, flows, features and screen behaviors.

## 3. Goals, non-goals, anti-goals

Goals:
- **Crisp at every density** (DPR 1 to 3): text and lines as sharp as DOM.
- **One visual system**: tokens, two type families, one small component kit
  used by every scene; no per-scene copies of buttons or cards.
- **The board reads as an architect's plan** while keeping every readability
  rule of `UI-DESIGN.md` (exact-cell cones, never color alone, 3-second read).
- **Every screen composed as in the mockups**: full, balanced, no dead bands,
  no overlap, at 390×844 and 360×640.
- **Thematic moments**: stamps ("REPÉRÉ", "CASSE RÉUSSI"), the folder of the
  day, the sealed plan, the first-launch hand.

Non-goals: no new screens or features, no rule, level or flow change, no dark
theme, no web font, no new runtime dependency. Settings remains in Gate 1
scope; it is simply not among the six representative screen mockups in this
visual pass. Implement it with the shared component kit and the existing
Settings requirements in `docs/UI-DESIGN.md`.
The dev viewer only inherits crisp rendering and the shared board renderer.

Anti-goals (a failure even if it "works"):
- any threat harder to read than today, or the route confusable with a laser;
- essential text under 14 px (stats, attempt number, countdown, button labels);
- remaining blur anywhere, or broken input accuracy at DPR 3;
- visible jank on a mid-range Android, or a bigger initial download.

## 4. Constraints

- Phaser 4.2.1 renders everything; the UI stays in Phaser (no DOM UI layer).
- System fonts only. Serif stack: `ui-serif, "New York", Georgia, "Times New
  Roman", serif`. Mono stack: `ui-monospace, "SF Mono", Menlo, Consolas,
  "Roboto Mono", monospace`. Android/Chrome will fall back to its own serif
  and mono faces; that variance is accepted, layouts must not depend on
  exact glyph widths.
- Light theme, 3 MB initial download, FR/EN dictionaries for every string,
  `prefers-reduced-motion`, touch targets ≥ 44 px, essential text ≥ 14 px,
  WCAG contrast rules of `UI-DESIGN.md`.
- All 12 shipped levels have a full wall border (checked); only T5 mounts a
  camera on the border, at (0,6).
- Tests that pin today's look must be updated, not deleted:
  `tests/unit/board.test.ts` (inset geometry, square integer cells, palette
  contrast) and `tests/e2e/share.spec.ts` (hard-coded PLAY and Share
  positions). CI runs typecheck, lint, unit tests, validate and build.
- Filed as **C1 visual pass 3** (passes 1 and 2, #35 and #38, already touched
  every scene under C1); `tasks/C1.md` records the pass and its ownership.

## 5. Style tile

Tokens (initial values from the mockups; adjust only for contrast, keeping
the semantics):

| Token | Value | Use |
|---|---|---|
| `paper-page` | `#F2EFE6` + 20 px grid at ink 5% | Page background (also `index.html` shell and `theme-color`) |
| `paper` | `#FCFBF6` | Floor, cards, secondary buttons, light parts of tokens |
| `ink` | `#1E3A5F` | Text, outlines, wall edges, primary buttons |
| `ink-soft` | ink at 16% | Grid lines between floor cells |
| `ink-muted` | about `#4E6480` (≥ 4.5:1 on paper) | Secondary text |
| `hatch-ground` | `#DDE4EE` | Wall fill under the hatching |
| `kraft` / `kraft-edge` / `kraft-ink` | `#E4D4AE` / `#B99E66` / `#5C4A24` | Home folder |
| `marker` | `#D2403A` | Player route, pause badges, streak checks |
| `stamp` | `#C9302C` | Stamps, caught state, fatal cell, active laser |
| `danger-guard` | tint `rgba(232,160,48,.24)`, outline `#C27A16` (or darker for 3:1) | Guard cones |
| `danger-camera` | tint `rgba(122,84,168,.18)`, outline `#7A54A8` | Camera cones and lens |
| `laser-off` | `#69727B`, dashed | Inactive laser |
| `objective-diamond` | stroke `#0E7C88`, fill `#D3F0F2` | Diamond |
| `objective-exit` | `#2E7D4F` | Door symbol |
| `guard-token` | fill `#F6DDAE`, stroke and letter `#8A5600` | Guard |
| `thief-token` | `#1B1F24` with a paper mask band | Thief |
| `star` | `#B8860B` | Stars |

Type: serif for titles and sentences (screen title 27–28 px, card titles
20–26 px, body 15–17 px, italic for captions); mono for kickers, numbers,
stats and buttons (uppercase, tracking 0.12–0.2 em, tabular numbers).
Decorative kickers may be 12 px; everything essential is ≥ 14 px (the
mockups used 11 px stats; the implementation must not).

Lines and shapes: ink lines 1.5–2 px; buttons radius 6 px; cards are paper
(radius 2–4 px) with a hard offset shadow (4,5 px, ink 15%); soft shadows only
for physical objects (folder, sheet). No glow, no gradients on the board.

Component kit (one module, used by every scene):
- **Button**: primary (ink fill, paper label, bold) and secondary (paper,
  1.5 px ink outline); disabled primary = ink at 28%; height 52 px; mono
  uppercase label ≥ 14 px; labels must fit at 360 px (reduce tracking or wrap
  to two lines); press acknowledgement 120 ms.
- **Header**: mono kicker + serif title + right-aligned stat block.
- **Fiche** (index card), **leader row** (label · dotted leader · value),
  **stamp** (red double border 3 px + 1.5 px outline offset 3 px, heavy mono,
  rotated about −9°, paper at 55% behind), **kraft folder** (tab + body + paper
  sheet rotated about −1.2°), **day boxes** (7 squares, red ✓ for won days,
  today ringed in red), **wax seal**, **note** (paper slip for consent and
  toasts), **ruler** (progress with graduations).
- **Text factory**: font stacks and device resolution (§6) in one place.

## 6. Rendering foundations

- **Crisp HiDPI.** The canvas backing store is CSS size × `devicePixelRatio`
  (capped at 3), text is rasterized at that resolution, shapes are drawn at
  device resolution. Pointer input, resize and orientation changes, and the C4
  failure zoom (with its unzoomed UI camera) keep working.
- Recommended approach (any other is fine if it meets the acceptance in §12):
  game size in device pixels with a Scale zoom of `1/dpr`, every camera zoomed
  by `dpr` with origin 0, scenes laid out from one `view size in CSS px` helper
  instead of the 17 direct `this.scale.width/height` reads, the 4
  `pointer.x/y` reads in `level-scene.ts` switched to world coordinates, and
  texts created through the factory with `resolution = dpr`.
- The layout bugs listed in §1.5 disappear with the new compositions; the
  challenge header's old accent strip goes too.

## 7. The board as a plan

Geometry:
- The border walls (row 0 and 11, column 0 and 7) render as a **thin frame**
  (about 10 px); the 6×10 interior takes the rest. At 390×844 an interior cell
  grows from 45.75 px to about 57.7 px (+26%).
- If a level's border is not all walls, fall back to uniform cells; a unit
  test asserts every shipped level gets the thin frame.
- One source of geometry (layout + cell rectangle helper) serves drawing,
  hit-testing and path input, the ghost preview, the failure zoom, the viewer
  and the OG previews.
- No card shadow or rounded board corners: a plan sheet with a double ink
  frame (2 px + 0.8 px inner line).

Static layer (drawn once, as today): paper floor; ink-soft grid (0.8 px)
between floor cells only; walls = hatch-ground with ink hatching at 45°
(about 7 px spacing, 1.3 px) clipped to wall cells; an ink edge (1.8 px)
wherever floor meets wall.

Dynamic elements:
- **Guard cone / camera cone**: exact cells, tint plus a crisp 1.5 px outline.
- **Guard**: guard-token circle (radius ≈ 0.28 cell), "G" in bold mono, a
  filled facing wedge just outside the circle.
- **Camera**: paper box with an ink outline on its wall cell, violet lens dot
  on the facing side; T5's border camera sits on the frame, lens toward the
  floor.
- **Laser**: active = thin 2.5 px line through its cells, emitter nubs at
  both ends, faint red cell tint; inactive = laser-off dashed line; the on/off
  cycle ticks at the emitter stay.
- **Patrols**: ink dashed line (4/4) at 55% with small arrowheads, always
  secondary to cones and route.
- **Thief**: thief-token disc, paper mask band with two eye dots, 2.5 px paper
  ring so it stays visible over any cone.
- **Diamond**: outlined gem with facet lines. **Exit**: architectural door
  symbol (leaf, quarter-circle swing, dashed threshold).
- **Route**: marker red, 5.5 px, round caps and joins. It differs from the
  laser by thickness, by the absence of emitter nubs, and by running from the
  thief. During execution the part not yet walked fades to about 30%.
- **Pause badge**: paper pill, red outline, two red bars and the count (mono).
- **Failure**: the detector's cone turns stamp red (tint and outline); the
  fatal cell gets a 3 px red outline, a ring and an X over the thief.
- **Ghost preview (C6) and hint (C7)**: pencil treatment (graphite, dashed
  outlines, about 50% opacity). The hint route is graphite dotted, never red.
- **Friend's plan (E4 "See their plan")**: route in solid ink blue (4 px), so
  it never looks like the player's own.

## 8. Screens

Planning (level scene):
- Header: kicker "CASSE Nº 5", or "TUTORIEL · 1 / 5" in the tutorial; serif
  title (the level name; tutorial lesson names come from the dictionaries, see
  §10); right block TICKS n/par and PAUSES k.
- Footer: one-line italic caption that never touches the buttons (hidden at
  360×640 if there is no room), then Clear (secondary, about 112 px) and PLAY
  (primary). When the plan is empty, PLAY is disabled primary labelled "Draw
  your route". When Hint (C7) is available, the row is Clear, Hint, PLAY.

Execution: header kicker "… — EN COURS", big mono tick counter "07/26" on
the right; walked route solid, remaining route faded; footer ruler, then ×2
and Stop (secondary).

Failure (existing slow-motion replay and focus zoom):
- Header right "TENTATIVE Nº 2".
- Red detector cone and fatal marker.
- Stamp "REPÉRÉ" lands near the fatal cell once the replay settles.
- Footer: serif cause ("Repéré par le garde") and mono "TOUCHE POUR REVENIR
  AU PLAN".
- Back on the plan, the red fatal-cell marker stays (existing behavior).

Win:
- The final board dimmed (about 28%) behind a fiche.
- Fiche: "RAPPORT D'OPÉRATION · Nº 5", the level title, leader rows Attempts /
  Ticks / Par / Stars (gold ★), and a telegram strip "À PARTAGER <emoji line>
  · N ticks ⭐⭐⭐" under a dashed rule.
- Stamp "CASSE RÉUSSI" over the fiche's top-right corner.
- Footer: Share (primary, full width), then Improve my score and Home, or
  Next level in the tutorial chain (secondary).

Home:
- Serif logotype "Perfect Crime" and kicker "UN CASSE PAR JOUR · YAP CORP".
- Kraft folder with tab "DOSSIER Nº 5 · JEUDI". Inside, a paper sheet with the
  spoiler-free mini plan (walls, start token, diamond, door; never threats or
  a route), kicker "CASSE DU JOUR", the level name and mono facts (par,
  elements).
- Status stamp ("À FAIRE", or the cleared result).
- Streak: kicker "SÉRIE · n JOURS" + 7 day boxes; mono countdown.
- Footer: Archive and Tutorial (secondary), primary Play; Share once the day is
  cleared (spec).
- Before and after the test week, the folder shows the first or the last heist
  with a matching stamp.

Archive (O1, not mocked): past days as a stack of folder tabs or index cards
(day number, weekday, status stamp, stars); replay keeps today's behavior (no
streak).

First launch:
- Consent banner as a paper note at the very top (message, "Learn more", OK
  primary, No thanks secondary, ≥ 44 px targets). The header and board move
  down or shrink so the note covers no board cell, and the stats stay visible.
- T1 shows a dashed red ghost route and the **animated hand** of the spec,
  drawing the route in a loop until the first touch; static under reduced
  motion.

Challenge card (E4):
- Header: kicker "MESSAGE REÇU · CASSE Nº 3", serif title "Un défi d'Alex",
  or a nickname-free variant.
- Memo fiche with the existing challenge sentence in typewriter mono, and the
  You / Alex comparison grid.
- A small spoiler-free plan card of the heist with its facts.
- Sealed block: wax seal, "Son plan est sous scellés", "OUVERT APRÈS TA
  RÉUSSITE OU AU 2ᵉ INDICE".
- Footer: Take the challenge (primary) and Later (secondary). Once unlocked,
  the seal is broken and See their plan opens the plan view.

Comparison (after the recipient's win): same memo with both columns filled, a
verdict stamp, See their plan and Share my result.

Toasts ("Copied", "Could not share") and the consent "Learn more" detail use
the note component. The dev viewer keeps its chrome layout.

## 9. Motion

Keep the `UI-DESIGN.md` timings (120 ms press, 180 ms entrance). Additions:
- stamp "thump" (scale about 1.35 to 1, 180 ms);
- the first-launch hand loop (draw about 1.6 s, pause, repeat);
- the route fade during execution.

Under `prefers-reduced-motion` everything is static (stamps simply appear,
the hand stays still).

## 10. Copy and i18n

- New decorative labels go into both dictionaries:
  - kickers: case number, tutorial step, "EN COURS", "RAPPORT D'OPÉRATION",
    "DOSSIER Nº {day} · {weekday}", tagline, "MESSAGE REÇU", "CASSE DU JOUR",
    "SÉRIE · {n} JOURS", "PROCHAIN DOSSIER DANS {time}", "À PARTAGER",
    "TOUCHE POUR REVENIR AU PLAN";
  - stamps: "REPÉRÉ", "CASSE RÉUSSI", "À FAIRE", "SCELLÉ", the verdicts.
- Action labels keep the spec wording.
- Tutorial titles use the spec lesson names: Le plan / Le regard / La ronde /
  La pause / La caméra (EN: The plan / The gaze / The patrol / The pause / The
  camera). Daily heists keep their level names.

## 11. Documents and assets

- Rewrite `docs/UI-DESIGN.md` to this system: tokens, type families,
  components, board rules (thin frame, hatching, symbols), the route-color and
  stamp rules, the decision to drop the Kenney sprite and UI Pack mandates.
  Every readability rule stays.
- Keep the mockups and this document under `docs/design/`.
- Remove `public/assets/kenney/` once nothing uses it.
- Update `tasks/C1.md` (visual pass 3).

## 12. Verification and acceptance

- **Density**: at 390×844 @3 and 360×640 @2, `canvas.width` equals CSS width ×
  DPR, asserted by an automated browser check. A crop of the header text looks
  as sharp as DOM text.
- **Screenshots** of every state at 390×844 @3 and 360×640 @2, attached to
  each PR:
  - planning on T1 and D5, execution, failure, back to the plan;
  - win (tutorial and daily);
  - Home during and after the week, Archive;
  - first launch with consent;
  - challenge card, comparison, friend's plan;
  - toasts, hint, ghost.
- **Layout and contrast**:
  - no clipping or overlap at either size;
  - essential text ≥ 14 px and touch targets ≥ 44 px;
  - the palette tests in `board.test.ts` rewritten for the new tokens;
  - 3-second read and grayscale check on D5 and D7.
- **Input and gates**:
  - drawing is accurate at DPR 3, with `tests/e2e/share.spec.ts` updated and
    passing;
  - the unit tests and build pass and `levels.json` is unchanged;
  - the initial download does not grow.
- **Real phones**: the product owner checks iPhone and Android for sharpness,
  sunlight readability and smoothness.

## 13. Delivery

The plan decides the split. A natural order, one PR each:
1. Crisp rendering and font stacks (ships alone, biggest single win).
2. Tokens, component kit, header and footer in every scene.
3. Board plan renderer (geometry, hatching, symbols, route) and its tests.
4. Screen compositions: Home and Archive, first launch and hand, execution,
   failure stamp, win report, challenge, comparison and friend's plan, toasts,
   consent.
5. `UI-DESIGN.md` rewrite and Kenney cleanup.
6. OG previews in plan style (`tools/og.ts`): last, droppable if time is short.

## 14. Calls made while writing this (to check)

- Action buttons keep the spec wording ("Jouer", "Améliorer mon score",
  "Relever le défi", "Plus tard"): the mockup's "OUVRIR LE DOSSIER" on Home
  becomes "Jouer".
- EN stamps: "SPOTTED" and "HEIST PULLED OFF".
- The UI stays drawn in Phaser rather than moving to an HTML layer.
- The thin frame needs a full wall border, with a uniform-cell fallback.
- The hint route is graphite and the friend's route ink blue.
- The first-launch consent banner stays non-blocking at the bottom as required
  by `docs/UI-DESIGN.md`; it must not cover the grid's key area or the header.
- Essential info is ≥ 14 px even where the mockups were smaller.
- The OG previews are restyled too, as the last step.
- The Kenney files are deleted.
- The dev viewer gets no chrome redesign.

## 15. Left to the builder

Exact pixel values within the scales above, the HiDPI implementation, hatch
spacing and angle, easing curves, EN wording of the new labels, how the
component kit is organized in files, and the exact PR split.
