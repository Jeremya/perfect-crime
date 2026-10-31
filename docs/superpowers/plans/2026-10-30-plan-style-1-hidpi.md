# Plan style 1/6 — Crisp HiDPI rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the whole game at the device pixel ratio so that text, lines and
shapes on a phone are as sharp as the browser's own text.

**Architecture:** Phaser runs in Scale mode `NONE` with a game size in device
pixels (CSS size × DPR) and a Scale zoom of `1/DPR`, so the canvas backing store
has one pixel per device pixel while it is displayed at CSS size. Scenes keep
laying out in CSS px: each scene zooms its cameras by DPR around the CSS view
centre, reads its size through `yapViewSize`, converts pointers through its main
camera, bakes static textures at DPR, and creates every Text through one factory
that sets `resolution = DPR` and the system font stack. A spike on `main`
(390×844 @3) validated this: canvas 1170×2532, drawing, win, failure zoom and
consent taps all work, and the header crop matches DOM text.

**Tech Stack:** TypeScript (strict), Phaser 4.2.1, Vite, Vitest (node env,
`tests/**/*.test.ts`), Playwright 1.64 (manual e2e, `tests/e2e/*.spec.ts`).

**Spec:** `docs/design/2026-10-30-plan-style-design.md` — §6 "Rendering
foundations", §12 first bullet (density acceptance), §13 step 1.

## Global Constraints

- DPR is capped at 3 and read once at boot (spec §6).
- System fonts only. Serif stack, verbatim: `ui-serif, "New York", Georgia,
  "Times New Roman", serif`. Mono stack, verbatim: `ui-monospace, "SF Mono",
  Menlo, Consolas, "Roboto Mono", monospace`.
- Every layout coordinate stays in CSS px; no scene logic works in device pixels.
- No new runtime dependency; `src/core/` untouched; `Yap` prefix on new types;
  displayed text unchanged.
- Phaser runtime is never imported by a unit-tested module: use
  `import type Phaser from 'phaser'` in `hidpi.ts` and `text.ts`, because Vitest
  runs in node.
- Full local check before pushing: `npm run typecheck && npm run lint && npm run
  test && npm run validate && npm run build`. If the build rewrites
  `public/icons/og-*.png`, restore them with `git checkout public/icons`.
  `levels/levels.json` must stay unchanged.

## Review Focus

- **Resize or rotation mid-game**, including during the failure replay: the
  canvas follows at CSS × DPR, nothing throws, play continues. Pinned in Task 3
  by `follows a resize, also during the failure replay`.
- **Taps on an overlay scene at 3×** (the consent banner): the tap lands on the
  button under the finger. Pinned in Task 3 by `answers the consent banner at
  3x`.
- **DPR 1 desktop** must look and play exactly as before. Pinned in Task 3 by
  the 1280×800 @1 case of `backs the canvas with device pixels` and by the
  unchanged `share.spec.ts` (DPR 1 contexts).
- **A future text created outside the factory** would silently render at 1×.
  Pinned in Task 4 by the source guards `no Text is created outside yapText`
  and `no font family outside text.ts`.
- **A static texture baked at 1×** would make the board grid blurry again.
  Pinned in Task 3 by the source guard `bakes textures only through
  yapBakeTexture`.

---

### Task 1: Device-pixel helpers

**Files:**
- Create: `src/game/hidpi.ts`
- Test: `tests/unit/hidpi.test.ts`

**Interfaces:**
- Produces:
  - `YAP_MAX_DPR = 3`.
  - `yapDevicePixelRatio(raw: number | undefined): number`: 1 for undefined,
    NaN, non-finite or < 1; otherwise `Math.min(raw, 3)`.
  - `YAP_DPR: number`, equal to
    `yapDevicePixelRatio(globalThis.devicePixelRatio)`, so 1 in node.
  - `yapDeviceSize(cssWidth: number, cssHeight: number, dpr: number): {
    width: number; height: number }`, using `Math.round` of css × dpr.
  - `yapCssSize(deviceWidth: number, deviceHeight: number, dpr: number): {
    width: number; height: number }`, an exact division.

- [ ] **Step 1: Write the failing tests** in `tests/unit/hidpi.test.ts`:
  - `clamps the device pixel ratio to [1, 3]`:
    - `undefined`, `NaN`, `Infinity`, `0`, `0.5` → `1`;
    - `1` → `1`, `2` → `2`, `2.625` → `2.625`, `3` → `3`, `4` → `3`.
  - `sizes the backing store in device pixels`:
    - `yapDeviceSize(390, 844, 3)` → `{ width: 1170, height: 2532 }`;
    - `(360, 640, 2)` → `{ 720, 1280 }`;
    - `(393, 852, 2.75)` → `{ 1081, 2343 }`.
  - `maps device pixels back to CSS pixels`: `yapCssSize(1170, 2532, 3)` →
    `{ 390, 844 }`.
  - `defaults to 1 outside a browser`: `YAP_DPR === 1`.
- [ ] **Step 2: Run them** — `npx vitest run tests/unit/hidpi.test.ts`.
  Expected: FAIL, module `../../src/game/hidpi` not found.
- [ ] **Step 3: Implement the five exports** in `src/game/hidpi.ts`. Start the
  file with a header comment naming "C1 visual pass 3 — crisp HiDPI rendering".
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/game/hidpi.ts tests/unit/hidpi.test.ts`
  then `git commit -m "[C1] HiDPI helpers: device pixel ratio and sizes"`.

### Task 2: Text factory

**Files:**
- Create: `src/game/text.ts`
- Test: `tests/unit/text.test.ts`

**Interfaces:**
- Consumes: `YAP_DPR` (Task 1).
- Produces:
  - `type YapFontFamily = 'ui' | 'serif' | 'mono'`.
  - `YAP_FONT_STACKS: Readonly<Record<YapFontFamily, string>>`, where:
    - `ui` = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica
      Neue", system-ui, sans-serif`. This is the transitional face for today's
      sans text, so iPhones show San Francisco instead of Helvetica. Later passes
      move roles to serif and mono.
    - `serif` and `mono` are exactly the Global Constraints stacks.
  - `interface YapTextExtra extends Omit<Phaser.Types.GameObjects.Text.TextStyle,
    'fontFamily' | 'fontSize' | 'color' | 'resolution'> { family?: YapFontFamily }`.
  - `yapTextStyle(size: number, color: string, extra?: YapTextExtra):
    Phaser.Types.GameObjects.Text.TextStyle`, returning
    `{ ...rest, fontFamily: YAP_FONT_STACKS[family ?? 'ui'], fontSize:
    `${size}px`, color, resolution: YAP_DPR }`.
  - `yapText(scene: Phaser.Scene, x: number, y: number, content: string |
    string[], style: Phaser.Types.GameObjects.Text.TextStyle):
    Phaser.GameObjects.Text`, which returns `scene.add.text(x, y, content, {
    ...style, resolution: YAP_DPR })`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/text.test.ts`:
  - `pins the three system font stacks`: `YAP_FONT_STACKS` equals the three
    exact strings above.
  - `builds a style at the device resolution`: `yapTextStyle(16, '#202A33')`
    equals `{ fontFamily: YAP_FONT_STACKS.ui, fontSize: '16px', color:
    '#202A33', resolution: 1 }`.
  - `passes extra style through and picks the family`:
    `yapTextStyle(14, '#000', { family: 'mono', fontStyle: 'bold', align:
    'center', wordWrap: { width: 200 } })` has the mono stack, `fontStyle:
    'bold'`, `align: 'center'`, `wordWrap: { width: 200 }`, and no `family` key.
  - `creates text through the scene with the device resolution`: a fake scene
    `{ add: { text: vi.fn((x, y, c, s) => ({ x, y, c, s })) } }` given `yapText(
    fake, 4, 5, 'Hi', { color: '#111', resolution: 7 })` is called once with
    `(4, 5, 'Hi', { color: '#111', resolution: 1 })`.
- [ ] **Step 2: Run them** — `npx vitest run tests/unit/text.test.ts`.
  Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/game/text.ts`, using
  `import type Phaser from 'phaser'` only.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/game/text.ts tests/unit/text.test.ts`
  then `git commit -m "[C1] Text factory: system font stacks at device resolution"`.

### Task 3: Device-pixel canvas in every scene

**Files:**
- Modify:
  - `src/game/hidpi.ts` (Phaser-facing helpers);
  - `src/main.ts` (scale config, resize);
  - `src/game/level-scene.ts`, `src/game/home-scene.ts`,
    `src/game/challenge-scene.ts`, `src/game/consent-scene.ts`,
    `src/game/viewer-scene.ts`.
- Create: `tests/e2e/support.ts`, `tests/e2e/hidpi.spec.ts`,
  `tests/unit/hidpi-guard.test.ts`.

**Interfaces:**
- Consumes: Task 1 exports.
- Produces, in `hidpi.ts` (type-only Phaser import):
  - `yapViewSize(scene: Phaser.Scene): { width: number; height: number }`,
    equal to `yapCssSize(scene.scale.width, scene.scale.height, YAP_DPR)`.
  - `yapDeviceViewport(scene: Phaser.Scene): { width: number; height: number }`,
    which returns `scene.scale.width/height` (device pixels). It is only for
    camera viewports.
  - `yapFitCamera(scene: Phaser.Scene, camera = scene.cameras.main): void` sets
    zoom `YAP_DPR` and centres on the CSS view centre. Keep the default camera
    origin: with origin 0.5 Phaser's `centerOn` maps the CSS view exactly onto
    the device viewport.
  - `yapPointerView(scene: Phaser.Scene, pointer: Phaser.Input.Pointer): {
    x: number; y: number }`, from `scene.cameras.main.getWorldPoint(pointer.x,
    pointer.y)`.
  - `yapBakeTexture(scene: Phaser.Scene, key: string, cssWidth: number,
    cssHeight: number, draw: (g: Phaser.GameObjects.Graphics) => void): void`:
    1. create a graphics object with `scene.make.graphics({ x: 0, y: 0 }, false)`;
    2. call `scaleCanvas(YAP_DPR, YAP_DPR)` on it;
    3. call `draw(g)`;
    4. remove any existing texture with that key;
    5. `generateTexture(key, Math.ceil(cssWidth * YAP_DPR), Math.ceil(cssHeight
       * YAP_DPR))`;
    6. destroy the graphics object.
  - `yapBakedImage(scene: Phaser.Scene, x: number, y: number, key: string):
    Phaser.GameObjects.Image`, which adds the image with origin 0 and scale
    `1 / YAP_DPR`.
  - `yapInstallResize(game: Phaser.Game, frame: HTMLElement): void`, a window
    `resize` listener calling `game.scale.resize(...)` with the device size of
    the frame's client size.

- [ ] **Step 1: Write the failing source guards** in
  `tests/unit/hidpi-guard.test.ts`. They read every `src/game/*.ts` file plus
  `src/main.ts`:
  - `reads the view size only through yapViewSize`: no match of
    `/this\.scale\.(width|height)\b/` outside `hidpi.ts`.
  - `converts pointers only through yapPointerView`: no match of
    `/\bpointer\.(x|y)\b/` outside `hidpi.ts`.
  - `bakes textures only through yapBakeTexture`: no `generateTexture(`
    outside `hidpi.ts`.
  - `keeps the canvas in device pixels`: `src/main.ts` contains
    `Phaser.Scale.NONE` and no `Phaser.Scale.RESIZE`.
- [ ] **Step 2: Write the failing e2e spec** `tests/e2e/hidpi.spec.ts`.

  The helpers go in `tests/e2e/support.ts`:
  - a static server for `dist/`, like the one in `share.spec.ts`;
  - `yapWaitPhase(page, phase)` on `window.__yapPhase`;
  - `yapPlanCells(level, plan)`;
  - `yapDraw(page, level, cells)` with `page.mouse` along
    `yapCellCenter(yapComputeLayout(cssW, cssH, 8, 12))`;
  - `yapPressPlay(page)` at `(viewWidth / 2 + 42, viewHeight - 30)`;
  - `yapSeedStorage(context, entries)` via `addInitScript`.

  The tests (a mobile context means `isMobile: true, hasTouch: true` and the
  iPhone UA of `share.spec.ts`):
  - `backs the canvas with device pixels`:
    - 390×844 @3 gives `canvas.width/height` 1170×2532 and client 390×844;
    - 360×640 @2 gives 720×1280;
    - desktop 1280×800 @1 gives 480×800.
  - `draws a winning route at 3x`: with consent refused, draw the T1 solver
    plan and press PLAY; `__yapPhase` becomes `win`.
  - `replays a failure and returns to the plan at 3x`:
    1. seed `yapcorp:levels` to `{"cleared":["tutorial/t1"],"done":false}` so
       the game boots on T2;
    2. draw (1,1)…(1,6), (2,6), (3,6), (3,7), (3,8), (4,8), (5,8), (5,9),
       (5,10) and press PLAY; the phase becomes `failure`;
    3. tap the screen centre; the phase becomes `planning`.
  - `follows a resize, also during the failure replay`:
    1. at @3, resize the page to 360×640; the canvas becomes 1080×1920;
    2. reach `failure` again and resize back to 390×844;
    3. there is no `pageerror`, and a tap brings back `planning`.
  - `answers the consent banner at 3x`: with fresh storage, tap
    `(viewWidth - 36, 32)` (the OK button: `YAP_BANNER_GAP` 8 +
    `YAP_ACCEPT_WIDTH` 56 / 2); `localStorage['yapcorp:consent']` becomes
    `'granted'`. Phase 4 moves this banner, so that pass updates this test.
- [ ] **Step 3: Run the unit guards to see them fail** —
  `npx vitest run tests/unit/hidpi-guard.test.ts`. Expected: FAIL, listing the
  current call sites.
- [ ] **Step 4: Run the e2e spec to see it fail** — `npm run build && npx
  playwright test tests/e2e/hidpi.spec.ts`. Expected: FAIL on the
  canvas-size cases (390×844 backing at @3).
- [ ] **Step 5: Implement the Phaser-facing helpers** listed under
  Interfaces in `src/game/hidpi.ts`.
- [ ] **Step 6: Switch `src/main.ts` to device pixels**:
  - `scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH,
    ...yapDeviceSize(frame.clientWidth, frame.clientHeight, YAP_DPR), zoom: 1 /
    YAP_DPR }`, falling back to 480×853 when `#game` is missing;
  - after `new Phaser.Game(config)`, call `yapInstallResize(game, frame)`.
- [ ] **Step 7: Fit cameras and read sizes in CSS px in every scene.**
  - Call `yapFitCamera(this)` at the start of each scene's build path, so it
    runs on create and on every `RESIZE`. In `level-scene.ts`, call it only
    when no failure replay is active.
  - Replace every `this.scale.width/height` read with `yapViewSize(this)`.
    This covers the layout inputs, the `yapPlayRow` fallback, the Home toast
    position and the viewer bars.
- [ ] **Step 8: Convert pointers in `level-scene.ts`**: the 4
  `pointer.x/pointer.y` reads in the down, move and up handlers use
  `yapPointerView(this, pointer)`.
- [ ] **Step 9: Make the failure zoom DPR-aware in `level-scene.ts`**:
  - main camera viewport `(0, YAP_TOP_BAR_HEIGHT, viewWidth, viewHeight − top −
    bottom)` multiplied by `YAP_DPR`;
  - zoom `replay.yapZoomFactor(layout) * YAP_DPR`;
  - bounds and `centerOn` unchanged;
  - UI camera created and sized at `viewWidth/viewHeight × YAP_DPR`, then
    `yapFitCamera(this, ui)`;
  - `yapResetCamera` sets a full device viewport from
    `yapDeviceViewport(this)`, then calls `yapFitCamera(this, cam)`.
- [ ] **Step 10: Bake the static grids at DPR.** In `level-scene.ts` and
  `viewer-scene.ts`, replace the make-graphics / generateTexture / image
  sequence with `yapBakeTexture(this, KEY, layout.boardWidth,
  layout.boardHeight, (g) => yapDrawStaticGrid(g, level, bakeLayout))` and
  `yapBakedImage(this, layout.originX, layout.originY, KEY)`.

  Also fix the viewer panel: `yapPositionPanel` uses
  `canvas.clientHeight / yapViewSize(this).height` as `ratioY`.
- [ ] **Step 11: Run the guards and the gate** — `npx vitest run` and then
  `npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 12: Run the e2e specs** — `npm run build && npx playwright test
  tests/e2e/hidpi.spec.ts tests/e2e/share.spec.ts`. Expected: all PASS, with
  `share.spec.ts` unchanged.
- [ ] **Step 13: Commit**: `git add src tests && git commit -m "[C1] Render
  the canvas in device pixels in every scene"`.

### Task 4: Every text through the factory

**Files:**
- Modify: `src/game/level-scene.ts` (11 font-family sites, 2 local
  `textStyle` helpers), `src/game/home-scene.ts` (6 sites, 1 helper),
  `src/game/challenge-scene.ts` (3 sites, 1 helper),
  `src/game/viewer-scene.ts` (6 sites, 1 helper),
  `src/game/consent-scene.ts` (2 sites).
- Create: `tests/unit/text-guard.test.ts`

**Interfaces:**
- Consumes: `yapTextStyle`, `yapText`, `YapTextExtra` (Task 2).

- [ ] **Step 1: Write the failing guards** in `tests/unit/text-guard.test.ts`,
  over `src/game/*.ts`:
  - `no font family outside text.ts`: no match of `/fontFamily\s*:/` outside
    `text.ts`.
  - `no Text is created outside yapText`: no match of `/\badd\s*\.\s*text\s*\(/`
    outside `text.ts` (the regex spans the `this.add\n  .text(` line breaks).
- [ ] **Step 2: Run them** — `npx vitest run tests/unit/text-guard.test.ts`.
  Expected: FAIL, listing 28 font-family sites and every `add.text`.
- [ ] **Step 3: Migrate each scene.**
  - The local `textStyle(...)` helpers return `yapTextStyle(size, color, {
    ...their extras })`. Inline styles become `yapTextStyle(...)`, keeping
    sizes, colours, weights, alignment, wrap widths, padding and backgrounds
    exactly as today.
  - Every `this.add.text(x, y, c, s)` becomes `yapText(this, x, y, c, s)`.
  - Existing `setFontSize(18).setFontStyle('bold')` calls stay as they are:
    they keep the resolution.
- [ ] **Step 4: Run the whole unit suite and the gate** — `npm run typecheck
  && npm run lint && npm run test`. Expected: PASS.
- [ ] **Step 5: Check sharpness by eye.**
  1. Run `npm run build`, then re-run the e2e specs (all PASS).
  2. Capture a 200×60 CSS-px crop of the planning header at 390×844 @3 (with
     `page.screenshot({ clip })`).
  3. Compare it with the same text in a DOM element at the same spot. The glyph
     edges must look equally crisp.
  4. Save both crops for the PR.
- [ ] **Step 6: Commit** — `git add src tests && git commit -m "[C1] Create
  every text at device resolution with the system font stack"`.

### Task 5: Record the rule and open the PR

**Files:**
- Modify: `docs/UI-DESIGN.md` (section "Layout and interaction"),
  `tasks/C1.md` (status line).

- [ ] **Step 1: Add a "Rendering density" rule to `docs/UI-DESIGN.md`**,
  three lines:
  - the canvas renders at the device pixel ratio, capped at 3;
  - scenes lay out in CSS px through `yapViewSize`;
  - texts are created with `yapText`/`yapTextStyle` and textures baked with
    `yapBakeTexture`, as enforced by the source guards.
- [ ] **Step 2: Update `tasks/C1.md`** to "Visual pass 3 (plan style, spec
  `docs/design/2026-10-30-plan-style-design.md`): 1/6 crisp rendering in PR".
- [ ] **Step 3: Run the full gate** — `npm run typecheck && npm run lint &&
  npm run test && npm run validate && npm run build`, then `git status`.
  Expected: all green, `levels/levels.json` unchanged, no stray
  `public/icons` changes.
- [ ] **Step 4: Commit, push and open the PR.**
  - Push branch `c1-plan-style`.
  - Open the PR titled `[C1] Plan style 1/6: crisp HiDPI rendering`.
  - The body covers the design doc and this plan, the before/after crops, the
    canvas sizes per device, and the e2e commands and their results.
  - Note that real-phone checks of sharpness and smoothness are pending.
  - Do not merge.
