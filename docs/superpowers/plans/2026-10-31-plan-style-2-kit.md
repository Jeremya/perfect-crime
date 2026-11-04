# Plan style 2/6 — Paper & ink tokens, type roles and the component kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player-facing screen the "plan d'architecte" chrome:
- a paper page with a faint grid;
- ink headers with a typewriter kicker and a serif title;
- typewriter stats and ink buttons;
- index-card panels and note toasts.

All of it comes from one component kit. The board keeps its current look until slice 3.

**Architecture:**
- New paper/ink tokens join `YAP_PALETTE`.
- Text roles (serif and mono, with sizes, case and tracking) live next to the text factory in `text.ts`.
- A new `src/game/kit.ts` holds the shared components (page, button, header, card, rule, toast). It also holds the pure layout helpers that both the scenes and the e2e specs use.
- The level, Home, challenge and consent scenes replace their four private button helpers and hand-drawn bars with the kit.
- Screen compositions (stamps, folder, seal, ruler, …) are slice 4, and the board renderer is slice 3.

**Tech Stack:** TypeScript (strict), Phaser 4.2.1, Vite, Vitest (node env), Playwright 1.64 (manual e2e).

**Spec:** `docs/design/2026-10-30-plan-style-design.md`. This plan covers §5 (tokens, type, lines and shapes, component kit), the header and footer parts of §8, §10 (kicker and tutorial copy) and §13 step 2.

## Global Constraints

- **Tokens (spec §5), exact:**
  - `paper-page #F2EFE6`, `paper #FCFBF6`, `ink #1E3A5F`, `ink-muted` about `#4E6480`, at least 4.5:1 on paper;
  - disabled primary is "ink at 28%" (on paper that is `#BEC5CC`);
  - the page grid is 20 px at ink 5%.
- **Type (spec §5):**
  - serif `ui-serif, "New York", Georgia, "Times New Roman", serif` for titles and sentences: screen title 27–28 px, card titles 20–26 px, body 15–17 px, italic captions;
  - mono `ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace` for kickers, numbers, stats and buttons, uppercase, tracking 0.12–0.2 em;
  - decorative kickers may be 12 px; everything essential (stats, attempt, countdown, button labels) is ≥ 14 px.
- **Lines and shapes (spec §5):**
  - ink lines 1.5–2 px;
  - buttons have radius 6 px and height 52 px; cards are paper with radius 2–4 px and a hard offset shadow (4,5 px, ink 15%);
  - no glow, no gradients;
  - touch targets ≥ 44 px, and press acknowledgement is 120 ms;
  - nothing animates under `prefers-reduced-motion`.
- **Labels must fit at 360 px:** reduce tracking or wrap to two lines.
- **Rendering density (slice 1):**
  - all text goes through `src/game/text.ts`, and all sizes through `src/game/hidpi.ts` (`yapViewSize`, `yapPointerView`);
  - the existing source guards must stay green, unchanged.
- **Housekeeping:**
  - all displayed text comes from the FR/EN dictionaries, with identical shapes;
  - `Yap` prefix on exported types;
  - no new runtime dependency; `src/core/` untouched.
- **Full gate:** `npm run typecheck && npm run lint && npm run test && npm run validate && npm run build`, then `npx playwright test tests/e2e/hidpi.spec.ts tests/e2e/share.spec.ts`.
  - If the build rewrites `public/icons`, restore it with `git checkout public/icons`.
  - `levels/levels.json` must stay unchanged.
  - Delete `test-results/` before committing.

## Review Focus

- **Long copy at 360 px in French:** "Changing of the Guard", "AMÉLIORER MON SCORE", "TRACE TON CHEMIN" with the Hint slot shown. Nothing may overlap or clip. Pinned in Task 3 by the `yapFitFontSize` and `yapPlanningRow` tests, and in Task 7 by the screenshot review at 360×640 in FR.
- **Share from Home on a phone must open the share sheet,** so it fires on release (`fireOn: 'up'`), like the Win screen. Pinned in Task 5 by `Home Share opens the share sheet` (e2e, clock fixed inside the test week).
- **Tapping PLAY while it is disabled ("Draw your route") must do nothing.** Pinned in Task 4 by `a disabled PLAY ignores taps` (e2e).
- **PLAY must stay where the e2e specs and thumbs expect it.** Its position comes from one layout function. Pinned in Task 4: `yapPressPlay` uses `yapPlanningRow`, and the existing e2e flows must pass.
- **The Hint slot appearing after 3 failures must give PLAY back its width without overlap.** Pinned in Task 3 by the `yapPlanningRow` hint cases.

---

### Task 1: Paper and ink tokens, and the page colour

**Files:**
- Modify: `src/game/board.ts` (`YAP_PALETTE`), `index.html`, `src/main.ts`
- Test: `tests/unit/board.test.ts`, `tests/unit/shell.test.ts`

**Interfaces:**
- Produces new `YAP_PALETTE` keys: `'paper-page': '#F2EFE6'`, `'paper': '#FCFBF6'`, `'ink': '#1E3A5F'`, `'ink-muted': '#4E6480'`, `'ink-disabled': '#BEC5CC'`. Every existing key stays, because the board and the viewer keep them until slice 3.

- [ ] **Step 1: Write the failing tests.** Reuse the contrast helper already in `board.test.ts`. In a new `describe('plan style tokens — paper and ink')`, add:
  - `ink text reads on paper`: contrast(ink, paper) ≥ 4.5 and contrast(ink, paper-page) ≥ 4.5;
  - `muted text reads on paper`: contrast(ink-muted, paper) ≥ 4.5 and contrast(ink-muted, paper-page) ≥ 4.5;
  - `primary labels read in both states`: contrast(paper, ink) ≥ 4.5 and contrast(ink, ink-disabled) ≥ 4.5.

  In `shell.test.ts`, the background and `theme-color` assertions now read `YAP_PALETTE['paper-page']`, not `'surface-page'`.
- [ ] **Step 2: Run them.** `npx vitest run tests/unit/board.test.ts tests/unit/shell.test.ts`: expect FAIL (missing keys, shell still `#F4F2ED`).
- [ ] **Step 3: Add the five keys** to `YAP_PALETTE`, with one comment line each saying the role (spec §5).
- [ ] **Step 4: Switch the page colour.**
  - In `index.html`: `theme-color` becomes `#F2EFE6`, the inline background `#f2efe6`, and the comment names `paper-page`.
  - In `src/main.ts`: the body background and the game `backgroundColor` become `YAP_PALETTE['paper-page']` (import it).
- [ ] **Step 5: Run the gate's unit part.** `npm run typecheck && npm run lint && npm run test`: expect PASS.
- [ ] **Step 6: Commit** `[C1] Plan style tokens: paper, ink and the page colour`.

### Task 2: Text roles

**Files:**
- Modify: `src/game/text.ts`
- Test: `tests/unit/text.test.ts`

**Interfaces:**
- Consumes: `yapTextStyle`, `yapText`, `YAP_FONT_STACKS`, `YapFontFamily` (slice 1).
- Produces:
  - `type YapTextRole = 'screenTitle' | 'cardTitle' | 'body' | 'caption' | 'kicker' | 'stat' | 'statLarge' | 'button' | 'buttonPrimary'`.
  - `interface YapTextRoleSpec { readonly family: YapFontFamily; readonly size: number; readonly bold?: boolean; readonly italic?: boolean; readonly upper?: boolean; readonly tracking?: number }`. `tracking` is in em.
  - `YAP_TEXT_ROLES: Readonly<Record<YapTextRole, YapTextRoleSpec>>`, exactly:

    | Role | Family | Size | Style | Case | Tracking |
    |---|---|---|---|---|---|
    | screenTitle | serif | 27 | | | |
    | cardTitle | serif | 22 | | | |
    | body | serif | 16 | | | |
    | caption | serif | 15 | italic | | |
    | kicker | mono | 12 | | upper | 0.12 |
    | stat | mono | 14 | | upper | 0.06 |
    | statLarge | mono | 22 | bold | | |
    | button | mono | 14 | | upper | 0.14 |
    | buttonPrimary | mono | 15 | bold | upper | 0.18 |
  - `yapRoleStyle(role: YapTextRole, color: string, extra?: YapTextExtra): Phaser.Types.GameObjects.Text.TextStyle`. It calls `yapTextStyle` with the role's size and family, and `fontStyle` `'bold'`, `'italic'` or `'bold italic'`.
  - `yapRoleText(scene: Phaser.Scene, x: number, y: number, content: string, role: YapTextRole, color: string, extra?: YapTextExtra): Phaser.GameObjects.Text`.
    - It creates through `yapText`.
    - It uppercases the content with `toLocaleUpperCase()` when `upper`.
    - It calls `setLetterSpacing(size × tracking)`, rounded to 0.1 px, when `tracking` is set.
  - `yapRoleTracking(role: YapTextRole): number`, the letter spacing in px (0 when none).

- [ ] **Step 1: Write the failing tests.**
  - `pins the role table`: `YAP_TEXT_ROLES` equals the table above.
  - `role styles pick family, size and style`:
    - `yapRoleStyle('caption', '#111')` has `fontFamily` = serif stack, `fontSize: '15px'` and `fontStyle: 'italic'`;
    - `yapRoleStyle('buttonPrimary', '#111')` has the mono stack, `'15px'` and `fontStyle: 'bold'`.
  - `role text uppercases and tracks`: a fake scene whose `add.text` returns `{ setLetterSpacing: vi.fn().mockReturnThis(), … }`. `yapRoleText(fake, 0, 0, 'Casse nº 5', 'kicker', '#111')` creates `'CASSE Nº 5'` and calls `setLetterSpacing(1.4)` (12 × 0.12 = 1.44, rounded to 0.1).
  - `serif roles keep case and spacing`: `yapRoleText(fake, …, 'Le plan', 'screenTitle', …)` keeps `'Le plan'` and never calls `setLetterSpacing`.
- [ ] **Step 2: Run them.** `npx vitest run tests/unit/text.test.ts`: expect FAIL.
- [ ] **Step 3: Implement** the exports in `src/game/text.ts`, with the Phaser import type-only.
- [ ] **Step 4: Run them.** Expect PASS. Also run `npx vitest run tests/unit/text-guard.test.ts tests/unit/dpr-wiring.test.ts`: PASS.
- [ ] **Step 5: Commit** `[C1] Text roles: serif titles, typewriter kickers, stats and buttons`.

### Task 3: The component kit

**Files:**
- Create: `src/game/kit.ts`
- Test: `tests/unit/kit.test.ts`

**Interfaces:**
- Consumes:
  - `YAP_PALETTE` (Task 1);
  - `yapRoleText`, `yapRoleStyle`, `yapRoleTracking` (Task 2);
  - `YAP_UI_TAP_EVENT` (`src/game/sound.ts`);
  - `yapPrefersReducedMotion` or the equivalent export of `src/game/motion.ts` (use the existing name);
  - `YAP_TOP_BAR_HEIGHT` (`src/game/board.ts`).
- Produces pure helpers (unit-tested):
  - `interface YapSlot { readonly width?: number }`: absent means the slot shares the remaining width.
  - `yapActionRow(viewWidth: number, slots: readonly YapSlot[], margin = 16, gap = 8): readonly YapBox[]`, where `YapBox = { readonly x: number; readonly width: number }`. Fixed slots keep their width; fill slots split the rest equally.
  - `YAP_ROW_FROM_BOTTOM = 38`: centre y of a bottom action row, measured from the view's bottom (52 px button, 12 px margin).
  - `YAP_PLANNING_CLEAR_WIDTH = 104`, `YAP_PLANNING_HINT_WIDTH = 96`.
  - `yapPlanningRow(viewWidth: number, hasHint: boolean): { readonly clear: YapBox; readonly hint: YapBox | null; readonly play: YapBox }`, built on `yapActionRow`.
  - `yapFitFontSize(measure: (size: number) => number, maxSize: number, minSize: number, available: number): number`: the largest integer size in [min, max] whose measure fits `available`, otherwise `minSize`.
- Produces Phaser components (type-only Phaser import; built through `scene.add` and the text roles):
  - `yapPaperPage(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Graphics`. It sets the main camera background to `paper-page` and draws the 20 px grid in ink at alpha 0.05 (`YAP_PAGE_GRID = 20`, `YAP_PAGE_GRID_ALPHA = 0.05`). The caller puts it at the back of its root container.
  - Button:
    - `interface YapButtonOptions { x: number; y: number; width: number; height?: number; label: string; kind: 'primary' | 'secondary'; enabled?: boolean; fireOn?: 'down' | 'up'; onPress: () => void }`. Defaults: height 52, enabled true, fireOn `'down'`.
    - `interface YapButton { readonly container: Phaser.GameObjects.Container; setLabel(label: string): void; setEnabled(enabled: boolean): void; setBox(x: number, width: number): void }`.
    - `yapButton(scene: Phaser.Scene, options: YapButtonOptions): YapButton`.
    - Drawing: radius 6. Primary is filled `ink` with a `paper` label in role `buttonPrimary`; disabled primary is filled `ink-disabled` with an `ink` label. Secondary is filled `paper` with a 1.5 px `ink` outline and an `ink` label in role `button`.
    - Firing emits `YAP_UI_TAP_EVENT` on `scene.events`, then calls `onPress` only when enabled.
    - A press acknowledgement scales the container to 0.97 and back over 120 ms, except under reduced motion.
    - When the label is wider than `width − 24`, drop the tracking. If it is still too wide, wrap to `width − 16`, centred.
  - Header:
    - `interface YapHeaderOptions { kicker: string; title: string; right?: readonly string[]; rightLarge?: boolean }`.
    - `interface YapHeader { readonly container: Phaser.GameObjects.Container; setRight(lines: readonly string[]): void }`.
    - `yapHeader(scene: Phaser.Scene, width: number, options: YapHeaderOptions): YapHeader`.
    - Layout:
      - the band is `YAP_TOP_BAR_HEIGHT` tall with no fill (the page shows);
      - kicker (`kicker` role, `ink-muted`) at (16, 10);
      - title (`screenTitle` role, `ink`) at (16, 26), its size fitted by `yapFitFontSize` between 27 and 18 to the width left of the right block;
      - right lines (`stat` role, `ink`; the last line in `statLarge` when `rightLarge`) right-aligned at `width − 16`, stacked from y = 12;
      - a 1 px ink rule at alpha 0.16 on the band's bottom edge.
  - `yapCard(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Graphics`: a hard shadow (+4, +5) in ink at 0.15, a `paper` fill and a 1.5 px `ink` border, radius 3.
  - `yapRule(scene: Phaser.Scene, x1: number, x2: number, y: number, alpha?: number): Phaser.GameObjects.Graphics`: a 1 px ink hairline, alpha 0.16 by default.
  - `yapShowToast(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, message: string): void`.
    - A note: `paper` fill, 1.5 px `ink` border, the card shadow, `body` role text in `ink`, padding 12×8, anchored bottom-centre at (x, y).
    - It fades in over 120 ms, holds 1400 ms, fades out over 200 ms, then is destroyed. Under reduced motion it appears and disappears without fading.

- [ ] **Step 1: Write the failing tests** (pure helpers only):
  - `shares the free width between fill slots`:
    - `yapActionRow(390, [{ width: 104 }, {}])` → `[{ x: 16, width: 104 }, { x: 128, width: 246 }]`;
    - `yapActionRow(390, [{ width: 104 }, { width: 96 }, {}])` → `[{16,104},{128,96},{232,142}]`;
    - `yapActionRow(360, [{}, {}])` → `[{16,160},{184,160}]`;
    - `yapActionRow(390, [{}])` → `[{16,358}]`.
  - `lays out the planning row with and without the hint`:
    - at 390: `yapPlanningRow(390, false)` gives clear `{16,104}`, hint `null`, play `{128,246}`, and `yapPlanningRow(390, true).play` → `{232,142}`;
    - at 360 with the hint, `play.width` is 112 and every box is ≥ 44 wide.
  - `fits the largest size that fits`: with `measure = (s) => s * 10`:
    - `yapFitFontSize(measure, 27, 18, 230)` → 23;
    - `(…, 400)` → 27;
    - `(…, 100)` → 18.
- [ ] **Step 2: Run them.** `npx vitest run tests/unit/kit.test.ts`: expect FAIL (module missing).
- [ ] **Step 3: Implement** `src/game/kit.ts`: the pure helpers first, then the components. Keep `import type Phaser` only; components create objects through `scene.add`, the text roles and `yapText`.
- [ ] **Step 4: Run them** plus the guards: `npx vitest run tests/unit/kit.test.ts tests/unit/hidpi-guard.test.ts tests/unit/text-guard.test.ts`: PASS.
- [ ] **Step 5: Commit** `[C1] Component kit: page, button, header, card, rule, toast`.

### Task 4: Level scene chrome through the kit

**Files:**
- Modify: `src/game/level-scene.ts`, `src/app/i18n/en.ts`, `src/app/i18n/fr.ts`, `tests/e2e/support.ts`, `tests/e2e/hidpi.spec.ts`

**Interfaces:**
- Consumes:
  - Task 3: `yapPaperPage`, `yapButton`, `YapButton`, `yapHeader`, `YapHeader`, `yapCard`, `yapRule`, `yapShowToast`, `yapPlanningRow`, `yapActionRow`, `YAP_ROW_FROM_BOTTOM`;
  - Task 2: `yapRoleText`.
- Produces these dictionary keys (EN / FR; the kicker role uppercases them):
  - `header.tutorial`: `Tutorial · {n} / 5` / `Tutoriel · {n} / 5`
  - `header.daily`: `Heist No. {day}` / `Casse nº {day}`
  - `header.archive`: `Archive · heist No. {day}` / `Archives · casse nº {day}`
  - `header.challenge`: `Challenge · heist No. {day}` / `Défi · casse nº {day}`
  - `header.running`: `{kicker} — running` / `{kicker} — en cours`
  - `tutorialLessons.t1` … `t5`: `The plan`, `The gaze`, `The patrol`, `The pause`, `The camera` / `Le plan`, `Le regard`, `La ronde`, `La pause`, `La caméra`
- `YapChromeButton` and the private `yapMakeButton` disappear from the level scene.

- [ ] **Step 1: Write the failing e2e tests** in `tests/e2e/hidpi.spec.ts` (390×844 @3, consent refused):
  - `a disabled PLAY ignores taps`: draw only (1,1)→(3,1) on T1, then call `yapPressPlay`. `__yapPhase` stays `planning` for 1 s, with no page error.
  - `the header names the tutorial lesson`: after boot on T1, `window.__yapHeader` holds `{ kicker: 'TUTORIAL · 1 / 5', title: 'The plan' }` (EN context).
    - The scene publishes `window.__yapHeader = { kicker, title }`, as rendered, from `yapHeader` callers. It is a test hook beside the existing `__yapPhase`, guarded the same way.
- [ ] **Step 2: Point `yapPressPlay` (support.ts) at the layout function.** It taps the centre of `yapPlanningRow(view.width, false).play`, at `y = view.height − YAP_ROW_FROM_BOTTOM`. Build, then run the spec. Expect the two new tests to FAIL and the rest to PASS.
- [ ] **Step 3: Rebuild the level chrome with the kit.** Same behaviour, new look:
  - **Build:** `yapPaperPage` goes at the back of the board container.
  - **Header in all four modes:**
    - title: `tutorialLessons.tN` for `tutorial/tN`, otherwise `level.name`;
    - kicker from the scene data `mode`/`day`/`levelId`: tutorial, daily, archive or challenge, and `header.running` wrapping it during execution. With no scene data, use `''` and `level.name`.
    - right lines: planning `[statsTicks · statsPar, statsPauses · ★3=… ★2≤…]`; execution `[executionPlayback.tick]` with `rightLarge`; failure `[failure.attempt]`; win `[statsPar]`.
    - It updates in place through `setRight`.
  - **Planning footer:**
    - a `yapRule` at the bar's top;
    - the instruction in the `caption` role (`ink-muted`), hidden when it would touch the row;
    - from `yapPlanningRow`: Clear (secondary), Hint (secondary, shown only when available) and PLAY (primary). PLAY is disabled with label `planning.drawRoute` until the plan can run, then enabled with `planning.play`. The existing pulse tween is kept. `setBox` moves PLAY when the Hint slot appears.
  - **Execution footer:** `yapActionRow(width, [{ width: 104 }, {}])`, with ×2 and Stop both secondary.
  - **Failure footer:** a `yapRule`; the cause in the `body` role in ink, keeping its warning icon; `failure.tapToReturn` in the `stat` role in `ink-muted`.
  - **Win:**
    - a `yapCard` replaces the rounded panel, at the same geometry;
    - title in the `cardTitle` role; row labels in `body` (`ink-muted`); values in `stat` (`ink`); the preview label in `kicker`;
    - Improve and Home are secondary, laid out by `yapActionRow(innerWidth, [{}, {}])`, 48 px tall;
    - Share is primary, `fireOn: 'up'`, at the same y as today, so `viewHeight − 60` stays inside it.
  - **Toasts:** `yapShowToast`.
- [ ] **Step 4: Add the dictionary keys** above to both dictionaries (the i18n parity test must pass).
- [ ] **Step 5: Run the gate and the e2e specs.** All PASS, including the two new tests and the unchanged share flows.
- [ ] **Step 6: Commit** `[C1] Level chrome through the kit: ink header, typewriter stats, paper buttons`.

### Task 5: Home through the kit

**Files:**
- Modify: `src/game/home-scene.ts`, `src/app/i18n/en.ts`, `src/app/i18n/fr.ts`, `tests/e2e/share.spec.ts`, `tests/e2e/support.ts` (if a helper is needed)

**Interfaces:**
- Consumes the Task 3 kit and the Task 2 roles.
- Produces the dictionary key `home.tagline`: `One heist a day · Yap Corp` / `Un casse par jour · Yap Corp`. The private `yapMakeButton` disappears from Home.

- [ ] **Step 1: Write the failing e2e test** `Home Share opens the share sheet` in `share.spec.ts`, using the mobile context and the share stub already in that file:
  - `page.clock.setFixedTime` to noon local time on test-week day 3 (`YAP_TEST_START_DATE` plus 2 days);
  - seed the tutorials as done and a cleared record for day 3 under `yapcorp:days`, in the shape `loadYapDays` reads (copy it from `tests/unit/router.test.ts` or `tests/unit/daily.test.ts`);
  - tap Home's Share button at its kit row position;
  - expect exactly one `navigator.share` call whose text contains `Daily Heist #3`.
- [ ] **Step 2: Build and run it.** Expect FAIL. The position changes with the kit; if the test passes before the change, note it in the report and keep the test.
- [ ] **Step 3: Rebuild Home with the kit:**
  - `yapPaperPage`;
  - `yapHeader` with kicker `home.tagline`, title `app.title`, and right `[★ total/max]`;
  - the daily card through `yapCard` and the roles: title in `cardTitle`, status in `body`, streak and countdown in `stat`;
  - archive rows drawn with `yapCard` (paper, ink 1.5 px border), text in roles;
  - buttons through `yapButton`: Play or Tutorial as primary; Share secondary with `fireOn: 'up'`; Archive/Close secondary, using `yapActionRow` for the secondary pair;
  - toasts through `yapShowToast`;
  - the poster mini-map unchanged (slice 3).
- [ ] **Step 4: Run the gate and both e2e specs.** All PASS.
- [ ] **Step 5: Commit** `[C1] Home through the kit; Share fires on release`.

### Task 6: Challenge and consent through the kit, no private buttons left

**Files:**
- Modify: `src/game/challenge-scene.ts`, `src/game/consent-scene.ts`, `src/app/i18n/en.ts`, `src/app/i18n/fr.ts`
- Create: `tests/unit/kit-guard.test.ts`

**Interfaces:**
- Consumes the Task 3 kit and the Task 2 roles.
- Produces these dictionary keys:
  - `challengeFlow.kicker`: `Message received · heist No. {day}` / `Message reçu · casse nº {day}`
  - `challengeFlow.title`: `A challenge from {nickname}` / `Un défi de {nickname}`
  - `challengeFlow.titleAnonymous`: `A challenge` / `Un défi`

  If `challengeFlow` already exists, add these under it; keep its other keys.

- [ ] **Step 1: Write the failing guard** in `tests/unit/kit-guard.test.ts`: `buttons come from the kit`. It scans `src/game/*.ts` and finds no private button helper, matching `/\byapMake\w*Button\b/`, outside `kit.ts`. It prints `file:line` for each hit and checks that the scan is non-empty, mirroring `hidpi-guard.test.ts`. The board's own rounded shapes stay out of scope until slice 3.
- [ ] **Step 2: Run it.** Expect FAIL (challenge, consent).
- [ ] **Step 3: Challenge scene:**
  - `yapPaperPage`;
  - `yapHeader` with kicker `challengeFlow.kicker` and title `challengeFlow.title`/`titleAnonymous` on the card view; the comparison and plan views keep `comparison.title`, but in the kit header;
  - cards through `yapCard`; texts in roles;
  - buttons through `yapButton`: Take the challenge primary, Later secondary, Back secondary, See their plan secondary, Share my result secondary with `fireOn: 'up'`.
- [ ] **Step 4: Consent banner:**
  - same place and behaviour (slice 4 moves it to the bottom);
  - drawn as a note: paper, 1.5 px ink border, the card shadow;
  - copy in the `body` role at 14 px (pass `fontSize` through `extra` only if the role needs it; otherwise use `yapRoleStyle('body', …)` with a 14 px override);
  - OK primary and No thanks secondary through `yapButton` at height 44.
- [ ] **Step 5: Run the gate and both e2e specs.** All PASS, including `answers the consent banner at 3x`. Update its tap point only if the kit moved the OK button, from the same layout numbers.
- [ ] **Step 6: Commit** `[C1] Challenge and consent through the kit; no private buttons left`.

### Task 7: Record the kit and verify the whole slice

**Files:**
- Modify: `docs/UI-DESIGN.md`, `tasks/C1.md`

- [ ] **Step 1:** In `docs/UI-DESIGN.md`, add a short "Plan style kit (slice 2)" bullet list: the five new tokens, the text roles table name, and the kit functions in `src/game/kit.ts`. State that the board tokens stay until slice 3.
- [ ] **Step 2:** In `tasks/C1.md`, append to the pass-3 sentence: `2/6 paper & ink chrome in review`. List `src/game/kit.ts` and `tests/unit/kit*.test.ts` in the pass-3 ownership.
- [ ] **Step 3: Run the full gate** and both e2e specs. Expect green. `git status` must be clean after the commit.
- [ ] **Step 4: Screenshot review.** With a throwaway script (not committed), capture at 390×844 @3 and 360×640 @2, in EN and FR:
  - T1 planning (empty and with a route);
  - execution;
  - failure;
  - win;
  - Home, during the week with a fixed clock, and after the week;
  - the challenge card;
  - the consent banner.

  Check that nothing overlaps or clips, that essential text is ≥ 14 px, and that the targets are ≥ 44 px. Save the PNGs under the plan workspace for the PR.
- [ ] **Step 5: Commit** `[C1] Record the plan style kit; slice 2 in review` (local only; push and PR come with the user's choice).
