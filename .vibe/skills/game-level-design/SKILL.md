---
name: game-level-design
description: Load when designing, reviewing or playtesting game mechanics, levels, difficulty or the overall player experience of Perfect Crime (Gate 1) — core loop, motivation, progression, puzzle/level design, evidence-based design review, and browser playtests on the PR preview builds.
---

# Game & level design — Perfect Crime (Yap Corp)

Methods of work for design questions on this repo. This skill is about **how
to design and how to prove**, not what to build. Sources of truth: the Gate 1
spec PDF (rules and product scope), `docs/UI-DESIGN.md` (visual direction and
readability), `docs/design/experience.md` (current experience audit),
`tasks/README.md` (backlog and waves).

## 1. Fundamentals — apply to every proposal

- **Core loop / meta loop**: name both. Core = plan → execute → win/fail →
  retry. Meta = daily heist, streak, archive, challenge links. A change must
  improve one loop without breaking the other.
- **Motivation**: autonomy (the player's own plan), competence (mastery
  visible via par/stars), stakes (guards read clearly). Ask which of the three
  a proposal feeds.
- **Progression & difficulty**: one new idea per level, increasing pressure
  (more guards, tighter cones, lasers), never two new things at once. The
  solver's `par` and `tension` (`src/core/solver.ts`) are the objective
  difficulty references.
- **Scope guard**: Gate 1 perimeter is fixed — no editor, ads, purchases,
  accounts, leaderboards, notifications, native apps, doors/switches, server.
  A proposal outside it is rejected, not adapted.

## 2. Level / puzzle design method — teach → practice → test

Every level (tutorial t1–t5, daily d1–d7) must follow the same spine:

1. **Teach**: introduce exactly ONE mechanic (or one constraint) with no
   competing threat. T1 = draw a route; T4 = the pause, etc.
2. **Practice**: 2–3 repetitions where the player uses it while something
   mild distracts (a far guard).
3. **Test**: the mechanic is required to win, under real pressure (cone
   sweeping the route, camera timing).

Rules of thumb: solvable is enforced by `npm run validate` (solver + patrol
periods dividing 24); the golden traces in `tests/` pin the intended solution;
a level whose optimal plan needs a hint is too hard — adjust the level, not the
player. Prefer moving a guard over adding one.

## 3. Evidence-based review — hypotheses vs observed

- Label every claim **HYPOTHESIS** (design intent, not yet seen) or **OBSERVED**
  (seen in a playtest, a capture, analytics). Never present a hypothesis as a
  result.
- For every open question, pick the **cheapest test that decides**, in this
  order:
  1. Solver/validator check (`npm run validate`, par & tension numbers) — free.
  2. Unit test of the pure model (`tests/unit/`) — free.
  3. e2e on the built app (`tests/e2e/`, Playwright, stubbed share) — minutes.
  4. Screenshot review of the PR preview URL (layout, gestures, transitions,
     readability) — minutes.
  5. Human playtest (warm tester, `docs/feel/session-*.md` protocol) — the most
     expensive; use only when 1–4 cannot decide.
- State the result as: question → test → observed → decision (keep / change /
  drop).

## 4. Browser playtest protocol (PR preview builds)

- URL: the Cloudflare Pages preview of the PR
  (`https://<hash>.yap-corp-perfect-crime.pages.dev`) or prod; phone viewport
  390 × 844 and 360 × 640.
- Drive the real gestures: draw a route (drag), tap (pause), PLAY, Share.
- Capture screenshots at each screen transition; check against the
  non-negotiable readability rules of `docs/UI-DESIGN.md` (exact-cell cones,
  non-color-only cues, contrast, touch targets ≥ 44 px).
- Record findings in `docs/feel/session-<n>.md` (severity S1–S4) or
  `docs/share-matrix.md` for share flows.

## 5. Mandatory proposal format — 4 fields

Every design proposal (mechanic, level change, UX change) must be written with:

1. **Game intention** — the feeling or decision the player should have.
2. **Expected solution / behavior** — what the game does, concretely.
3. **Possible failure modes** — how it can frustrate, confuse or break.
4. **Playtest criterion** — the cheapest test from §3 that would prove or
   disprove the intention, and what result means "keep".

A proposal without all four fields is not ready for review.
