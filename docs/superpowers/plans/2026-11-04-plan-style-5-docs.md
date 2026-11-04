# Plan style 5/6 — UI-DESIGN rewrite and Kenney cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docs/UI-DESIGN.md` describe the plan style that ships, delete the Kenney files that nothing loads any more, and clear the minors deferred by the slice 4 review.

**Architecture:** Docs and cleanup. Two small behaviour fixes come with them, each pinned by a test:
- a stamp does not thump again on a rebuild;
- the win telegram carries the stars that the share sends.

**Spec:** `docs/design/2026-10-30-plan-style-design.md` §11 (documents and assets), §13 step 5.

## Global Constraints

- **`docs/UI-DESIGN.md`** stays the visual companion of the Gate 1 PDF. The PDF stays the authority on rules, screens and scope.
  - Its readability rules stay, with the plan-style values: exact cells, never colour alone, ≥ 14 px essential text, 44 px targets, reduced motion.
- **The Kenney exception goes:** characters and controls are drawn in code (spec §2, §11).
- **Legacy tokens:** the ones `tools/og.ts` and the dev viewer still read are listed as legacy until 6/6.
- **Housekeeping:** no new dependency; `src/core/` untouched; `levels.json` unchanged; FR/EN shapes identical.
- **Full gate:** typecheck, lint, test, validate, build, then both e2e specs.

## Review Focus

- **Nothing may still load or mention a deleted Kenney file:** `public/`, `index.html`, `src/`, `tools/` and the build output.
- **Dictionary keys removed as dead must really be unused:** grep every key before removing it, and keep the i18n parity test green.

---

### Task 1: Rewrite `docs/UI-DESIGN.md` for the plan style

**Files:** `docs/UI-DESIGN.md`

- The intro drops the Kenney exception: everything is drawn in code.
- **Tokens:**
  - the plan-style tokens (paper and ink, board, screens) with their roles and contrast floors;
  - the legacy tokens as a short note, kept until 6/6 (OG previews, dev viewer).
- **Type:** the roles of `YAP_TEXT_ROLES` (serif and mono, sizes, tracking) replace the old 12–32 px scale.
- **Board, layout, kit and screens:** as built in 2/6–4/6.
- **Assets:**
  - no sprite pack;
  - the component sheet is the code (`kit.ts`, `kit-screens.ts`, `render.ts`);
  - the deliverables section points to `docs/design/2026-10-30-plan-style-design.md` and `docs/design/plan-style/`.
- **Screen checklist:** updated to the shipped screens. Comparison "Share my result" is marked as a follow-up.
- [ ] Commit `[C1] UI-DESIGN.md: the plan style as built`.

### Task 2: Delete the Kenney files

**Files:** delete `public/assets/kenney/` (two PNGs and the license).

- [ ] Grep `kenney` over `src tools tests public index.html vite.config.ts`: expect no hit.
- [ ] Build, and grep `dist/` for `kenney`: expect none.
- [ ] Run the gate and both e2e specs.
- [ ] Commit `[C1] Remove the Kenney sprites: every token is drawn in code`.

### Task 3: Slice 4 deferred minors

**Files:** `src/game/level-scene.ts`, `src/game/challenge-scene.ts`, `src/game/home-scene.ts`, `src/game/kit-screens.ts`, `src/game/board.ts`, `src/app/i18n/*`, `tasks/C1.md`, tests

- **No thump on a rebuild:** the win stamp and the verdict stamp thump once per screen. The scene keeps a "landed" flag, as the failure stamp does.
- **Telegram stars:** the telegram ends with one ⭐ per star, as the share text does (`share.ts`). `yapTelegram`'s template gains `{stars}`. Test: `the telegram carries the stars`.
- **Dead keys:** remove `home.statusToDo`, `home.statusCleared`, `home.streak`, `home.nextHeistIn`, `challengeFlow.planLocked` and `challengeFlow.verdictBetter`, `verdictWorse` and `verdictTied`, each after a grep that finds no use.
- **Nits:**
  - `board.ts`: the double JSDoc above `YAP_CONSENT_HEIGHT_KEY`;
  - the E2 comment on Share firing on release, back on Home;
  - the hand's layer built with the hand only;
  - `yapFolder` exports its geometry (`YAP_FOLDER_TAB_BAND`, `YAP_FOLDER_INSET`) so Home stops re-deriving it;
  - `tasks/C1.md`: the hand is no longer backlog, and a follow-up line records "Share my result".
- [ ] Tests first for the telegram and the dead keys (parity), then the gate and both e2e specs, then screenshots of a win after a failure and the comparison.
- [ ] Commit `[C1] Slice 4 minors: one thump, telegram stars, dead keys, nits`.

### Task 4: Record and verify

- [ ] `tasks/C1.md`: 5/6 in review.
- [ ] Full gate and both e2e specs.
- [ ] Commit `[C1] Slice 5 in review`.
