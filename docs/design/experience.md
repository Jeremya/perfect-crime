# Perfect Crime — Global experience design (post-Gate-1 depth pass)

> **Status: proposal.** Anchored in the merged code on `main`. Nothing here
> changes the Gate 1 spec; the star rule in particular is fixed by the spec
> and is only made *visible* below. Each proposal is cut as a task at the end.

## 1. Audit of the current experience

### 1.1 The core loop (as built)

```
Home (D2) → Planning: draw the route (C2) → PLAY → Execution playback (C3)
  → Win screen (C5: attempts, ticks vs par, stars, emoji line, Share)
  → or Failure replay (C4) → back to Planning
```

- **Meta loop**: one daily heist per day for 7 days (D1), streak 🔥, archive of
  past days (O1), challenge links between players (E4).
- **Rewards today**: stars on the Win screen (C5), emoji line in the share
  (E2), hints as dotted ghost path after 3 then 6 failures (C7), ghost preview
  of threats at the finger cell while drawing (C6, flag `ghost`, on by default).
- **Anchors**: `src/game/level-scene.ts` (planning + execution chrome),
  `src/game/win.ts` (pure win model), `src/game/home-scene.ts` (Home + archive),
  `src/app/daily.ts` (day records in `yapcorp:days`).

### 1.2 What already works (keep)

- Plan-then-execute is legible: the drawn path *is* the plan, the playback
  replays exactly what was drawn (C3), failure replay shows the cause (C4).
- The ghost preview (C6) already gives a "read the board before committing"
  moment while drawing.
- Stars are stored per day (`home-scene.ts` records `stars` from
  `win.yapStars()`), the Home card shows "cleared in N attempts with its stars".

### 1.3 Friction / gaps observed

- The star thresholds are **invisible until the Win screen**: the player does
  not know that 3★ = par, 2★ ≤ ⌊par × 1.2⌋ while playing. No score-chasing
  target during planning.
- No **global star count** anywhere (Angry Birds' map total): Home shows the
  day card, the archive (O1) lists past days, but there is no "★ x / 21".
- No **trajectory preview of the full plan** before pressing PLAY: C6 shows
  threats at the finger cell, C7 reveals the optimal path only after failures.
  The Angry Birds "dotted arc" moment — *see the whole flight before letting
  go* — does not exist yet.
- No **gestural undo**: correcting a route means Clear + redraw (or tapping
  cells back). Angry Birds lets you pull back; here there is no "pull back".
- Star gain on the Win screen is static text (`★`/`☆` glyphs), no ceremony.

## 2. Benchmark: what makes Angry Birds' loop work

Five mechanics, in order of importance:

1. **Aim with a predicted trajectory** — you pull the bird back, a dotted arc
   shows the whole flight *before* release. Anticipation is the fun; the launch
   is only the confirmation.
2. **Readable consequences** — physics are simple and legible; you understand
   instantly why you failed (angle, power, structure).
3. **1–3 stars per level with visible thresholds** — stars are awarded on score
   bands, shown on the level map, and summed into a global total. Replaying a
   level is *score-chasing*, not punishment.
4. **Instant retry** — the restart button is one tap; failure costs nothing but
   pride, so you try again immediately.
5. **Progressive map** — levels unlock one by one, stars decorate the path, the
   map *is* the progress report.

## 3. Transposition to Perfect Crime

| Angry Birds | Perfect Crime today | Proposal |
|---|---|---|
| Dotted trajectory arc before release | Ghost threats at the finger cell (C6); optimal path only via hints (C7) | **Plan preview**: a "Preview" button (and auto-pulse after the route reaches the exit) replays the drawn plan as a ghost with threats at each tick — the full "flight" before PLAY |
| Pull back to cancel the shot | Clear + redraw | **Slingshot undo**: dragging back over the last segments erases them, like pulling the bird back |
| Stars with visible score bands | Rule exists (3★ = par, 2★ ≤ ⌊1.2·par⌋) but hidden until the Win screen | **Thresholds visible**: on the Home card and in the planning top bar ("3★ par N · 2★ ≤ M") |
| Star total on the map | None | **★ x / 21 on Home** (7 daily × 3★) + stars per day in the archive |
| One-tap retry | Failure replay (C4) + restart exist | Keep; make the Win screen's "Improve my score" the obvious next tap (already there) |
| Stars decorate the level map | Home card shows stars of the day; archive does not | **Stars in the archive rows** |

### 3.1 The Angry Birds mechanic to port: plan preview ("dotted arc")

In Angry Birds the dotted arc is *the* core pleasure: you see the entire
consequence of your aim before committing. In Perfect Crime the equivalent is
the drawn plan — but its *consequences* (where the guards will be at each tick)
are only visible cell-by-cell while drawing (C6), never for the whole plan at
once.

**Proposal — "Preview the plan"**: once the drawn route reaches the exit, a
secondary button (next to PLAY) replays the plan in fast ghost mode: the thief
moves along the route, and at each tick the guards/cameras/lasers and their
cones are drawn at that tick (exactly `YapGhostPreview.yapAt(tick)` +
`yapGhostCones`, the C6 machinery, reused). The player sees the whole "flight"
— including the tick where they get caught — then returns to planning with the
route kept, or presses PLAY for real. This is anticipation without spoiling:
the preview is the player's own plan, not the solution (hints C7 stay the only
reveal of the *optimal* path).

Cost: medium (reuse of `ghost.ts` + a playback mode in `execution.ts`).
Risk: could reduce the sting of failure — mitigate by making preview a
*toggle* (`?flag=preview:`), default on, and by keeping failure replay (C4).

### 3.2 Slingshot undo

Dragging the finger back over the last drawn segments erases them one by one
(the path shrinks from the end), like pulling the bird back in the slingshot.
Pure input change in `path-input.ts`; no rule change.

## 4. Star system per level — detailed spec

### 4.1 Rule (Gate 1 spec, unchanged)

From `src/game/win.ts` (`YAP_STAR_THRESHOLD = 1.2`):

- **3★** — winning plan length == `par` (the solver's minimum ticks, pauses
  included);
- **2★** — ticks ≤ ⌊par × 1.2⌋;
- **1★** — any win above that.

Attempts never reduce stars; hints never reduce stars (they add a 💡 to the
share line instead). Replaying after a win can improve ticks/stars, never
attempts. Archive replays (mode `archive`) never touch the day record.

### 4.2 Storage (already merged)

`yapcorp:days` day record: `{ attempts, ticks, stars, par, plan }` — the best
win is kept (best ticks ⇒ best stars), written by `recordYapDailyWin`
(`src/app/daily.ts`), read sanitised on load.

### 4.3 Visibility (the actual work)

| Surface | Today | Proposal |
|---|---|---|
| Win screen (C5) | ★★☆ glyphs + ticks vs par | Keep + **fill animation** (stars light up one by one with a tick sound, C8) |
| Home daily card (D2) | "cleared in N attempts with its stars" | Keep + **thresholds**: "3★ = par 22 · 2★ ≤ 26" |
| Home header | streak 🔥 | Add **★ x / 21** total (sum of best stars over the 7 days) |
| Archive (O1) | list of past days | Add **stars per row** (★ count from the day record) |
| Planning top bar (C1 chrome) | ticks, par, pauses | Show **current 3★/2★ thresholds** so the player can chase them while drawing |
| Tutorial t1–t5 | win screen shows stars | Stars shown, but **excluded from the /21 total** (total = test week only) |

### 4.4 Why this shape

Angry Birds' stars work because the target is *visible before* the attempt and
the total makes replay meaningful. Perfect Crime already has the rule and the
storage; what is missing is exactly that visibility (thresholds + total +
archive decoration). No spec change, pure UX.

## 5. Task cut (for the next wave)

| ID | Task | Ownership | Size |
|---|---|---|---|
| X1 | Star thresholds on Home card + planning top bar | `src/game/home-scene.ts`, `src/game/level-scene.ts`, `src/app/i18n/*`, tests | S |
| X2 | ★ total on Home + stars in archive rows | `src/game/home-scene.ts`, `src/app/daily.ts`, i18n, tests | S |
| X3 | Plan preview ("dotted arc") behind `?flag=preview:` | `src/game/level-scene.ts`, `src/game/execution.ts`, `src/game/ghost.ts`, i18n, tests | M |
| X4 | Slingshot undo gesture (drag back erases) | `src/game/path-input.ts`, `src/game/level-scene.ts`, tests | M |
| X5 | Star gain animation on Win screen | `src/game/level-scene.ts` (win overlay), `src/game/win.ts` (pure timing model), tests | S |

Order: X1 + X2 first (cheap, high visibility), then X3 (the Angry Birds
mechanic), X4, X5. X3 is the one to playtest in H3 (feel session #2) with the
flag on/off.
