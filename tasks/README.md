# Tasks — Gate 1 backlog, cut for parallel agents

One file per story of `Gate 1 — Specs and backlog.pdf` (34 stories + 2
optional). Each file is **self-contained**: an agent can pick it up with only
`AGENTS.md` + the task file. Every task declares its **ownership** (the only
files it may touch) so parallel agents never collide.

Status snapshot: **2026-10-30 (after #44)**. `Done` means merged with
repository acceptance evidenced. `In progress` includes merged work with an
outstanding acceptance check (real-phone preview, playtest, live dashboards)
or an open PR; each task file says which. External setup (such as live PostHog
dashboards or real-phone checks) is not complete without evidence.

Current count across the **34 required stories: 23 Done, 6 In progress, 5 To
do**. Both optional stories are Done (O1 #32+#44, O2 #19). Every line of code
for Gate 1 is merged; nothing is blocked on a developer.

## What remains

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
- **F3** — 2-person playtest per daily heist (7 heists).
- **H1** — feel session #1: protocol and fill-in template are ready in
  `docs/feel/session-1.md`; the session itself has to run with 3 warm
  testers on the production build.
- **H2** — the fixes that come out of H1.
- **H3** — feel session #2, ghost preview on/off.

### 3. Critical path to the Gate 1 decision

**H4 (recruit 20–30 testers) → H5 (test week, no reminders) → H6 (decision).**
H4 was meant to run in parallel from day 1 and is now the only thing that can
slip the gate: the build, the heists, the sharing and the analytics are ready.
Without recruited testers, H5 and H6 cannot start.

### 4. Known gaps, not covered by a story

Kept here so they are not lost (all from `docs/UI-DESIGN.md`, none blocking
Gate 1):

- **Visual handoff**: `docs/design/` (style tile, mockups at 390 × 844 and
  360 × 640, component sheet, readability check) does not exist. The Kenney
  **UI Pack** sprites for primary/secondary controls are still not integrated.
- **First launch**: the animated hand demonstrating a route (UI-DESIGN,
  "First launch / T1") is not implemented; T1 opens with an empty board.
- **Challenge card**: the E4 card has a large empty middle (it has not had a
  visual pass).
- **Landscape**: at 864 × 307 the Home layout overlaps (portrait-only is in
  scope, but the degradation is ugly). Documented, not fixed.

Rules: one task = one branch `<id>-<slug>` = one PR `[<ID>] <title>`. Tests
first. Full local check green before pushing:
`npm run typecheck && npm run lint && npm run test && npm run validate && npm run build`.
For UI, game rendering, screen flow, sharing previews, and visual level
content, read `docs/UI-DESIGN.md` alongside the task file. It supplements the
Gate 1 PDF's behavior and scope with visual direction and review criteria.

## Index

| ID | Story | Epic | Role | h | Depends on | Status | File |
|---|---|---|---|---|---|---|---|
| A1 | Repository and tooling | A | Dev | 1.5 | — (scaffolded) | Done | `tasks/A1.md` |
| A2 | Config, safe storage, anon IDs, flags | A | Dev | 0.75 | A1 | Done | `tasks/A2.md` |
| A3 | FR/EN typed dictionaries | A | Dev | 0.75 | A1 | Done | `tasks/A3.md` |
| B1 | Level format, parser, validator | B | Dev | 1.5 | A1 | Done | `tasks/B1.md` |
| B2 | Simulation (resolveTick, visibleCells) | B | Dev | 3.5 | B1 | Done | `tasks/B2.md` |
| B3 | Solver (par, optimal plan, tension) | B | Dev | 2.5 | B2 | Done | `tasks/B3.md` |
| B4 | validate CLI + levels.json in CI | B | Dev | 1 | B3 | Done | `tasks/B4.md` |
| C1 | Rendering | C | Dev | 3 | B2 | Done | `tasks/C1.md` |
| C2 | Path drawing | C | Dev | 3 | C1 | Done | `tasks/C2.md` |
| C3 | Execution playback | C | Dev | 1.5 | C2 | Done | `tasks/C3.md` |
| C4 | Failure replay | C | Dev | 1.5 | C3 | Done (#20; phone check) | `tasks/C4.md` |
| C5 | Win screen | C | Dev | 1 | C3 | Done | `tasks/C5.md` |
| C6 | Ghost preview (flag) | C | Dev | 1 | C2 | Done (#21 + #40 + #46; phone on/off check) | `tasks/C6.md` |
| C7 | Hints after 3/6 failures | C | Dev | 0.5 | B3, C2 | Done (#33) | `tasks/C7.md` |
| C8 | Sounds + vibration | C | Dev | 0.5 | C3 | In progress (#28 merged; phone audio/vibration check pending) | `tasks/C8.md` |
| D1 | Daily logic, streak | D | Dev | 1.5 | A2 | Done | `tasks/D1.md` |
| D2 | Home and flow | D | Dev | 1.25 | D1, C5 | Done (#30/#31; phone check) | `tasks/D2.md` |
| E1 | Payload v1 | E | Dev | 1 | B2 | Done | `tasks/E1.md` |
| E2 | Share button | E | Dev | 1.25 | E1, C5 | Done (#29 + #44; Home Share wired) | `tasks/E2.md` |
| E3 | Pages /c/1–7 + OG images | E | Dev | 0.75 | B4 | Done | `tasks/E3.md` |
| E4 | Link arrival / challenge card | E | Dev | 1.5 | E1, D2 | Done (#36/#37; two-device check) | `tasks/E4.md` |
| E5 | Share matrix on real phones | E | Dev+PM | 0.75 | E2, E3 | In progress (#34 merged, Android rows recorded; iOS + per-target rows pending) | `tasks/E5.md` |
| F1 | Dev viewer /dev/viewer | F | Dev | 1.5 | B3, C1 | Done | `tasks/F1.md` |
| F2 | 5 tutorial levels | F | Design | 1.5 | F1 | In progress (#25 merged; 3-person playtest pending) | `tasks/F2.md` |
| F3 | 7 daily heists (3 signature) | F | Design | 6 | F1 | In progress (#26 merged; per-heist playtest pending) | `tasks/F3.md` |
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
