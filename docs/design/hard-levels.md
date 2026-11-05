# Hard heists — 10 levels in `levels/hard/` (story X7)

> **Status: proposal, validated by the free checks.** Method: skill
> `game-level-design` — teach → practice → test across the set, one mechanic
> moment per level, increasing pressure. Every claim below is labeled
> **HYPOTHESIS** (design intent, not yet seen in play) or **OBSERVED** (produced
> by `npm run validate` / the solver / `tests/unit/levels-hard.test.ts`, the
> cheapest deciding tests of skill §3). No human playtest has run yet: the
> playtest criteria below name the test that would decide each open question.

## Scope and loops (skill §1)

- **Core loop** fed: plan → execute → win/fail → retry. Each hard heist adds
  one decision to the planning step (time a laser, sync a camera with a laser,
  thread a triple crossing, spend a chain of pauses) without changing the loop.
- **Meta loop** untouched: hard levels are catalog content (`hard/hN` in
  `levels/levels.json`, visible in `/dev/viewer`); they do not alter the daily
  heist, streak or archive. Motivation fed: **competence** (par/stars against a
  readable threat) and **autonomy** (the player's own timing plan).
- **Scope guard**: Gate 1 perimeter respected — no editor, no doors/switches,
  type stays `normal` (`YapLevelType` has no `hard`); h10 carries a non-empty
  `moment` but stays `normal`, like X6's m10.

## The hard band (pinned by `tests/unit/levels-hard.test.ts`)

`par` 25–34 (daily d7 = 30 was the previous max; h6 = 34 is the new ceiling),
exactly **3 guards**, **1–2 cameras**, **0–1 laser**, `maxPauses` 3, standard
8×12 map with one S / L / E, every patrol, camera and laser period dividing 24,
start not seen at tick 0, solvable within 64 ticks. **OBSERVED**: all 10 levels
pass `npm run validate` and the 64 unit assertions.

## Observed solver numbers (free check, `npm run validate` + solver)

| Level | Name | par | minPauses | optimalPlans | tension | guards | cameras | lasers |
|---|---|---|---|---|---|---|---|---|
| hard/h1 | Laser Gate | 29 | 2 | 1000 | 15 | 3 | 1 | 1 |
| hard/h2 | Blind Crossing | 27 | 3 | 36 | 14 | 3 | 1 | 1 |
| hard/h3 | Triple Cross | 29 | 0 | 1000 | 14 | 3 | 1 | 0 |
| hard/h4 | Chain Reaction | 29 | 3 | 216 | 16 | 3 | 1 | 0 |
| hard/h5 | Gauntlet | 27 | 3 | 416 | 11 | 3 | 1 | 1 |
| hard/h6 | The Longest Night | 34 | 2 | 112 | 12 | 3 | 1 | 0 |
| hard/h7 | Roundabout Redux | 29 | 2 | 1000 | 13 | 3 | 1 | 0 |
| hard/h8 | Two Eyes | 32 | 1 | 1000 | 19 | 3 | 2 | 0 |
| hard/h9 | Long Haul | 31 | 3 | 393 | 15 | 3 | 1 | 1 |
| hard/h10 | The Vault | 31 | 3 | 384 | 17 | 3 | 2 | 1 |

`par` = solver par = declared par for all 10 (**OBSERVED**). The golden plan of
every laser level except h5 steps on a laser cell (pinned by test; h5's laser
sits mid-corridor and the canonical plan dashes around it — the corridor pin
covers it). h3's three guards are pairwise crossing (every pair shares a route
cell, pinned); h7's loop guard shares cells with the pingpong patrol (pinned);
h8 has exactly 2 cameras (pinned); h10 has a non-empty `moment` with type
`normal` (pinned); h6 pins par ≥ 33 (OBSERVED 34, the ceiling of the band).

## The 10 levels — mandatory 4-field proposals

### h1 — "Laser Gate" (teach: laser timing)

1. **Game intention** — HYPOTHESIS: the player reads the laser's on/off cycle
   (on 4, off 8, period 12) and crosses the only wall gap exactly on an off
   tick, feeling the timing rather than brute-forcing it.
2. **Expected solution** — OBSERVED: the wall column x=3 has a single gap at
   (3,6) carrying laser l1; the golden plan (par 29) steps on (3,6) on an off
   tick and spends 2 pauses (minPauses = 2, pinned) syncing with camera c1 and
   guard g1's sweep of row 6.
3. **Possible failure modes** — HYPOTHESIS: if the off window at the gap is
   too narrow the level feels "unsolvable" (the F3 d4 lesson); the gap cell is
   also watched by g1 at some ticks, so a mistimed cross is punished twice.
   Mitigation: 1000 optimal plans — many safe timings.
4. **Playtest criterion** — solver/validator + unit test green (OBSERVED); the
   deciding test is the 2-person playtest on the PR preview (390×844): keep if
   both testers cross the gap on an off beat within 3 attempts without a hint.

### h2 — "Blind Crossing" (practice: camera + laser on the same gap)

1. **Game intention** — HYPOTHESIS: the player must hold two cycles in mind at
   once — the camera's 6/6 look-away and the laser's 4/8 off beat — and cross
   only when both are open.
2. **Expected solution** — OBSERVED: gap (1,5) carries laser l1 and is watched
   by camera c1 (at [0,5], dirs [E,S], hold 6) for 6 of 12 ticks; the loot is
   at (6,1), so the route takes it first and comes back west to the gap. The
   golden plan (par 30) spends 2 pauses (minPauses = 2, pinned) and steps on
   the laser cell while both are open.
3. **Possible failure modes** — HYPOTHESIS: the spare pause gives some slack,
   but one wasted tick can still miss the shared window; watch for "I had no
   pauses left" frustration in playtests.
4. **Playtest criterion** — unit test pins 1 camera + 1 laser + minPauses ≥ 2
   (OBSERVED); playtest: keep if testers clear it in ≤ 4 attempts and describe
   the double timing.

### h3 — "Triple Cross" (test: three guards crossing)

1. **Game intention** — HYPOTHESIS: the knot where three patrols meet is the
   memorable moment; the player threads it on the one tick all three cones are
   open.
2. **Expected solution** — OBSERVED: g1 (row 6), g2 (column 5) and g3 (a 4-cell
   loop) pairwise share route cells — (5,6) for g1∩g2, (5,5)/(5,6) for g2∩g3,
   (5,6) for g1∩g3 (pinned by test); the golden plan (par 29, tension 14)
   threads the knot with no pause needed (minPauses = 0).
3. **Possible failure modes** — HYPOTHESIS: three cones around one cell can
   read as chaotic; the camera c1 sweeping E/W across the middle adds a fourth
   rhythm. If playtests show noise rather than tension, drop c1's range first.
4. **Playtest criterion** — unit test pins the pairwise crossings (OBSERVED);
   playtest: keep if testers name the crossing as the moment they remember.

### h4 — "Chain Reaction" (test: pause chain)

1. **Game intention** — HYPOTHESIS: the player learns that pauses are a
   resource to spend in sequence — wait out the corridor sweep, then the
   camera — and feels in control of a long chain of beats.
2. **Expected solution** — OBSERVED: the one-cell corridor row 4 is swept
   end-to-end by g1 and its exit is watched by camera c1; the loot is at (3,9)
   and g3 patrols (1,10)-(3,10) under it, so the way back to the exit along
   row 10 opens only behind the guard. The golden plan (par 25) spends all 3
   pauses (minPauses = 3, pinned ≥ 2), the chain.
3. **Possible failure modes** — HYPOTHESIS: minPauses = 3 = maxPauses again —
   no slack; a player who pauses "just in case" early is punished. The pause
   badges must read clearly (UI-DESIGN compact `⏸ 3`).
4. **Playtest criterion** — unit test pins minPauses ≥ 2 (OBSERVED); playtest:
   keep if the pause chain is discovered without a hint (watch first two
   attempts).

### h5 — "Gauntlet" (test: corridor under sweep + laser)

1. **Game intention** — HYPOTHESIS: the corridor between two walls feels like
   a gauntlet; the player dashes it at the far gap on the tick the sweep is at
   the other end and the beam is off.
2. **Expected solution** — OBSERVED: rows 3 and 5 are walls with gaps at x=1
   and x=6, so corridor row 4 is the only passage; laser l1 covers (3,4),(4,4)
   mid-corridor (pinned: laser row between two wall rows) and g1 sweeps the
   corridor; the loot is at (3,9) above g3's patrol (1,10)-(3,10). The golden
   plan (par 25) spends 3 pauses (minPauses = 3, pinned).
3. **Possible failure modes** — HYPOTHESIS: the laser mid-corridor plus the
   sweep can make the middle of the corridor a death zone; the canonical plan
   dashes via the west gap — if playtests show players dying mid-corridor
   repeatedly, widen the laser off window (off 8 → off 12? no: period must
   divide 24 — off 16, on 8).
4. **Playtest criterion** — unit test pins corridor + laser + minPauses ≥ 2
   (OBSERVED); playtest: keep if testers find the gaps within 3 seconds and
   cross without two consecutive deaths.

### h6 — "The Longest Night" (test: very tight par)

1. **Game intention** — HYPOTHESIS: the serpentine route (three walls,
   alternating gaps) makes every tick count; par 34 with no slack is the
   pressure peak of the set.
2. **Expected solution** — OBSERVED: walls at rows 2 (gap x=6), 5 (gap x=1)
   and 8 (gap x=6) force a ~32-tick route; the golden plan (par 34, the
   ceiling of the band, pinned ≥ 33) spends 2 pauses (minPauses = 2); 112
   optimal plans.
3. **Possible failure modes** — HYPOTHESIS: with par at the ceiling, a single
   mistimed tick can feel unfair; the guards are placed on rows the route
   crosses once, not stacked on the loot, to keep it fair.
4. **Playtest criterion** — unit test pins par ≥ 33 (OBSERVED); playtest: keep
   if testers reach the loot and report the length as "tense but fair".

### h7 — "Roundabout Redux" (practice: loop + pingpong combined)

1. **Game intention** — HYPOTHESIS: the player reads the loop guard's
   direction (it never turns around) while a pingpong patrol shares its cells,
   and slips through the cell the loop just left.
2. **Expected solution** — OBSERVED: g1 loops a 12-cell ring around the
   central block (period 12) and shares (2,6)…(5,6) with pingpong g2 on row 6
   (pinned: a loop guard shares a cell with a pingpong guard); the golden plan
   (par 29) threads the ring's inner cells with 2 pauses (minPauses = 2).
3. **Possible failure modes** — HYPOTHESIS: loop vs pingpong is subtle; the
   camera c1 rotating N/E adds a third rhythm. If players brute-force it,
   tighten the loop's range instead of adding a guard (skill: prefer moving a
   guard).
4. **Playtest criterion** — unit test pins loop+pingpong sharing (OBSERVED);
   playtest: keep if testers verbalize "it keeps circling" before their first
   clear.

### h8 — "Two Eyes" (test: double camera)

1. **Game intention** — HYPOTHESIS: two cameras covering different rows force
   the player to time two independent away windows — a reading workout.
2. **Expected solution** — OBSERVED: c1 at [4,4] (dirs [N,E], hold 6) covers
   the upper middle, c2 at [0,8] (dirs [E,S], hold 12, range 4) covers row 8;
   exactly 2 cameras (pinned); the golden plan (par 32, tension 19 — the
   highest of the set) spends 1 pause.
3. **Possible failure modes** — HYPOTHESIS: two violet cones can feel noisy;
   tension 19 says the plan grazes cones constantly — if playtests show
   "always watched" frustration, lengthen c2's away window (hold 12 → 8/16).
4. **Playtest criterion** — unit test pins 2 cameras (OBSERVED); playtest:
   keep if testers clear it in ≤ 4 attempts and can name both cameras' rhythms.

### h9 — "Long Haul" (test: long route + laser)

1. **Game intention** — HYPOTHESIS: the long forced route (two walls, opposite
   gaps) plus a laser on the second gap makes the player plan the whole run
   before pressing PLAY.
2. **Expected solution** — OBSERVED: walls at rows 5 (gap x=1) and 8 (gap
   x=6) force the long way round, with the loot at (6,1) before the first
   gap; laser l1 sits on the (6,8) gap and the golden plan (par 31, pinned
   ≥ 29) steps on it on an off beat, spending 3 pauses (minPauses = 3).
3. **Possible failure modes** — HYPOTHESIS: long route + laser + camera can
   stack into "too much at once"; the guards are on rows 3/7/10, off the loot.
4. **Playtest criterion** — unit test pins 1 laser + par ≥ 29 (OBSERVED);
   playtest: keep if testers reach the loot before being caught and call it
   "long but fair".

### h10 — "The Vault" (signature hard, type stays `normal`)

1. **Game intention** — HYPOTHESIS: a "signature hard" moment — take the loot
   first, thread the patrols, then cross the laser gap on the off beat while
   both cameras look away; the non-empty `moment` sentence announces it.
2. **Expected solution** — OBSERVED: laser l1 on gap (6,8), camera c1 watching
   gap (1,5), camera c2 watching the right side; 3 guards on rows 3/7/10; the
   loot is at (6,1); the
   golden plan (par 31, tension 15) steps on the laser cell and spends 3 pauses
   (minPauses = 3). Type `normal`, moment non-empty, 2 cameras + 1 laser
   (all pinned).
3. **Possible failure modes** — HYPOTHESIS: the densest hard level (3 guards +
   2 cameras + 1 laser); if playtests read it as chaotic rather than tense,
   drop c2's range instead of removing it.
4. **Playtest criterion** — unit test pins moment + type + 2 cameras + 1 laser
   (OBSERVED); playtest: keep if testers quote the moment sentence back after
   clearing.

## Open questions → cheapest deciding test (skill §3)

1. *Do the hard levels feel fair (not "unsolvable") to humans?* → 2-person
   playtest on the PR preview build (phone 390×844), protocol
   `docs/feel/session-*.md`; decide keep/retune per level. HYPOTHESIS until then.
2. *Are the minPauses = 3 levels (h2, h4, h5, h9, h10) too brittle with
   maxPauses = 3?* → same playtest, watch whether testers run out of pauses.
   HYPOTHESIS until then.
3. *Is h6's par 34 (band ceiling) too tight?* → solver number already OBSERVED
   (112 optimal plans); playtest decides whether to widen (move a guard) or
   keep.
4. *Do the levels read in 3 seconds (UI-DESIGN)?* → screenshot review of the
   PR preview at 390×844 and 360×640, tick-0 cones + ghost preview at tick 8.
