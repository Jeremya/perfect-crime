# Tasks — Gate 1 backlog, cut for parallel agents

One file per story of `Gate 1 — Specs and backlog.pdf` (34 stories + 2
optional). Each file is **self-contained**: an agent can pick it up with only
`AGENTS.md` + the task file. Every task declares its **ownership** (the only
files it may touch) so parallel agents never collide.

Status snapshot: **2026-10-30 (after wave 8 + follow-ups #37–#39)**. `Done` means
merged with repository acceptance evidenced. `In progress` includes merged work
with an outstanding acceptance check (real-phone preview, playtest, live
dashboards) or an open PR; each task file says which. External setup (such as
live PostHog dashboards or real-phone checks) is not complete without evidence.
Current count: **20 Done, 10 In progress, 6 To do** across the 34 required
stories + 2 optional (O1 In progress, O2 Done). All dev stories are merged; the
remaining work is PM-side: H1–H6 (feel sessions, recruitment, test week, Gate 1
decision) plus the outstanding real-device / playtest / dashboard checks noted
per task.

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
| C4 | Failure replay | C | Dev | 1.5 | C3 | In progress (#20 merged; phone check pending) | `tasks/C4.md` |
| C5 | Win screen | C | Dev | 1 | C3 | Done | `tasks/C5.md` |
| C6 | Ghost preview (flag) | C | Dev | 1 | C2 | Done (#21 + #40; phone on/off check pending) | `tasks/C6.md` |
| C7 | Hints after 3/6 failures | C | Dev | 0.5 | B3, C2 | Done (#33) | `tasks/C7.md` |
| C8 | Sounds + vibration | C | Dev | 0.5 | C3 | In progress (#28 merged; phone audio/vibration check pending) | `tasks/C8.md` |
| D1 | Daily logic, streak | D | Dev | 1.5 | A2 | Done | `tasks/D1.md` |
| D2 | Home and flow | D | Dev | 1.25 | D1, C5 | In progress (#30/#31 merged; phone check pending) | `tasks/D2.md` |
| E1 | Payload v1 | E | Dev | 1 | B2 | Done | `tasks/E1.md` |
| E2 | Share button | E | Dev | 1.25 | E1, C5 | In progress (#29 merged; real-device matrix E5 pending) | `tasks/E2.md` |
| E3 | Pages /c/1–7 + OG images | E | Dev | 0.75 | B4 | Done | `tasks/E3.md` |
| E4 | Link arrival / challenge card | E | Dev | 1.5 | E1, D2 | Done (#36/#37; two-device check) | `tasks/E4.md` |
| E5 | Share matrix on real phones | E | Dev+PM | 0.75 | E2, E3 | In progress (#34 merged, Android rows recorded; iOS + per-target rows pending) | `tasks/E5.md` |
| F1 | Dev viewer /dev/viewer | F | Dev | 1.5 | B3, C1 | Done | `tasks/F1.md` |
| F2 | 5 tutorial levels | F | Design | 1.5 | F1 | In progress (#25 merged; 3-person playtest pending) | `tasks/F2.md` |
| F3 | 7 daily heists (3 signature) | F | Design | 6 | F1 | In progress (#26 merged; per-heist playtest pending) | `tasks/F3.md` |
| G1 | Analytics PostHog adapter | G | Dev | 1.25 | A2 | Done | `tasks/G1.md` |
| G2 | Consent and privacy | G | Dev | 0.5 | G1 | In progress (#22 merged; phone check pending) | `tasks/G2.md` |
| G3 | Gate 1 dashboard | G | PM | 1.25 | G1 | In progress (#9 merged; live dashboards pending) | `tasks/G3.md` |
| H1 | Feel session #1 | H | PM | 1.5 | C1–C5, F2, 3×F3 | To do | `tasks/H1.md` |
| H2 | Feel fixes | H | Dev | 2 | H1 | To do | `tasks/H2.md` |
| H3 | Feel session #2 (ghost on/off) | H | PM+Dev | 1.5 | H2 | To do | `tasks/H3.md` |
| H4 | Recruitment 20–30 testers | H | PM | 1.5 | — (parallel from day 1) | To do | `tasks/H4.md` |
| H5 | Test week, no reminders | H | PM | 1 | H4, G3 | To do | `tasks/H5.md` |
| H6 | Gate 1 decision | H | PM | 1 | H5 | To do | `tasks/H6.md` |
| O1 | Optional: playable archive | O | Dev | 0.75 | D2 | In progress (#32 merged; archive overflows at 400 × 797 — fix pending) | `tasks/O1.md` |
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
