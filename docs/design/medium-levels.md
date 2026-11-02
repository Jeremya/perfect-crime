# Medium heists — 10 levels in `levels/medium/` (story X6)

> **Status: proposal, validated by the free checks.** Method: skill
> `game-level-design` — teach → practice → test across the set, one mechanic
> moment per level, increasing pressure. Every claim below is labeled
> **HYPOTHESIS** (design intent, not yet seen in play) or **OBSERVED** (produced
> by `npm run validate` / the solver / `tests/unit/levels-medium.test.ts`, the
> cheapest deciding tests of skill §3). No human playtest has run yet: the
> playtest criteria below name the test that would decide each open question.

## Scope and loops (skill §1)

- **Core loop** fed: plan → execute → win/fail → retry. Each medium heist adds
  one decision to the planning step (read a pingpong, spend a pause, time a
  camera, thread a crossing) without changing the loop.
- **Meta loop** untouched: medium levels are catalog content (`medium/mN` in
  `levels/levels.json`, visible in `/dev/viewer`); they do not alter the daily
  heist, streak or archive. Motivation fed: **competence** (par/stars against a
  readable threat) and **autonomy** (the player's own timing plan).
- **Scope guard**: Gate 1 perimeter respected — no editor, no doors/switches,
  no lasers in this set, type stays `normal` (`YapLevelType` has no `medium`).

## The medium band (pinned by `tests/unit/levels-medium.test.ts`)

`par` 16–24 (tutorial t4 = 14, daily d3 = 22, d7 = 30), 2–3 guards, 0–1 camera,
0 lasers, `maxPauses` 2–3, standard 8×12 map with one S / L / E, every patrol
and camera period dividing 24, start not seen at tick 0, solvable within 64
ticks. **OBSERVED**: all 10 levels pass `npm run validate` and the 59 unit
assertions.

## Observed solver numbers (free check, `npm run validate` + solver)

| Level | Name | par | minPauses | optimalPlans | tension | guards | cameras |
|---|---|---|---|---|---|---|---|
| medium/m1 | Pingpong | 16 | 0 | 160 | 4 | 2 | 0 |
| medium/m2 | The Wait | 19 | 1 | 432 | 9 | 2 | 0 |
| medium/m3 | Blinds | 19 | 1 | 99 | 11 | 2 | 1 |
| medium/m4 | Roundabout | 17 | 1 | 1000 | 2 | 2 | 0 |
| medium/m5 | Crossing | 20 | 2 | 1000 | 12 | 3 | 0 |
| medium/m6 | The Dash | 20 | 0 | 28 | 3 | 2 | 0 |
| medium/m7 | Hold | 20 | 2 | 304 | 7 | 2 | 1 |
| medium/m8 | Staggered | 18 | 2 | 100 | 9 | 3 | 0 |
| medium/m9 | Long Way Round | 23 | 1 | 6 | 9 | 2 | 0 |
| medium/m10 | Changing Lights | 22 | 0 | 200 | 10 | 3 | 1 |

`par` = solver par = declared par for all 10 (**OBSERVED**); `minPauses` ≥ 1 on
m2 and m7 pins the mandatory pause; m4 has a `loop` guard; m5's two guards
share cell (4,6); m8's three phases are pairwise distinct; m10 has a non-empty
`moment` with type `normal` (**OBSERVED** in the unit tests).

## The 10 levels — mandatory 4-field proposals

### m1 — "Pingpong" (teach: read a back-and-forth patrol)

1. **Game intention** — HYPOTHESIS: the player feels smart for reading the
   patrol's period and crossing the swept row right behind the guard, one cell
   outside its cone.
2. **Expected solution** — OBSERVED: the left column is walled so the route
   must cross row 4 inside g1's span (x=2..6, pingpong, period 8, phase 3); the
   optimal plan (par 16) crosses at (3,4) on tick 7, exactly one cell behind g1
   at (4,4) facing E. g2 (period 2, near the exit) is the mild distraction.
3. **Possible failure modes** — HYPOTHESIS: crossing one tick early/late is
   caught by the cone (tension 4 says the plan grazes cones); a player who
   misreads the phase may feel "unsolvable" (the F3 d4 lesson) — mitigated by
   160 optimal plans (many safe timings).
4. **Playtest criterion** — solver/validator already green (OBSERVED); the
   deciding test is the 2-person playtest on the PR preview (390×844): keep if
   both testers clear m1 within 3 attempts without a hint.

### m2 — "The Wait" (practice: the pause is mandatory)

1. **Game intention** — HYPOTHESIS: the player learns that a pause is a tool,
   not a failure: waiting one tick turns a deadly gap into a safe one.
2. **Expected solution** — OBSERVED: the only gap in the middle wall (x=4) is
   swept by g1's vertical patrol; the natural arrival is caught, and every
   optimal plan (par 19) spends exactly one pause (minPauses = 1, pinned by
   test). g2 patrols the loot row below.
3. **Possible failure modes** — HYPOTHESIS: players may burn both pauses early
   and then have none left for the gap; the pause badges must read clearly
   (UI-DESIGN: compact `⏸ 2` badges).
4. **Playtest criterion** — unit test pins minPauses ≥ 1 (OBSERVED); playtest:
   tester uses the pause deliberately on the first or second attempt (keep if
   the pause is discovered without a hint).

### m3 — "Blinds" (test: camera timing)

1. **Game intention** — HYPOTHESIS: the player reads the camera cycle (watches
   row 6 for 6 ticks, looks away for 6, period 12) and crosses only while it
   looks away.
2. **Expected solution** — OBSERVED: c1 at (0,6), dirs [E,S], hold 6, range 6;
   the optimal plan (par 19) waits one tick (minPauses = 1) and crosses row 6
   inside the away window; g1/g2 guard the top and bottom rows.
3. **Possible failure modes** — HYPOTHESIS: the violet cone over the whole row
   may read as "always deadly"; the away phase must be visible in the ghost
   preview (exact-cell overlay, UI-DESIGN non-negotiable).
4. **Playtest criterion** — solver + unit test green (OBSERVED); playtest:
   tester times the crossing by watching the camera, not by trial and error
   (keep if cleared in ≤ 3 attempts).

### m4 — "Roundabout" (practice: a loop patrol)

1. **Game intention** — HYPOTHESIS: the player notices the guard never turns
   around at the ends (loop, period 8) and slips through the cell it just left.
2. **Expected solution** — OBSERVED: g1 loops around the pillar at (3,4); the
   optimal plan (par 17) threads the loop's inner cells on the right ticks
   (minPauses = 1); g2 patrols the bottom row.
3. **Possible failure modes** — HYPOTHESIS: loop vs pingpong is a subtle
   difference; tension is the lowest of the set (2) — if playtests show players
   brute-forcing it, tighten the loop's range instead of adding a guard (skill:
   prefer moving a guard).
4. **Playtest criterion** — unit test pins the `loop` mode (OBSERVED); playtest:
   tester verbalizes "it keeps circling" before their first successful run.

### m5 — "Crossing" (test: two guards cross paths)

1. **Game intention** — HYPOTHESIS: the shared cell (4,6) is a knot of danger;
   the player feels the thrill of threading the crossing on the one tick both
   cones are open.
2. **Expected solution** — OBSERVED: g1 (row 6) and g2 (column 4) share (4,6)
   with offset phases; every optimal plan (par 20) spends both pauses
   (minPauses = 2, maxPauses = 3 leaves one spare); tension 12 is the highest
   of the set.
3. **Possible failure modes** — HYPOTHESIS: with two pauses required the level
   can feel brittle; the third guard (g3, near the exit) must not stack a third
   simultaneous threat.
4. **Playtest criterion** — unit test pins the shared cell (OBSERVED); playtest:
   keep if both testers clear it and report the crossing as the memorable moment.

### m6 — "The Dash" (test: narrow corridor under a sweep)

1. **Game intention** — HYPOTHESIS: the one-cell corridor between two walls
   feels like a gauntlet; the player dashes it at the west or east gap on the
   tick the sweep is at the far end.
2. **Expected solution** — OBSERVED: rows 5 and 7 are walls with single gaps at
   x=1 and x=6, so the corridor row 6 is the only passage; g1 sweeps it
   (range 3, period 6) and the optimal plan (par 20) crosses at the east gap
   while g1 is west; g2 guards the top row.
3. **Possible failure modes** — HYPOTHESIS: the corridor can read as a dead end
   if the gaps are missed; tension 3 is low — the dash is about the gap timing,
   not near-misses.
4. **Playtest criterion** — unit test pins the full wall row (OBSERVED);
   playtest: tester finds the gaps within 3 seconds (UI-DESIGN readability
   rule) and crosses without being caught twice in a row.

### m7 — "Hold" (test: pause + camera)

1. **Game intention** — HYPOTHESIS: the player combines both tools — the
   camera's away window and a deliberate pause — and feels in control of time.
2. **Expected solution** — OBSERVED: the only way down is the one-cell corridor
   in column 1; its exit (1,6) is watched by c1 for 6 of 12 ticks, the natural
   arrival (tick 5) falls inside the watched window, and because the corridor
   is one cell wide no detour can replace the pause: minPauses = 2 (pinned),
   par 20. g1/g2 guard the bottom region.
3. **Possible failure modes** — HYPOTHESIS: the dead-end east branch of row 1
   is a one-way trap (no U-turn rule) — a player who wanders there loses the
   run; acceptable as a readable mistake, but watch for frustration.
4. **Playtest criterion** — unit test pins minPauses ≥ 1 + 1 camera (OBSERVED);
   playtest: tester pauses at the gap deliberately (keep if the pause is
   discovered without a hint).

### m8 — "Staggered" (practice: three patrols, offset phases)

1. **Game intention** — HYPOTHESIS: the player must hold three periods in mind
   (phases 0/2/4) and cross each swept row inside its patrol's span — a
   reading workout, not a reaction test.
2. **Expected solution** — OBSERVED: walls force the route to cross rows 3, 6
   and 9 inside the spans of g1/g2/g3 (all pingpong, period 8, phases 0/2/4,
   pairwise distinct — pinned); optimal plan par 18 with two pauses.
3. **Possible failure modes** — HYPOTHESIS: three cones can feel noisy; the
   staggered phases are what make it fair (there is always a safe tick).
4. **Playtest criterion** — unit test pins 3 guards + distinct phases
   (OBSERVED); playtest: keep if testers clear it in ≤ 4 attempts and can name
   at least two of the three periods afterwards.

### m9 — "Long Way Round" (test: long route, tight par)

1. **Game intention** — HYPOTHESIS: the long forced route makes every tick
   count; the player feels the pressure of par 23 with no slack.
2. **Expected solution** — OBSERVED: two full walls with single gaps on
   opposite sides (x=1 at row 5, x=6 at row 8) force a ~20-tick route; the
   optimal plan (par 23, the tightest of the set) spends one pause (minPauses
   = 1); only 6 optimal plans — the route is nearly unique.
3. **Possible failure modes** — HYPOTHESIS: with so few optimal plans a single
   mistimed tick can feel unfair; the two guards are placed on the long legs,
   not stacked on the loot.
4. **Playtest criterion** — unit test pins par ≥ 23 (OBSERVED); playtest: keep
   if testers reach the loot before being caught and report the length as
   "tense but fair".

### m10 — "Changing Lights" (signature-lite mix, type stays `normal`)

1. **Game intention** — HYPOTHESIS: a "signature-lite" moment — thread the
   crossing of two patrols on the exact tick the camera looks away — without
   the full signature weight; the non-empty `moment` sentence announces it.
2. **Expected solution** — OBSERVED: g1 (row 6) and g2 (column 2) share (2,6);
   c1 sits on the central block (dirs [N,E], hold 6, phase 3, period 12); the
   optimal plan (par 22, tension 10) threads the crossing while the camera is
   away; g3 guards the exit approach. Type `normal`, moment non-empty (pinned).
3. **Possible failure modes** — HYPOTHESIS: three guards + one camera is the
   densest medium level; if playtests show it reads as chaotic rather than
   tense, drop g3's range instead of removing it.
4. **Playtest criterion** — unit test pins moment + type (OBSERVED); playtest:
   keep if testers quote the moment sentence back after clearing.

## Open questions → cheapest deciding test (skill §3)

1. *Do the medium levels feel fair (not "unsolvable") to humans?* → 2-person
   playtest on the PR preview build (phone 390×844), protocol
   `docs/feel/session-*.md`; decide keep/retune per level. HYPOTHESIS until then.
2. *Is the pause discovered without a hint on m2/m7?* → same playtest, watch
   first two attempts. HYPOTHESIS until then.
3. *Is m9's near-unique route (6 optimal plans) too brittle?* → solver number
   already OBSERVED; playtest decides whether to widen (move a guard) or keep.
4. *Do the levels read in 3 seconds (UI-DESIGN)?* → screenshot review of the
   PR preview at 390×844 and 360×640, tick-0 cones + ghost preview at tick 8.
