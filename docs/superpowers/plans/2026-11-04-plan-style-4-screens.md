# Plan style 4/6 — Screen compositions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose every screen as the approved mockups show:
- stamps ("REPÉRÉ", "CASSE RÉUSSI", "À FAIRE", verdicts);
- the win report fiche over the dimmed board;
- the kraft folder of the day on Home, with day boxes and archive cards;
- the execution ruler;
- the first-launch hand on T1, with the consent note pushing the board down;
- the challenge memo with its wax seal.

**Architecture:**
- New kit components go in `src/game/kit.ts`: stamp, leader row, day boxes, ruler, seal and folder.
- Their geometry lives in pure helpers in a new `src/game/compose.ts`, unit-tested: leader dots, ruler marks, day boxes, stamp box, weekday of a test day, heist facts, win actions, the hand pose.
- Scenes compose those pieces. Behaviour does not change, except:
  - the win footer order (Share above the secondary row, as in the mockup);
  - the consent note shifting the level layout down.

**Tech Stack:** TypeScript (strict), Phaser 4.2.1, Vite, Vitest (node env), Playwright 1.64 (manual e2e).

**Spec:** `docs/design/2026-10-30-plan-style-design.md`: §5 (fiche, leader row, stamp, kraft folder, day boxes, wax seal, note, ruler), §8 (every screen), §9 (stamp thump, hand loop), §10 (copy). Mockups: `docs/design/plan-style/screens.png`. Base: branch `c1-plan-style-3` (PR #61); this branch stacks on it.

## Global Constraints

- **Tokens (§5), exact:** `kraft #E4D4AE`, `kraft-edge #B99E66`, `kraft-ink #5C4A24`, `star #B8860B`. Stamps use `stamp #C9302C`.
- **Stamp (§5):**
  - a red double border, 3 px, plus a 1.5 px outline offset 3 px;
  - heavy mono capitals, rotated about −9°;
  - paper at 55% behind.
  - **Thump (§9):** scale 1.35 → 1 over 180 ms; static under `prefers-reduced-motion`.
- **Leader row:** label · dotted leader · value.
- **Day boxes:** 7 squares, a red ✓ for won days, today ringed in red.
- **Kraft folder:** tab + body + a paper sheet rotated about −1.2°. Soft shadows only for physical objects (the folder and the sheet).
- **Ruler:** progress with graduations.
- **Wax seal:** a stamp-red disc with "SCELLÉ"; broken once the plan is unlocked.
- **Hand (§8, §9, X8 storyboard):**
  - on T1 only, while no route is drawn and before the first touch;
  - draws the T1 solution in about 1.6 s, pauses about 0.8 s, then repeats;
  - a dashed red ghost route marks the way;
  - drawn in code at 85% opacity, and it never covers the diamond or the exit;
  - under reduced motion it stays still over the first segment.
- **Win (§8):**
  - the board dimmed to about 28% (a `paper-page` veil at 0.72);
  - the fiche holds the kicker "RAPPORT D'OPÉRATION · Nº {day}" (tutorial: the tutorial kicker), the title, leader rows (Attempts / Ticks / Par / Stars in gold), and under a dashed rule the telegram "À PARTAGER {emoji line} · {ticks} ticks";
  - the stamp "CASSE RÉUSSI" sits over the fiche's top-right corner;
  - footer: Share primary full width, then Improve and Home (or Next level).
- **Copy (§10):** every new label goes into both EN and FR dictionaries, with identical shapes. Actions keep their spec wording. Weekdays come from the dictionaries, not from `Intl`.
- **Rules kept from `docs/UI-DESIGN.md`:**
  - essential text ≥ 14 px; stamps and kickers are decorative and may go down to 12 px;
  - touch targets ≥ 44 px;
  - no board cell covered by the consent note;
  - everything fits at 360×640 in FR. Optional blocks hide rather than overlap: the Home mini-map, and the challenge plan card.
- **Housekeeping:**
  - the `Yap` prefix; `src/core/` untouched; no new dependency;
  - `levels.json` unchanged;
  - all text through `text.ts`.
- **Full gate:** `npm run typecheck && npm run lint && npm run test && npm run validate && npm run build`, then both e2e specs. Restore `public/icons` and delete `test-results/` before committing.

## Review Focus

- **Long French copy at 360×640:**
  - Home: "DOSSIER Nº 5 · MERCREDI", "PROCHAIN DOSSIER DANS 1 J 05:12:33", "RÉUSSI · 12 ESSAIS";
  - win: "RAPPORT D'OPÉRATION · Nº 7" with a long emoji line.
  - Pinned in Task 1 by `yapFitStamp`, and the telegram line ellipsis test `yapTelegram fits its width`.
- **The win Share must stay tappable on release, and the e2e must find it after the reorder.** Pinned in Task 3: `yapWinActions` is pure and exported, and `share.spec.ts` taps from it.
- **The consent note must never cover a board cell, and the board must come back up once consent is answered.** Pinned in Task 5 by `yapLevelLayout` with the note offset (unit), plus the e2e `answers the consent banner at 3x` (OK still at its place).
- **The hand must stop on the first touch, also when that touch lands on PLAY or Clear, and must not come back after Clear on the same run.** Pinned in Task 5: the unit test `yapHandPose` timing, and a scene flag that is set on the first pointerdown anywhere.
- **A resize on the failure screen must keep the faint route** (slice 3 deferred minor). Pinned in Task 2: `yapRedrawPath` takes an explicit walked count from the fatal tick while `yapFailure` is set.

---

### Task 1: Composition helpers and kit components

**Files:**
- Create: `src/game/compose.ts`, `tests/unit/compose.test.ts`
- Modify: `src/game/board.ts` (tokens), `src/game/kit.ts` (components), `tests/unit/board.test.ts` (token contrast)

**Interfaces** (`compose.ts`, all pure):
- `yapLeaderDots(from: number, to: number, step = 4): number[]`: the x of each dot strictly between `from + 6` and `to − 6`.
- `yapRulerMarks(width: number, count: number): { x: number; long: boolean }[]`: `count + 1` marks from 0 to `width`; every 5th is long.
- `yapDayBoxes(x: number, width: number, size = 24, gap = 6): YapBox[]`: 7 boxes left-aligned from `x`, shrinking `size` so the row fits `width`.
- `yapWeekday(day: number, start = YAP_TEST_START_DATE): number`: 0..6 (Sunday = 0) of test day `day`, in the local calendar.
- `yapHeistFacts(level): ('guard' | 'camera' | 'laser')[]`: the kinds present, in that order.
- `yapTelegram(emoji: string, ticks: number, room: number, measure: (s: string) => number): string`: the telegram line, with the emoji line trimmed whole-glyph by glyph plus "…" when it does not fit `room`.
- `yapFitStamp(textWidth: number, max: number): number`: the font scale (1 down to 0.7) that keeps a stamp's text within `max`.
- `yapWinActions(viewHeight: number): { shareY: number; rowY: number; top: number }`: Share's centre at `viewHeight − 16 − 52 − 12 − 26`, the 48 px secondary row's centre at `viewHeight − 16 − 24`, and `top` above Share. This reorders the actions.
- `yapHandPose(t: number, segments: number): { index: number; along: number; visible: boolean }`:
  - t in ms within a 2400 ms loop;
  - the hand draws `segments` cells in 1600 ms, then pauses 800 ms at the end;
  - `index` is the segment it is on and `along` is 0..1 within it.

**Interfaces** (`kit.ts`, Phaser; no node tests, slice 2 Ruling 1):
- `yapStamp(scene, x, y, text, color = 'stamp', options?: { angle?: number; thump?: boolean; maxWidth?: number }): Phaser.GameObjects.Container`:
  - the §5 stamp, centred at (x, y), angle −9° by default;
  - it thumps when `thump` is set, unless motion is reduced.
- `yapLeaderRow(scene, x, y, width, label, value, valueColor?): Phaser.GameObjects.Container`: the label in `body`, the value in `stat`, and dots of ink-soft between them.
- `yapDayBoxRow(scene, x, y, width, won: readonly boolean[], today: number): Phaser.GameObjects.Container`.
- `yapRuler(scene, x, y, width, count): { container; setProgress(value: number): void }`.
- `yapSeal(scene, x, y, radius, broken: boolean): Phaser.GameObjects.Container`.
- `yapFolder(scene, x, y, width, height, tab: string): { container; sheet: YapRect }`: `sheet` is the paper sheet's inner box, where the caller draws its content.
- Tokens added to `YAP_PALETTE`: `kraft`, `kraft-edge`, `kraft-ink` and `star`.

- [ ] **Step 1: Failing tests** in `compose.test.ts`:
  - `leader dots stay clear of both texts`;
  - `ruler marks span the width, every 5th long` (count 26 gives 27 marks, longs at 0, 5, … 25);
  - `day boxes fit 360 px` (7 boxes within 296 px, each ≥ 18);
  - `weekday of the test days` (day 1 = 2025-11-03 = Monday = 1, day 7 = Sunday = 0);
  - `heist facts` (T1 gives [], D5 gives ['guard', 'camera', 'laser'], D7 gives ['guard', 'camera']);
  - `yapTelegram fits its width` (a fake measure of 8 px per char trims a 20-glyph line into a 120 px room with "…", and never splits a surrogate pair);
  - `yapFitStamp` (a 1.0 fit, then a 0.7 floor);
  - `win actions put Share above the row` (844: shareY 738, rowY 804, top 712);
  - `hand pose loops` (t 0 gives index 0 along 0; t 800 with 4 segments gives index 2 along 0; t 1600 to 2399 gives index 3 along 1; t 2400 is back to 0).
- [ ] **Step 2:** In `board.test.ts`, add `the folder ink reads on kraft` (`kraft-ink` against `kraft` ≥ 4.5) and `stars read on paper` (`star` against `paper` ≥ 3).
- [ ] **Step 3:** Run. Expect FAIL.
- [ ] **Step 4:** Implement the helpers, the tokens and the kit components. Screenshot each component in a throwaway scene at 390 and 360.
- [ ] **Step 5:** Commit `[C1] Composition kit: stamp, leader row, day boxes, ruler, seal, folder`.

### Task 2: Execution ruler and failure stamp

**Files:** `src/game/level-scene.ts`, `src/app/i18n/en.ts`, `src/app/i18n/fr.ts`

- **Execution footer:** a `yapRuler` across the footer width above ×2 and Stop, with `count = yapMaxTick()`. Its progress follows the tick in `yapUpdateExecutionChrome`.
- **Failure:**
  - once the replay settles (the frame index reaches the end), `yapStamp(…, 'failure.stamp' text, thump)` lands near the fatal cell;
  - it is in board space, offset 0.9 cell up-right, scaled `1 / zoom` so it keeps its size;
  - under reduced motion it appears at once.
  - Keys: `failure.stamp` "SPOTTED" / "REPÉRÉ", and `failure.tapToReturn` keeps its copy.
- **Slice 3 minors folded in:**
  - while `yapFailure` is set, `yapRedrawPath` passes `walked = yapWalkedSteps(plan, yapDetectionTick)`, so a resize keeps the faint route (test: the e2e resize during failure keeps passing, and the screenshot shows the route faint after a resize);
  - hint dots drop to 0.5 opacity;
  - the stale comments go.
- [ ] Implement, run the gate and both e2e specs, screenshot T1 mid-playback and T2 failure at both sizes, then commit `[C1] Execution ruler and the REPÉRÉ stamp`.

### Task 3: The win report

**Files:** `src/game/level-scene.ts`, `src/app/i18n/*`, `tests/e2e/share.spec.ts`

- A `paper-page` veil at 0.72 over the board, under the chrome.
- The fiche is a `yapCard` sized to its content and centred between the header and `yapWinActions(...).top`:
  - the kicker: `winScreen.report` "OPERATION REPORT · No. {day}" / "RAPPORT D'OPÉRATION · Nº {day}", or the header's tutorial kicker for a tutorial;
  - the title in `cardTitle`;
  - four `yapLeaderRow`s, with the stars value in `star`;
  - a dashed rule, then the telegram `winScreen.telegram` "TO SHARE {line} · {ticks} ticks" / "À PARTAGER {line} · {ticks} ticks", trimmed with `yapTelegram`;
  - `yapStamp(winScreen.stamp "HEIST PULLED OFF" / "CASSE RÉUSSI", thump)` on its top-right corner.
- Footer from `yapWinActions`: Share primary full width (`fireOn: 'up'`), then Improve and Home or Next level at 48 px. The toast sits above `top`.
- `share.spec.ts` taps Share at `yapWinActions(view.height).shareY`, not `viewHeight − 60`.
- [ ] Run the gate and both e2e specs (all share flows green), screenshot a tutorial win and a daily win (D5) at both sizes, then commit `[C1] The win report: fiche, leader rows, telegram, CASSE RÉUSSI`.

### Task 4: Home folder and archive cards

**Files:** `src/game/home-scene.ts`, `src/app/i18n/*`

- **Header:** unchanged (kicker tagline, title, ★ total).
- **During the week:** a `yapFolder` with tab `home.folderTab` "FILE No. {day} · {weekday}" / "DOSSIER Nº {day} · {weekday}" (weekday from `weekdays.0..6`). On its sheet:
  - the mini map (`yapDrawMiniMap`) on the left;
  - on the right: kicker `home.dailyKicker` "DAILY HEIST" / "CASSE DU JOUR", the level name in `cardTitle` (wrapped), and the facts in `stat` (`PAR {par}` plus `facts.guard` / `facts.camera` / `facts.laser`).
  - Under the folder: kicker `home.status` "STATUS" / "STATUT", and a stamp: `home.stampToDo` "TO DO" / "À FAIRE" in `stamp`, or `home.stampCleared` "CLEARED · {attempts} TRIES" / "RÉUSSI · {attempts} ESSAIS" in ink, with the record's stars after it in `star`.
- **Streak:** kicker `home.streakKicker` "STREAK · {count} DAYS" / "SÉRIE · {count} JOURS", then `yapDayBoxRow` (won = days with a record, today = model.day).
- **Countdown:** `home.nextFile` "NEXT FILE IN {time}" / "PROCHAIN DOSSIER DANS {time}" (stat, ink-muted).
- **Before and after the week:** the same folder with the first or the last heist, and the stamp `home.stampSoon` "SOON" / "BIENTÔT" or `home.stampWeekOver` "WEEK OVER" / "SEMAINE TERMINÉE". `homeFlow` copy stays as the sheet's text.
- **Archive cards:** each row's status becomes a small stamp (angle −6°, maxWidth 96), and the title gets its weekday: `archive.rowTitle` "No. {day} · {weekday}" / "Nº {day} · {weekday}".
- **Fit:** at 360×640 the folder shrinks its sheet and the mini map hides below 80 px of height. Nothing overlaps the actions.
- [ ] Run the gate and both e2e specs (`Home Share opens the share sheet` stays green), screenshot day 1 to do, day 3 cleared, archive, before and after the week, at both sizes in EN and FR, then commit `[C1] Home: the folder of the day, its stamp, the day boxes`.

### Task 5: First launch: consent note above the board, and the hand

**Files:** `src/game/consent-scene.ts`, `src/game/level-scene.ts`, `src/game/render.ts` (`yapDrawHand`), `tests/unit/board.test.ts`

- **The consent scene publishes its height:** `this.registry.set('yap-consent-height', height)` on build, and 0 when answered or on shutdown.
- **The level scene follows it:**
  - it listens to `changedata-yap-consent-height` and rebuilds as on resize;
  - its layout uses `topBar = YAP_TOP_BAR_HEIGHT + bannerHeight`, and the header container moves down by `bannerHeight`;
  - the hidpi resize path stays the only rebuild path.
  - Unit test `the consent note pushes the board down`: `yapLevelLayout(390, 844, T1, 64 + 76)` keeps the board below 140 and inside the bars.
- **Hand:**
  - `yapDrawHand(g, at: YapPoint, size)` in render.ts: a pointing hand (palm and index) in `ink` outline with a `paper` fill, drawn in code;
  - the scene shows it on `tutorial/t1` while the path is empty and the run has had no pointerdown;
  - a dashed `marker` ghost route of the solution at 0.6, from `yapDashes`;
  - the hand pose from `yapHandPose`, driven by the scene's update clock;
  - it stops for good on the first pointerdown (fade 150 ms, or at once under reduced motion);
  - under reduced motion it stays still over the first segment.
- [ ] Run the gate and both e2e specs (the consent tap and every T1 stroke stay green), screenshot first launch (note and hand) and after OK at both sizes, then commit `[C1] First launch: the consent note moves the board, the hand draws T1`.

### Task 6: Challenge memo and seal

**Files:** `src/game/challenge-scene.ts`, `src/app/i18n/*`

- **The memo fiche:** the challenge sentence in the `stat` role (typewriter capitals, wrapped), then the You / Friend grid with leader-free rows as today.
- **A small spoiler-free plan card:** `yapCard` with a `yapDrawMiniMap` and, beside it, the kicker "HEIST No. {day}" (reuses `header.daily`), the level name and its facts. It is hidden when the space left is under 96 px.
- **Sealed block:**
  - `yapSeal(broken = unlocked)`;
  - `challengeFlow.sealedTitle` "Their plan is sealed" / "Son plan est sous scellés" in body;
  - `challengeFlow.sealedNote` "OPENED AFTER YOUR WIN OR AT THE 2ND HINT" / "OUVERT APRÈS TA RÉUSSITE OU AU 2ᵉ INDICE" in kicker.
  - Once unlocked, the seal is broken and "See their plan" shows under it; locked, it is hidden (the seal says it).
- **Comparison:** when the recipient has a record, a verdict stamp ("YOU WIN" / "AHEAD" / "TIE", FR "GAGNÉ" / "DEVANT" / "ÉGALITÉ") replaces the verdict sentence.
- [ ] Run the gate, screenshot new player locked, known player won (comparison and plan view) at both sizes, then commit `[C1] Challenge memo, plan card and wax seal`.

### Task 7: Record and verify

**Files:** `docs/UI-DESIGN.md` (kit bullets: the new components), `tasks/C1.md` (4/6 in review, ownership), `tests/unit/board.test.ts` (slice 3 minor: the old floor-palette tests point at paper and ink-soft)

- [ ] Full gate and both e2e specs.
- [ ] Screenshot review at 390×844 @3 EN and 360×640 @2 FR of every §12 state: T1 and D5 planning, execution, failure, back to the plan, win (tutorial, daily), Home during and after the week, archive, first launch with consent and hand, challenge card, comparison, friend's plan, toasts, hint, ghost.
- [ ] Commit `[C1] Record the screen compositions; slice 4 in review`.
