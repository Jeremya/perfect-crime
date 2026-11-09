# Tasks — Gate 1 backlog, cut for parallel agents

One file per story of `Gate 1 — Specs and backlog.pdf` (34 stories + 2
optional). Each file is **self-contained**: an agent can pick it up with only
`AGENTS.md` + the task file. Every task declares its **ownership** (the only
files it may touch) so parallel agents never collide.

Status snapshot: **2026-11-05 (after #76)**. `Done` means merged with
repository acceptance evidenced. `In progress` includes merged work with an
outstanding acceptance check (real-phone preview, playtest, live dashboards)
or an open PR; each task file says which. External setup (such as live PostHog
dashboards or real-phone checks) is not complete without evidence.

Current count across the **34 required stories: 23 Done, 6 In progress, 5 To
do**. Both optional stories are Done (O1 #32+#44, O2 #19). The code of the 34
stories is merged, but **the review of 2026-11-05 found two screens of the spec
that no story owned** (D3 and E6 below), so Gate 1 still has code to write. The
post-Gate-1 experience tasks (X1–X9, from `docs/design/experience.md`) are also
merged (#49–#59, #76), except X5 (star-gain animation, not started). The C1 visual pass 3
("plan d'architecte", `docs/design/2026-10-30-plan-style-design.md`) is
**complete: slices 1–6/6 merged (#51, #60, #61, #62, #63, #64)** — crisp
rendering, paper & ink chrome, board plan, screen compositions, UI-DESIGN
rewrite + Kenney cleanup, plan-style share previews. Only the real-phone
check of the visual passes is still pending.

Since #64, a phone session found that **d4 and d5 could not be won by drawing**,
along with 7 of the 20 medium and hard heists: the drawing cut the route on any
path cell, and the solver could plan a U-turn after a pause, which the drawing
cannot express. Fixed in #69 (a stroke that passes over the route revisits it;
only a stroke that starts on it cuts) and #70 (the solver only finds drawable
plans, `validate` replays every optimal plan through `YapPathInput`, d5 and six
dev heists retuned). The rule in `resolveTick` did not change. d4 and d5 were won
with real touch on the Seeker on the production build, from the archive, in
French. #67 (no fatal marker on the diamond) and #68 (hints show their pauses)
came from the same session.

Then #71 (counts agree with their noun), #73 (the fatal marker goes with the
route), #74 (day boxes tick the days won on time), #75 (daily heists named in
French) and #76 (X9 Observer, on by default).

## What remains

### 0. Code left, found by the review of 2026-11-05

| Task | What is missing | Why it matters |
|---|---|---|
| D3 | In review (#79): the Settings screen of the spec. Left: a contact on the privacy page, the IP setting in PostHog, a check on iOS | Needed before H5 |
| E6 | The comparison after the linked heist, with Share my result | The rematch step of the sharing loop, which Gate 1 measures |

### 0b. Proposals from the review of 2026-11-09 (sharing loop)

Not Gate 1 scope until approved. They aim at "do people share it?": X10 (a
share line that tells the heist), X11 (a failure can be shared), X12 (the
nickname asked where it matters), X13 (how many link arrivals the express
tutorial loses). E6 comes first; none of them should start before H1 has run.

### 1. Acceptance checks (no code left, evidence missing)

| Task | What is left | Who |
|---|---|---|
| C8 | audio unlock + Android vibration on a phone (sound cannot be automated) | Dev + a human ear |
| E5 | per-target rows (WhatsApp, Messages, Discord, Instagram) and iOS | PM/Dev, needs a real send |
| G3 | live PostHog dashboards + test data | PM |

The Android rows of E5 are already recorded (`docs/share-matrix.md`, three
variants on Chrome 156 / Android 16); the app side of every other item is
merged and tested.

### 2. Human playtests (they need people, not code)

- **F2** — 3-person playtest of T1 (the first ten minutes).
- **F3** — 2-person playtest per daily heist (7 heists). d5 is a new design
  since #70: nobody has played it yet.
- **H1** — feel session #1: protocol and fill-in template are ready in
  `docs/feel/session-1.md`; the session itself has to run with 3 warm
  testers on the production build.
- **H2** — the fixes that come out of H1.
- **H3** — feel session #2, ghost preview on/off.

### 3. Critical path to the Gate 1 decision

**H4 (recruit 20–30 testers) → H5 (test week, no reminders) → H6 (decision).**
H4 was meant to run in parallel from day 1 and is, with D3, what can slip the
gate. Without recruited testers, H5 and H6 cannot start.

**The start date is still a placeholder.** `YAP_TEST_START_DATE` is
`2025-11-03` (`src/app/config.ts`, pinned by `tests/unit/daily.test.ts`), so
production is in the `after` phase: Home says the test week is over, there is
no Play button, and the dailies are only reachable through Archives. H1 and F3
play them there. Set the real Monday only once H1–H3 are done: before day 1, a
future date leaves the tutorial and a countdown, and Archives are empty. Then
rehearse the `week` phase on a preview (date set to today) before day 1.

### 4. Known gaps, not covered by a story

Kept here so they are not lost (none blocking Gate 1):

- **Readability of the rounds**: X9 (#76) is merged, on by default. Nobody has
  played it yet: H1 says whether it helps. One idea from the T4 notes is not
  covered: telling the player that tapping a planned cell adds a wait.
- **Flags**: `preview`, `observer` and `night` are read from the URL only. The
  spec wants a flag remembered in the profile and sent with every event; only
  `ghost` is. It matters if H1 or H3 compares the Observer on and off.
- **e2e**: the Playwright specs (`npm run test:e2e`) do not run in CI.
- **Home at 360 px**: "GARDE · CAMÉRA · LASER" wraps with a trailing dot, and the
  archive stamps cross their row frame.
- **Dev heists**: `hard/h8` badges overlap; the hint thirds of m2, m5, h3 and h7
  end right before a pause.
- **Visual direction**: decided 2026-11-04 — the "plan d'architecte" direction
  (`docs/design/2026-10-30-plan-style-design.md`) is the only one, everywhere;
  100% code-drawn, no Kenney UI Pack sprites and no Kenney character sprites
  (`public/assets/kenney/` deleted in 5/6, #63; recorded in
  `docs/design/visual-kit/README.md`, which stays as an archive of the
  rejected "fancy" proposal). All six slices are merged (see C1).
- **Visual handoff**: `docs/design/` exists (style tile, mockups at
  390 × 844 and 360 × 640, component sheet under `docs/design/visual-kit/`;
  plan-style design + screenshots under `docs/design/plan-style/`). The
  readability-check artifact (one heist, tick-0 cones + ghost at tick 8) is
  still to produce.
- **Landscape**: at 864 × 307 the Home layout overlaps (portrait-only is in
  scope, but the degradation is ugly). Documented, not fixed.

Closed since the 2026-10-30 snapshot: the first-launch animated hand and the
consent note that moves the board (slice 4/6, #62), the challenge card's empty
middle (memo, plan card, wax seal, verdict stamp — slice 4/6, #62), the Kenney
UI Pack integration question (decided: not used), and the whole plan-style
visual pass (slices 1–6/6, #51/#60–#64).

Rules: one task = one branch `<id>-<slug>` = one PR `[<ID>] <title>`. Tests
first. Full local check green before pushing:
`npm run typecheck && npm run lint && npm run format:check && npm run test && npm run validate && npm run build`,
then `npm run test:e2e` for anything a player can see (CI does not run it).
For UI, game rendering, screen flow, sharing previews, and visual level
content, read `docs/UI-DESIGN.md` alongside the task file. It supplements the
Gate 1 PDF's behavior and scope with visual direction and review criteria.

## Index

| ID | Story | Epic | Role | h | Depends on | Status | File |
|---|---|---|---|---|---|---|---|
| A1 | Repository and tooling | A | Dev | 1.5 | — (scaffolded) | Done | `tasks/A1.md` |
| A2 | Config, safe storage, anon IDs, flags | A | Dev | 0.75 | A1 | Done | `tasks/A2.md` |
| A3 | FR/EN typed dictionaries | A | Dev | 0.75 | A1 | Done (+ #71; language choice: D3) | `tasks/A3.md` |
| B1 | Level format, parser, validator | B | Dev | 1.5 | A1 | Done | `tasks/B1.md` |
| B2 | Simulation (resolveTick, visibleCells) | B | Dev | 3.5 | B1 | Done | `tasks/B2.md` |
| B3 | Solver (par, optimal plan, tension) | B | Dev | 2.5 | B2 | Done (+ #70: only drawable plans) | `tasks/B3.md` |
| B4 | validate CLI + levels.json in CI | B | Dev | 1 | B3 | Done (+ #70: replays every plan through the real drawing) | `tasks/B4.md` |
| C1 | Rendering | C | Dev | 3 | B2 | Done | `tasks/C1.md` |
| C2 | Path drawing | C | Dev | 3 | C1 | Done (+ #69: a stroke can cross the route) | `tasks/C2.md` |
| C3 | Execution playback | C | Dev | 1.5 | C2 | Done | `tasks/C3.md` |
| C4 | Failure replay | C | Dev | 1.5 | C3 | Done (#20 + #67 + #73; phone check) | `tasks/C4.md` |
| C5 | Win screen | C | Dev | 1 | C3 | Done | `tasks/C5.md` |
| C6 | Ghost preview (flag) | C | Dev | 1 | C2 | Done (#21 + #40 + #46; phone on/off check) | `tasks/C6.md` |
| C7 | Hints after 3/6 failures | C | Dev | 0.5 | B3, C2 | Done (#33 + #68) | `tasks/C7.md` |
| C8 | Sounds + vibration | C | Dev | 0.5 | C3 | In progress (#28 merged; phone audio/vibration check pending) | `tasks/C8.md` |
| D1 | Daily logic, streak | D | Dev | 1.5 | A2 | Done | `tasks/D1.md` |
| D2 | Home and flow | D | Dev | 1.25 | D1, C5 | Done (#30/#31 + #74; phone check) | `tasks/D2.md` |
| D3 | Settings (no story owned it) | D | Dev | M | A3, C8, D2, G2 | In review (#79) | `tasks/D3.md` |
| E1 | Payload v1 | E | Dev | 1 | B2 | Done | `tasks/E1.md` |
| E2 | Share button | E | Dev | 1.25 | E1, C5 | Done (#29 + #44; Home Share wired) | `tasks/E2.md` |
| E3 | Pages /c/1–7 + OG images | E | Dev | 0.75 | B4 | Done | `tasks/E3.md` |
| E4 | Link arrival / challenge card | E | Dev | 1.5 | E1, D2 | Done (#36/#37; two-device check) | `tasks/E4.md` |
| E5 | Share matrix on real phones | E | Dev+PM | 0.75 | E2, E3 | In progress (#34 merged, Android rows recorded; iOS + per-target rows pending) | `tasks/E5.md` |
| E6 | Comparison after the linked heist, rematch (no story owned it) | E | Dev | S | E2, E4 | In review | `tasks/E6.md` |
| F1 | Dev viewer /dev/viewer | F | Dev | 1.5 | B3, C1 | Done | `tasks/F1.md` |
| F2 | 5 tutorial levels | F | Design | 1.5 | F1 | In progress (#25 merged; 3-person playtest pending) | `tasks/F2.md` |
| F3 | 7 daily heists (3 signature) | F | Design | 6 | F1 | In progress (#26 + #70 + #75 merged; per-heist playtest pending) | `tasks/F3.md` |
| G1 | Analytics PostHog adapter | G | Dev | 1.25 | A2 | Done | `tasks/G1.md` |
| G2 | Consent and privacy | G | Dev | 0.5 | G1 | Done (#22; phone check) | `tasks/G2.md` |
| G3 | Gate 1 dashboard | G | PM | 1.25 | G1 | In progress (#9 merged; live dashboards pending) | `tasks/G3.md` |
| H1 | Feel session #1 | H | PM | 1.5 | C1–C5, F2, 3×F3 | In progress (template ready, session to run) | `tasks/H1.md` |
| H2 | Feel fixes | H | Dev | 2 | H1 | To do | `tasks/H2.md` |
| H3 | Feel session #2 (ghost on/off) | H | PM+Dev | 1.5 | H2 | To do | `tasks/H3.md` |
| H4 | Recruitment 20–30 testers | H | PM | 1.5 | — (parallel from day 1) | To do | `tasks/H4.md` |
| H5 | Test week, no reminders | H | PM | 1 | H4, G3 | To do | `tasks/H5.md` |
| H6 | Gate 1 decision | H | PM | 1 | H5 | To do | `tasks/H6.md` |
| O1 | Optional: playable archive | O | Dev | 0.75 | D2 | Done (#32 + #44; fits on 360 × 640 and 400 × 797) | `tasks/O1.md` |
| O2 | Optional: draft generator | O | Dev | 1 | B3 | Done | `tasks/O2.md` |
| X1 | Star thresholds visible in the planning top bar | X | Dev | S | C1, C2 | Done (#49) | — (cut from `docs/design/experience.md`) |
| X2 | ★ total on Home + stars in archive rows | X | Dev | S | X1, D1 | Done (#50) | — (cut from `docs/design/experience.md`) |
| X3 | Plan preview (Angry Birds dotted arc) behind `?flag=preview:` | X | Dev | M | C3, C6 | Done (#56) | `tasks/X3.md` |
| X4 | Slingshot undo: drag back erases the route | X | Dev | M | C2 | Done (#58) | `tasks/X4.md` |
| X5 | Star-gain animation on the Win screen | X | Dev | S | C5 | To do (not started) | — (cut from `docs/design/experience.md`) |
| X6 | 10 medium-difficulty heists | X | Design+Content | 3 h | F2, F3, B3, B4 | Done (#54) | `tasks/X6.md` |
| X7 | 10 hard-difficulty heists | X | Design+Content | 3 h | X6 | Done (#57) | `tasks/X7.md` |
| X8 | Visual kit "fancy" (design only; archived, direction rejected) | X | Design | 2 h | C1 | Done (#55) | `tasks/X8.md` |
| X8b | Style tile 100% code — X8b-1 merged (#59) then retired by the 2026-11-04 product call (#60); X8b-2/X8b-3 cancelled | X | Dev | M | X8 | Done / cancelled | `tasks/X8b.md` |
| X9 | Observer: watch the round, stop on the cause | X | Dev | L | C2, C3, C6, X3 | Done (#76; H1 says whether it helps) | `tasks/X9.md` |
| X10 | The nerve line: a share result that tells the heist | X | Dev | M | C5, E2 | Proposal (needs the product owner's go) | `tasks/X10.md` |
| X11 | Share a failure, from the third one | X | Dev | M | C4, E2, E4 | Proposal (needs the product owner's go) | `tasks/X11.md` |
| X12 | Ask the nickname at the first share | X | Dev | S | D3, E2 | Proposal | `tasks/X12.md` |
| X13 | Express tutorial: measure the loss, then shorten it | X | PM+Dev | S+S | E4, G1 | Proposal (step 2 needs the product owner's go) | `tasks/X13.md` |

## Parallel waves (dependency order)

This is the original dependency graph. Use the Status column to skip completed
work and avoid restarting an active story; tasks in a wave can run in parallel
only when their dependencies are merged and their ownership stays disjoint.

| Wave | Tasks | Why |
|---|---|---|
| 0 | A1 (verify only), **H4** | no dependencies; H4 runs alongside all dev |
| 1 | A2, A3 | both depend only on A1; disjoint files (`src/app/config|storage` vs `src/app/i18n`) |
| 2 | B1, G1 | B1 needs A1; G1 needs A2 — disjoint (`src/core` vs `src/app/analytics`) |
| 3 | B2 | needs B1 |
| 4 | B3, C1, E1 | all need only B2; disjoint (`src/core/solver` vs `src/game` vs `src/app/payload`) |
| 5 | B4, C2, C6, C7, D1 | B4←B3; C2/C6/C7←C1/C2/B3; D1←A2 |
| 6 | C3, E3 | C3←C2; E3←B4 |
| 7 | C4, C5, F1 | C4/C5←C3; F1←B3+C1 |
| 8 | C8, D2, E2 | C8←C3; D2←D1+C5; E2←E1+C5 |
| 9 | E4, E5, F2, F3, O1, O2 | E4←E1+D2; E5←E2+E3; F2/F3←F1; O1←D2; O2←B3 |
| 10 | G2, G3, H1 | G2←G1; G3←G1; H1←C1–C5+F2+F3 |
| 11 | H2 | ←H1 |
| 12 | H3, H5 | H3←H2; H5←H4+G3 |
| 13 | H6 | ←H5 |

Cut order if time slips (spec): O2, O1, C8, second hint of C7. Never cut C2,
C4, E2, F3, H1–H3.

## Claiming a task

1. Check the wave table: all "Depends on" PRs merged into `main`.
2. Set **Status** in the task file to `In progress` (in your branch).
3. Create the worktree + branch (see `docs/PARALLEL.md`), implement, open the PR.
4. On merge, set **Status** to `Done` in `tasks/<ID>.md` on `main`.
