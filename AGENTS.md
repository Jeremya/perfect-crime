# AGENTS.md — Perfect Crime by Yap Corp

This file is loaded automatically by every Vibe agent working in this repo
(main session, parallel sessions, spawned subagents). Read it before writing
any code.

## 1. What this repo is

Gate 1 web prototype of **Perfect Crime**, a daily-heist stealth puzzle for
mobile web, built by **Yap Corp**. Spec: `Gate 1 — Specs and backlog.pdf`.
Stack: strict TypeScript + Phaser 4 + Vite, Vitest, ESLint, Prettier. Static
hosting, no server.

## 2. Nomenclature (mandatory)

Full rules in `docs/NAMING.md`. Summary:

- Every TS class/type gets the **`Yap` prefix**: `YapBootScene`, `YapSim`, …
- Brand constants live in `src/app/brand.ts` (`YAP_CORP`).
- localStorage keys: prefix `yapcorp:` (the spec's `pc1:` is retired).
- npm package: `@yapcorp/perfect-crime`. Pages project: `yap-corp-perfect-crime`.
- Phaser scene keys: `yap-<name>`. Files: kebab-case. Branches: `<id>-<slug>`.
- The displayed game name stays "Perfect Crime". The old folder name `unix`
  must never appear in code or docs.

## 3. How work is cut up

The backlog is split into **34 atomic task files** in `tasks/` (one per story
of the Gate 1 spec: A1–A3, B1–B4, C1–C8, D1–D2, E1–E5, F1–F3, G1–G3, H1–H6,
O1–O2). `tasks/README.md` has the index, the dependency graph and the
parallel waves.

**One task = one branch = one PR** titled `[<ID>] <title>` (e.g. `[B2] Simulation`).

Before coding, read your task file `tasks/<ID>.md`. It lists:

- the **ownership**: the exact files you may create/edit. Never touch files
  owned by another task — that is how parallel agents avoid conflicts;
- the acceptance criteria from the spec;
- the definition of done.

For any screen, rendering, interaction, sharing-preview, or level-content
visual work, also read `docs/UI-DESIGN.md`. It is the source of truth for the
Gate 1 visual direction, readability rules, layout constraints, asset limits,
and visual review checklist. The Gate 1 PDF remains the source of truth for
game rules, screen behavior, and product scope.

## 4. Guardrails (from the spec — never without approval)

- Game rules live only in `resolveTick` / `visibleCells` (`src/core/`). A rule
  change goes through a failing test first.
- `src/core/` is pure and deterministic: **no `Math.random`, no `Date`, no
  `performance.now`, no floats** (enforced by ESLint).
- Never hand-edit generated files (`levels.json`); edit `.lvl` files and rerun
  `npm run validate`.
- No new dependency without justifying its weight (3 MB budget).
- All analytics events go through `track()`; no personal data; no URL with its
  fragment.
- All displayed text lives in the FR/EN dictionaries (`src/app/i18n/`).
- UI must follow `docs/UI-DESIGN.md`: exact-cell visibility overlays, neutral
  environment, non-color-only danger cues, mobile portrait layout, and the
  3 MB initial-download budget.
- Out of scope at Gate 1: editor, ads, purchases, accounts, leaderboards,
  notifications, native apps, doors/switches, application server.

## 5. Workflow (including parallel agents)

See `docs/PARALLEL.md` for the full playbook. The short version:

1. Pick a task whose dependencies are merged (`tasks/README.md` waves).
2. Work in an isolated **git worktree** on branch `<id>-<slug>` (one worktree
   per agent — never two agents in the same checkout).
3. Tests first, then code. Verify locally before pushing:
   `npm run typecheck && npm run lint && npm run test && npm run validate && npm run build`
4. Open one PR per task. CI (typecheck, lint, tests, validate, build) must be
   green; UI stories also need the preview URL checked on a real phone.
5. Never merge your own PR into `main` from an agent session; a human reviews.

## 6. Parallel agents

- Spawn role-specific subagents with `config_name` `yap-core`, `yap-game`,
  `yap-app` or `yap-content` (profiles in `.vibe/agents/`), or run several
  independent Vibe sessions, each in its own worktree.
- Each agent works only on its own task file and its own branch/worktree.
- Coordinate through `tasks/README.md` (status column), not through shared
  files.
