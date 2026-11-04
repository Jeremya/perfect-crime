# Plan style 3/6 — The board as a plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the level board as an architect's plan:
- a thin wall frame, so the interior cells grow;
- a paper floor with ink seams, and hatched walls;
- code-drawn tokens for the guards, cameras, thief, diamond and door;
- the player's route as a marker-red line that fades behind the thief during the playback;
- pencil treatment for the ghost and the hint.

**Architecture:**
- **Geometry (`board.ts`).** It is the one source of geometry. A layout gains `frame`, the thickness of the border walls in px (0 = uniform cells). `yapCellRect`, `yapCellCenter` and the new `yapCellAt` handle the thin frame. `yapLevelLayout` picks the frame from the level, and every caller (scene, input, viewer, challenge, Home mini-map, e2e) goes through it.
- **Shape maths (`src/game/plan-geometry.ts`).** A new pure module, unit-tested: hatching, seams, wall edges, dashes, laser beams, door side, walked steps.
- **Drawing (`render.ts`).** It draws Phaser Graphics only, through those helpers. The level scene stops using the Kenney sprites.

**Tech Stack:** TypeScript (strict), Phaser 4.2.1, Vite, Vitest (node env), Playwright 1.64 (manual e2e).

**Spec:** `docs/design/2026-10-30-plan-style-design.md`: §7 (all of it), the route fade of §9, the board parts of §12 and §13 step 3. Slice 2 (PR #60, branch `c1-plan-style-2`) is the base: this branch stacks on it.

## Global Constraints

- **Geometry (§7):**
  - border walls render as a thin frame of **10 px** on the level board, and the interior takes the rest;
  - a level whose border is not all walls falls back to uniform cells;
  - **one** geometry source serves drawing, hit-testing and path input, the ghost, the failure zoom, the viewer and the e2e strokes;
  - no card shadow and no rounded board corners: a **double ink frame, 2 px + 0.8 px inner line**.
- **Static layer:**
  - the floor is `paper`;
  - `ink-soft` (ink at 16%) grid lines of **0.8 px** between floor cells only;
  - walls are `hatch-ground` `#DDE4EE` with ink hatching at **45°, 7 px spacing, 1.3 px**, clipped to wall cells;
  - an ink edge of **1.8 px** wherever floor meets wall.
- **Tokens (§5), exact:**
  - `hatch-ground #DDE4EE`, `marker #D2403A`, `stamp #C9302C`;
  - guard cone tint `#E8A030` at 0.24 with outline `#C27A16`, and camera cone tint `#7A54A8` at 0.18 with outline `#7A54A8`;
  - diamond stroke `#0E7C88` and fill `#D3F0F2`, exit `#2E7D4F`;
  - guard token fill `#F6DDAE`, with stroke and letter `#8A5600`;
  - thief token `#1B1F24`, laser off `#69727B` (exists);
  - plus `graphite #5B6470` for the pencil treatment (a builder's call, §15).
  - Cone outlines are **1.5 px**.
- **Dynamic elements (§7), exact sizes:**
  - **Guard:** radius ≈ 0.28 cell, a bold "G", and a filled facing wedge just outside the circle.
  - **Laser:** active is a 2.5 px `stamp` line with emitter nubs at both ends and a faint red cell tint; inactive is a dashed `laser-off` line; the on/off tick at the emitter stays.
  - **Patrols:** ink dashed **4/4** at **55%** with small arrowheads.
  - **Thief:** a 2.5 px paper ring around the disc.
  - **Route:** `marker`, **5.5 px**, round caps and joins; during the playback the part not yet walked is at **≈30%**.
  - **Fatal cell:** a **3 px** red outline.
  - **Pencil:** ≈50% opacity. The hint route is graphite dotted, never red.
  - **Friend's plan:** solid ink, **4 px**.
- **Rules kept from `docs/UI-DESIGN.md`:**
  - cones are exactly the cells of `visibleCells`;
  - danger is never shown by colour alone;
  - text ≥ 14 px except decorative marks;
  - touch targets ≥ 44 px;
  - nothing animates under `prefers-reduced-motion`; the route fade is static, not tweened.
- **Housekeeping:**
  - all text through `text.ts`, all sizes through `hidpi.ts`, and the source guards stay green unchanged;
  - the `Yap` prefix on exported names;
  - `src/core/` untouched; no new dependency;
  - `levels/levels.json` unchanged;
  - all copy in FR/EN.
  - The Kenney PNG files and their license stay on disk until slice 5; slice 3 only stops loading and drawing them.
- **Full gate:** `npm run typecheck && npm run lint && npm run test && npm run validate && npm run build`, then `npx playwright test tests/e2e/hidpi.spec.ts tests/e2e/share.spec.ts`. Restore `public/icons` (`git checkout public/icons`) and delete `test-results/` before committing.

## Review Focus

- **A stroke that starts on the frame or on a cell's edge at DPR 3 must land on the cell under the finger.** Pinned in Task 2: the `yapCellAt` boundary tests, plus the existing e2e strokes, which now take their geometry from `yapLevelLayout`.
- **The 11 cameras that sit on the border must show on the frame, lens toward the floor.** These are T5, m3, m7, h2, h4, h5, h6, h8, h9 and h10, which has two. Pinned in Task 3 by `yapCameraAnchor` tests (the centre lies on the frame strip and the lens points inward). Task 6's review checks it in a T5 screenshot.
- **A resize must keep the drawn route on its cells,** since the frame and the cell change with the view. Pinned by the existing e2e `follows a resize` and `follows a frame size change`, which must stay green.
- **A dev or viewer level without a full wall border must still render and take input.** Pinned in Task 2: `yapBoardFrame` returns 0 for an open border, and the layout is then uniform.
- **The route must never read as a laser.** It is 5.5 px marker with no nubs; an active laser is 2.5 px stamp with nubs. Pinned in Task 3: constants test `route and laser differ by width`. Task 6's review checks it on a D5 screenshot.

---

### Task 1: Board tokens

**Files:**
- Modify: `src/game/board.ts` (`YAP_PALETTE` and the cone constants)
- Test: `tests/unit/board.test.ts`

**Interfaces:**
- Produces these `YAP_PALETTE` keys: `'hatch-ground'`, `marker`, `stamp`, `'guard-cone'` (`#E8A030`), `'guard-cone-edge'` (`#C27A16`), `'camera-cone'` (`#7A54A8`), `'diamond-edge'`, `'diamond-fill'`, `'exit-door'`, `'guard-token'`, `'guard-token-ink'`, `'thief-token'` and `graphite`.
- Produces these constants: `YAP_INK_SOFT_ALPHA = 0.16`, `YAP_GUARD_CONE_ALPHA = 0.24`, `YAP_CAMERA_CONE_ALPHA = 0.18` and `YAP_CONE_LINE_WIDTH = 1.5`.
- Old keys stay until Task 7's cleanup, because the viewer and `tools/og.ts` (slice 6) still read some of them.

- [ ] **Step 1: Failing tests.** Add `describe('plan style tokens — the board')`:
  - `marks read on paper at 3:1`: every one of `guard-cone-edge`, `camera-cone`, `marker`, `stamp`, `diamond-edge`, `exit-door`, `thief-token`, `laser-off` and `graphite` against `paper` ≥ 3;
  - `the guard letter reads on its token`: contrast(guard-token-ink, guard-token) ≥ 4.5;
  - `ink edges read on the hatching`: contrast(ink, hatch-ground) ≥ 4.5.
- [ ] **Step 2:** `npx vitest run tests/unit/board.test.ts`. Expect FAIL (missing keys).
- [ ] **Step 3:** Add the keys and constants, one comment line each naming the role (spec §5/§7).
- [ ] **Step 4:** Run the test. Expect PASS.
- [ ] **Step 5:** Commit `[C1] Plan style board tokens: hatching, marker, stamp, tokens, graphite`.

### Task 2: Thin-frame geometry, one source for every caller

**Files:**
- Modify: `src/game/board.ts`, `src/game/path-input.ts` (cell lookup and the central zone), `src/game/level-scene.ts`, `src/game/viewer-scene.ts`, `src/game/challenge-scene.ts`, `tests/e2e/support.ts`
- Test: `tests/unit/board.test.ts`, `tests/unit/path-input.test.ts`

**Interfaces:**
- `YapBoardLayout` gains `readonly frame: number`: the px thickness of the border row and column (0 = uniform). `cell` stays the interior cell size.
- `yapComputeLayout(viewWidth, viewHeight, gridWidth, gridHeight, topBar?, bottomBar?, inset?, frame = 0)`:
  - with `frame > 0`: `cell = floor(min((availW − 2·frame)/(gridWidth − 2), (availH − 2·frame)/(gridHeight − 2)))`, `boardWidth = 2·frame + (gridWidth − 2)·cell`, and the same for the height;
  - with `frame = 0` it behaves exactly as today.
- `YAP_BOARD_FRAME = 10`.
- `yapBoardFrame(level: YapLevel, frame = YAP_BOARD_FRAME): number` returns `frame` when the outer ring of the map is all `#`, and 0 otherwise.
- `yapLevelLayout(viewWidth, viewHeight, level, topBar?, bottomBar?, frame?)` is `yapComputeLayout` with `yapBoardFrame(level, frame)`.
- `yapCellRect` and `yapCellCenter`, with a frame: column 0 is `[originX, originX + frame)`, column x in `1..W−2` starts at `originX + frame + (x − 1)·cell`, and column W−1 is `frame` wide. The same goes for rows.
- `yapCellAt(layout, px, py): YapCell | null` is the exact inverse of `yapCellRect`; null outside the board.
  - `gridWidth` and `gridHeight` must be on the layout: add `readonly columns` and `readonly rows`.

- [ ] **Step 1: Failing tests** in `board.test.ts`:
  - `every shipped level gets the thin frame`: for every level in `levels/levels.json`, `yapBoardFrame(level)` is 10;
  - `an open border falls back to uniform cells`: a map with a `.` on row 0 gives frame 0, and `yapLevelLayout` then equals today's layout;
  - `the interior grows at 390 × 844`: `yapLevelLayout(390, 844, T1)` gives `frame` 10, `cell` 59, `boardWidth` 374, `boardHeight` 610, with the board inside the bars and insets; at 360 × 640, `cell` ≥ 44;
  - `yapCellAt inverts yapCellRect`: for every cell of T1 at both sizes, the rect's top-left, its centre and its bottom-right minus 0.01 map back to the cell; a point 0.01 left of the board, or at `originX + boardWidth`, maps to null;
  - the old `keeps square integer cells` case moves under `frame = 0`.
- [ ] **Step 2: Failing tests** in `path-input.test.ts`: the existing strokes rebuilt on a `yapLevelLayout` layout. Add `a press on the frame selects the border cell, not the first floor cell`: the press lands on `originX + 5` beside the start cell's row, and the start is not selected.
- [ ] **Step 3:** Run both. Expect FAIL.
- [ ] **Step 4: Implement** the layout, rect, centre, `yapCellAt`, `yapBoardFrame` and `yapLevelLayout`.
  - `path-input.ts` looks cells up only through `yapCellAt`. Its central-zone test uses `yapCellRect(...)` (`rect.w`, `rect.h`), not `l.cell`.
  - The level scene (`yapComputeLayout` call at ~line 504), the viewer, the challenge friend's plan (`topBar` 0, `bottomBar` 0) and `tests/e2e/support.ts` (`yapDraw`) call `yapLevelLayout`.
  - The Home mini-map moves in Task 4.
- [ ] **Step 5:** Run the full gate and both e2e specs. All PASS, including the strokes at DPR 3 and both resize tests.
- [ ] **Step 6:** Commit `[C1] Thin wall frame: one board geometry for drawing and input`.

### Task 3: Plan geometry helpers

**Files:**
- Create: `src/game/plan-geometry.ts`, `tests/unit/plan-geometry.test.ts`

**Interfaces** (all pure, all values in CSS px; a segment is `YapSegment { x1, y1, x2, y2 }`):
- `yapHatchSegments(rect: YapRect, spacing: number): YapSegment[]`:
  - 45° lines `x − y = k·spacing` in board space, so they continue across neighbouring cells;
  - clipped to `rect`.
- `yapFloorSeams(level, layout): YapSegment[]`: one segment per side that two floor cells share.
- `yapWallEdges(level, layout): YapSegment[]`: one segment per side that a floor cell shares with a wall cell.
- `yapDashes(from: YapPoint, to: YapPoint, on: number, off: number): YapSegment[]`: dashes along the segment; the last one is clipped to `to`.
- `yapLaserBeam(level, layout, cells): { from: YapPoint; to: YapPoint; axis: 'h' | 'v' }`:
  - the beam runs from the outer edge of the first cell to the outer edge of the last;
  - axis: from the run when it has ≥ 2 cells; for one cell, `h` when its left and right neighbours are walls, else `v` when its upper and lower ones are, else `h`.
- `yapDoorSide(level, at): YapDir`: the first wall neighbour of the exit in the order E, S, W, N; `S` when there is none.
- `yapCameraAnchor(level, layout, at, facing): { centre: YapPoint; lens: YapPoint }`:
  - inside the board, the centre is the cell centre;
  - for a border camera, the centre is on the middle of the frame strip, and `lens` is offset by 0.18·cell toward `facing`.
- `yapWalkedSteps(plan: YapPlan, tick: number): number`: the number of non-`wait` moves in `plan.slice(0, tick)`, i.e. the index in the path of the cell the thief stands on.
- Constants: `YAP_ROUTE_WIDTH = 5.5`, `YAP_LASER_WIDTH = 2.5`, `YAP_HATCH_SPACING = 7`, `YAP_HATCH_WIDTH = 1.3`, `YAP_SEAM_WIDTH = 0.8`, `YAP_WALL_EDGE_WIDTH = 1.8`, `YAP_ROUTE_UNWALKED_ALPHA = 0.3`, `YAP_PENCIL_ALPHA = 0.5`, `YAP_FRIEND_ROUTE_WIDTH = 4`.

- [ ] **Step 1: Failing tests:**
  - `hatching stays inside its cell and keeps its phase`: every segment's ends are inside the rect, and every segment satisfies `x − y ≡ 0 (mod 7)`, within 1e-9, at the same `k` grid in two neighbouring rects;
  - `seams and edges on T1`: 6·9 + 5·10 = 104 seams (interior 6×10 floor) and 2·(6+10) = 32 wall edges; on D5, every edge has a wall on exactly one side;
  - `dashes of 4/4 cover half the line`: on a 40 px line there are 5 dashes of 4 px;
  - `laser beams on D4 and D5`: D5's two vertical cells give `axis` `v` from the top edge of (6,7) to the bottom edge of (6,8); D4's single cell (4,6) follows its wall neighbours;
  - `the T1 door opens on the east wall`: `yapDoorSide(T1, {6,6})` is `E`;
  - `border cameras sit on the frame`: for T5's camera at (0,6), the centre's x is `originX + 5` and the lens x is greater than the centre x; for h4's camera at (7,3), the lens x is smaller;
  - `the walked steps skip the pauses`: `yapWalkedSteps(['E','wait','E','S'], 3)` is 2, and the result is 0 at tick 0;
  - `route and laser differ by width`: `YAP_ROUTE_WIDTH` ≥ 2 × `YAP_LASER_WIDTH`.
- [ ] **Step 2:** Run. Expect FAIL (no module).
- [ ] **Step 3:** Implement `src/game/plan-geometry.ts`.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `[C1] Plan geometry: hatching, seams, edges, dashes, beams, door, anchors`.

### Task 4: The plan sheet: static layer, double frame, patrols, mini-map

**Files:**
- Modify: `src/game/render.ts` (`yapDrawStaticGrid`, `yapDrawPatrol`, `yapDrawMiniMap`), `src/game/level-scene.ts` (the board card and frame), `src/game/home-scene.ts` (`yapDrawPreview`)

**Interfaces:**
- Consumes the Task 1 tokens, the Task 2 layout and the Task 3 helpers.
- `yapDrawStaticGrid(g, level, layout)`:
  - paper floor, `hatch-ground` walls and the clipped hatching;
  - seams in ink at `YAP_INK_SOFT_ALPHA`, 0.8 px;
  - wall edges in ink, 1.8 px.
- New `yapDrawBoardFrame(g, layout)`: the double ink frame, 2 px outside and a 0.8 px inner line 3 px inside. It is drawn over the grid.
- `yapDrawPatrol(g, layout, guard)`: `yapDashes(…, 4, 4)` in ink at 0.55, and small filled ink arrowheads at segment middles.
- `yapDrawMiniMap(g, level, x, y, width, height)`: the mini board through `yapLevelLayout(width, height, level, 0, 0, 4)`, with the static grid, the start, the diamond, the exit and the double frame.
  - Its signature changes: Home passes the box instead of a cell.

- [ ] **Step 1: Level scene:**
  - remove the shadow card (the three offset fills) and the old 2 px frame;
  - bake the new static grid as today;
  - add `yapDrawBoardFrame` over it.
- [ ] **Step 2: Home:** `yapDrawPreview` computes its box, as today, and calls the new `yapDrawMiniMap`. Drop its own shadow and frame.
- [ ] **Step 3:** Run the gate. Expect PASS; no unit test covers Phaser drawing (slice 2, Ruling 1).
- [ ] **Step 4: Screenshot** T1 and D7 planning, and Home during the week, at 390×844 @3 and 360×640 @2, with a throwaway script.
  - Expect: hatching only on walls, seams only between floor cells, the ink edge on every floor/wall side, and the double frame crisp.
- [ ] **Step 5:** Commit `[C1] The board as a plan sheet: paper floor, hatched walls, double frame`.

### Task 5: Tokens on the board, the Kenney sprites retired

**Files:**
- Modify: `src/game/render.ts` (cone, laser, thief, guard, camera, diamond, exit and start functions), `src/game/level-scene.ts` (`preload`, `yapDrawState`, `yapRedrawGhost`, `yapDrawGuardMarker` removed)

**Interfaces:**
- Every entity function takes a last argument `look: YapLook = 'ink'`, where `type YapLook = 'ink' | 'pencil'`.
  - `pencil` draws every stroke and fill in `graphite`, with outlines dashed through `yapDashes(…, 3, 3)`. The caller sets the Graphics alpha to `YAP_PENCIL_ALPHA`.
- `yapDrawCone(g, layout, cells, kind: 'guard' | 'camera' | 'stamp', look?)`:
  - the tint at the kind's alpha (stamp: `stamp` at 0.24);
  - a 1.5 px outline per cell (`guard-cone-edge`, `camera-cone` or `stamp`).
- `yapDrawGuard(g, layout, at, facing, look?)`:
  - a `guard-token` disc of radius 0.28·cell, stroked 1.5 px in `guard-token-ink`;
  - a vector "G" in `guard-token-ink`: an arc from 40° to 330°, stroke `max(1.5, 0.05·cell)`, plus a bar from the centre to the arc's end;
  - a filled facing wedge in `guard-token-ink`, its base 0.06·cell outside the circle and its tip at 0.46·cell.
  - It replaces the scene's private marker and the Kenney guard.
- `yapDrawCamera(g, layout, level, at, facing, look?)`: a paper box of 0.44·cell with a 1.5 px ink outline at `yapCameraAnchor(...).centre`, and a `camera-cone` lens dot of radius 0.09·cell at `lens`.
- `yapDrawLaser(g, layout, level, cells, active, look?)`:
  - active: the cell tint `stamp` at 0.12, the beam from `yapLaserBeam` 2.5 px in `stamp`, and emitter nubs (filled `stamp` squares, 0.12·cell) at both ends;
  - inactive: the beam as `yapDashes(…, 4, 4)` in `laser-off`, 1.5 px;
  - the on/off tick at the emitter stays as today.
- `yapDrawThief(g, layout, at, look?)`:
  - a `thief-token` disc of radius 0.3·cell with a 2.5 px `paper` ring;
  - a `paper` mask band across the upper third, with two `thief-token` eye dots.
  - It replaces the Kenney thief.
- `yapDrawDiamond(g, layout, at, look?)`: a lozenge of radius 0.27·cell, filled `diamond-fill`, stroked 1.5 px `diamond-edge`, with two facet lines (top vertex to the mid-left and mid-right of the girdle, plus the girdle).
- `yapDrawExit(g, layout, level, at, look?)`, on the `yapDoorSide` edge:
  - a dashed threshold (`yapDashes`, 3/3) along that edge;
  - a leaf (a 2 px line from the hinge corner, 0.8·cell long, perpendicular to the edge);
  - the quarter-circle swing (1 px arc) from the leaf's tip back to the edge;
  - all in `exit-door`.
- `yapDrawStart(g, layout, at)`: a 1 px dashed ink-muted ring of radius 0.42·cell.

- [ ] **Step 1: Level scene:**
  - `preload` no longer loads `yap-thief` and `yap-guard`;
  - `yapDrawState` draws cones, lasers, exit, diamond, start, cameras, guards and the thief through `render.ts`; no `this.add.image` is left;
  - `yapRedrawGhost` draws the same with `look: 'pencil'` and `setAlpha(YAP_PENCIL_ALPHA)`;
  - X3's preview keeps drawing the ink look at `YAP_GHOST_ALPHA`.
- [ ] **Step 2:** Run the gate and both e2e specs. Expect PASS.
- [ ] **Step 3: Screenshot** at both sizes: T5 planning (border camera on the frame, lens inward), D5 (active and inactive laser), D7 (two guards, cones over the route), and a stroke with the ghost visible.
  - Expect: the thief is visible over a cone; danger reads by shape and outline in a grayscale copy (convert with `sips -s format png --setProperty formatOptions 0 …` or any grey filter).
- [ ] **Step 4:** Commit `[C1] Plan tokens: G guards, boxed cameras, beam lasers, masked thief, door symbol`.

### Task 6: Route, pauses, failure, hint and the friend's plan

**Files:**
- Modify: `src/game/level-scene.ts` (`yapRedrawPath`, the execution tick, `yapRedrawMarks`, `yapDrawFatalMarker`, `yapRedrawHint`), `src/game/challenge-scene.ts` (the friend's route), `src/game/render.ts`

**Interfaces:**
- New `yapDrawRoute(g, layout, cells, width, color, walked?: number)` in `render.ts`: round caps and joins (a circle at each vertex).
  - With `walked` set, cells `0..walked` are at alpha 1 and the rest at `YAP_ROUTE_UNWALKED_ALPHA`.
- New `yapDrawPauseBadge(g, at: YapPoint, width, height)`: a paper pill with a 1.5 px `marker` outline and two `marker` bars. The scene adds the count beside it as a `yapRoleText(…, 'stat', marker)`.

- [ ] **Step 1: Route:**
  - `yapRedrawPath` draws `yapDrawRoute(…, YAP_ROUTE_WIDTH, marker)`.
  - During the playback, the execution tick passes `walked = yapWalkedSteps(plan, tick)` and redraws the path. It is static per tick, so there is nothing to disable under reduced motion.
  - The planning view, failure and win draw it unfaded.
- [ ] **Step 2: Pause badges** through `yapDrawPauseBadge` and the stat count, replacing the `⏸ n` rectangles.
- [ ] **Step 3: Failure:**
  - `yapRedrawMarks` draws the detector's seen cells with `yapDrawCone(…, 'stamp')`;
  - the fatal marker is a 3 px `stamp` outline on the fatal cell's rect, a ring of radius 0.42·cell, and the X, all in `stamp`.
- [ ] **Step 4: Hint:**
  - graphite dots (the existing dot rhythm) in place of `action-primary`;
  - the badge is a paper pill with a 1.5 px graphite outline and its text in graphite through `yapRoleText(…, 'stat', graphite)`.
- [ ] **Step 5: Friend's plan** (`challenge-scene.ts`): `yapDrawRoute(…, YAP_FRIEND_ROUTE_WIDTH, ink)` replaces the outline-and-core passes.
- [ ] **Step 6:** Run the gate and both e2e specs. Expect PASS.
- [ ] **Step 7: Screenshot** at both sizes:
  - T1 route with pauses;
  - mid-playback (the walked part solid, the rest faint);
  - T2 failure;
  - a hint shown (seed three failures, or use the e2e hint flow if one exists);
  - the friend's plan.
- [ ] **Step 8:** Commit `[C1] Marker route that fades behind the thief, stamp failure, pencil hint`.

### Task 7: Record the board and verify the slice

**Files:**
- Modify: `src/game/board.ts` (unused tokens), `tests/unit/board.test.ts`, `docs/UI-DESIGN.md`, `tasks/C1.md`

- [ ] **Step 1: Cleanup.** Remove every `YAP_PALETTE` key and constant that no file under `src/` or `tools/` reads any more. Check each with `grep -rn "'<key>'" src tools`. Delete its tests or move them to the new tokens.
- [ ] **Step 2: `docs/UI-DESIGN.md`:**
  - in the "Plan style kit" bullets, add the board: thin frame, hatching, tokens, route, pencil;
  - replace the cone line's "about 30% / 2 px" with the §7 values (0.24/0.18 tint, 1.5 px outline).
  - The full rewrite is slice 5.
- [ ] **Step 3: `tasks/C1.md`:** pass-3 status `3/6 board plan in review`, and list `src/game/plan-geometry.ts` and `tests/unit/plan-geometry.test.ts` in the ownership.
- [ ] **Step 4: Full gate and both e2e specs.** All green; `levels.json` and `public/icons` unchanged.
- [ ] **Step 5: Screenshot review** at 390×844 @3 and 360×640 @2, EN and FR:
  - T1 and D5 planning, execution, failure, back to the plan;
  - win (tutorial and daily);
  - Home with its mini-map;
  - the friend's plan;
  - ghost and hint;
  - a grayscale copy of D5 and D7.
  - Check that nothing overlaps or clips, that cones are exact cells, that danger reads in grey, and that the thief stays visible over cones.
- [ ] **Step 6:** Commit `[C1] Record the board plan; slice 3 in review`.
