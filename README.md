# Perfect Crime — Gate 1 web prototype

A daily-heist stealth puzzle for mobile web: everyone gets the same heist each
day, you draw the thief's plan on a grid, press PLAY, and share your result in
one tap. Built to answer three questions on 20–30 warm testers: is the daily
heist fun, do people share it, do they come back? Gate 1 can only kill the
project; only Gate 2 (300+ cold players) authorizes the MVP.

Source documents (in this folder):

- `Quel jeu mobile casual construire — Dossier de décision.pdf` — why this game
  (market analysis, scorecard: Perfect Crime : Duel 6.65/10, plan B Daily
  Reflect, budget ≤ $1,000 and ~60 h to Gate 2, three gates, kill criteria).
- `Gate 1 — Specs and backlog.pdf` — the build spec: game rules, screens,
  technical architecture, 52 h backlog in 34 stories / 8 epics, test protocol.
- `docs/UI-DESIGN.md` — the visual companion spec: readability principles,
  visual tokens, mobile layouts, asset guidance, screen checklist, and design
  handoff deliverables. The PDF remains authoritative for rules and scope.

## Nomenclature — Yap Corp

The studio is **Yap Corp**; the game stays "Perfect Crime". Full rules in
`docs/NAMING.md`: every TS class is `Yap`-prefixed (`YapBootScene`…), brand
constants live in `src/app/brand.ts` (`YAP_CORP`), localStorage keys use the
`yapcorp:` prefix, the npm package is `@yapcorp/perfect-crime`, the Pages
project is `yap-corp-perfect-crime`. The old folder name `unix` is retired.

## Working with agents (tasks + parallelism)

- `AGENTS.md` — rules loaded automatically by every agent in this repo.
- `docs/UI-DESIGN.md` — required reading for UI, rendering, sharing-preview,
  and visual content tasks.
- `tasks/` — the Gate 1 backlog cut into 36 atomic task files (34 stories +
  2 optional), each with its own file ownership, dependencies and acceptance
  criteria. Index + dependency waves in `tasks/README.md`.
- `docs/PARALLEL.md` — how to run several agents at once: one worktree +
  branch per task, role subagents in `.vibe/agents/` (`yap-core`, `yap-game`,
  `yap-app`, `yap-content`), spawn examples.

## Stack

TypeScript (strict) + Phaser 4 (pinned) + Vite, Vitest, ESLint, Prettier.
Static hosting on Cloudflare Pages with one preview URL per PR. Analytics via a
PostHog adapter (EU-hosted), only after consent. No application server.

`src/core/` is a pure, deterministic simulation (integers only — no
`Math.random`, no `Date`, no floats; enforced by an ESLint rule). The game, the
solver, the viewer and `tools/validate.ts` all call the same `resolveTick`.

## Layout

```
src/
  core/     pure rules: level, sim, vision, solver, score, plan, daily, payload
  game/     Phaser: scenes, rendering, path drawing, effects
  app/      router, storage, analytics, consent, sharing, i18n, config
levels/
  tutorial/ t1.lvl … t5.lvl
  daily/    d1.lvl … d7.lvl
tools/      validate.ts, og.ts, gen.ts (optional)
tests/      unit, golden, payload, daily, e2e
public/     icons, sounds
```

## Commands

```
npm run dev        # local dev server
npm run build      # validate levels + production build to dist/
npm run test       # vitest (unit, golden, payload, daily, e2e)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (incl. core/ determinism rules)
npm run validate   # level validation CLI (CI gate)
```

## Build order (Gate 1 backlog, ~52 h)

One story = one branch = one PR titled `[B2] Simulation`, in dependency order:

1. **Week 1** — A1–A3 (tooling, config/storage, FR+EN strings), B1–B4 (level
   format, simulation, solver, validate CLI), then C1 (rendering). Core is
   tested before any polished rendering.
2. **Week 2** — C2–C8 (path drawing, execution, failure replay, win, ghost
   preview, hints, sounds), D1–D2 (daily loop, home), E1–E2 (payload, share),
   F1 (dev viewer); start recruitment (H4) in parallel.
3. **Week 3** — E3–E5 (challenge pages, link arrival, share matrix), G1–G3
   (analytics, consent, dashboard), F2–F3 (5 tutorials + 7 daily heists, 3
   signature), then feel sessions H1–H3.
4. **Week 4** — test week H5 (7 days, no reminders), day-8 decision H6.

Cut order if time slips: O2, O1, C8, second hint of C7. Never cut C2, C4, E2,
F3 or H1–H3.

## Guardrails (from the spec — never without approval)

- Never change a game rule outside `resolveTick` / `visibleCells`; a rule
  change goes through a failing test first.
- No randomness, clock or floats in `src/core/`.
- Never hand-edit generated files; edit `.lvl` files and rerun `validate`.
- No new dependency without justifying its weight (3 MB budget).
- All events go through `track()`; no personal data; no URL with its fragment.
- All displayed text lives in the FR/EN dictionaries.
- Out of scope at Gate 1: editor, ads, purchases, accounts, leaderboards,
  notifications, native apps, doors/switches, application server.

## Open decisions (defaults in the spec, to be confirmed by Jeremy)

Domain name, test-week start date (a Monday ~3 weeks in), displayed game name
("Perfect Crime", provisional), nickname in links (off by default), tester
groups, PM role, Poki Playtesting access.
