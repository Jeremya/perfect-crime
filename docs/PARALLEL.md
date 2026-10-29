# Working with several agents in parallel

Goal: run multiple coding agents at the same time on Gate 1 without them
stepping on each other. The design rests on three things, all set up in this
repo:

1. **Atomic tasks** — `tasks/<ID>.md`, each with a strict *ownership* list
   (the only files that agent may touch). See `tasks/README.md` for the
   dependency waves.
2. **Isolation** — one git worktree + one branch per agent. Never two agents
   in the same checkout.
3. **Role profiles** — `.vibe/agents/yap-*.toml` subagents so each worker
   starts with the right rules (core determinism, i18n, storage prefix…).

## Option A — several Vibe sessions, one worktree each (recommended)

From the repo root, one terminal per agent:

```bash
# agent 1 picks B2, agent 2 picks C1 (same wave, disjoint files)
git worktree add ../game-perfect-crime-b2 -b b2-simulation
cd ../game-perfect-crime-b2 && vibe -p "Implement tasks/B2.md (read AGENTS.md first)"

git worktree add ../game-perfect-crime-c1 -b c1-rendering
cd ../game-perfect-crime-c1 && vibe -p "Implement tasks/C1.md (read AGENTS.md first)"
```

Or let Vibe manage the worktree (under `~/.vibe/worktrees`, auto-cleanup):

```bash
vibe --worktree b2-simulation -p "Implement tasks/B2.md (read AGENTS.md first)"
vibe --worktree c1-rendering  -p "Implement tasks/C1.md (read AGENTS.md first)"
```

Each session: implement → run the full local check → push branch → open PR
`[B2] Simulation`. CI must be green. A human merges; then the other
worktrees `git fetch && git rebase origin/main` (or recreate the worktree
from the new `main`).

## Option B — one orchestrator session spawning subagents

From a single Vibe session in the repo root, spawn one child per task with a
role profile:

```ts
await tools.agents.spawn({
  name: 'b2',
  config_name: 'yap-core',
  message: 'Implement tasks/B2.md on branch b2-simulation. Read AGENTS.md, docs/NAMING.md and your task file first. Ownership: src/core/sim.ts, tests/unit/sim.test.ts only. Tests first; run the full local check; open PR "[B2] Simulation".',
});
await tools.agents.spawn({
  name: 'c1',
  config_name: 'yap-game',
  message: 'Implement tasks/C1.md on branch c1-rendering. Read AGENTS.md, docs/NAMING.md and your task file first. Ownership: src/game/level-scene.ts, render.ts, board.ts, src/main.ts only. Open PR "[C1] Rendering".',
});
// then: tools.agents.list() to watch, tools.agents.send_message('/root/b2', '...') to steer
```

Children run concurrently, each with its own session. Use `agents.list()` to
check status, `agents.send_message()` to give follow-ups, `agents.interrupt()`
to stop one.

## Option C — headless batch (CI-style, no UI)

```bash
vibe --worktree b2-simulation --auto-approve -p "Implement tasks/B2.md ..."
```

Run several of these in separate terminals or background processes
(`tools.process.start`). Good for well-specified, low-risk tasks.

## Conflict rules (the important part)

- **Ownership is absolute**: an agent edits only the files listed in its
  `tasks/<ID>.md`. Shared files (`src/main.ts`, `AGENTS.md`, `package.json`)
  are touched by one task at a time — the wave table in `tasks/README.md`
  already serializes them.
- **Dependencies before parallelism**: never start a task whose "Depends on"
  PRs are not merged. The wave table gives the safe batches.
- **One branch per task**, named `<id>-<slug>`; PR title `[<ID>] <title>`.
- **Never merge your own PR** from an agent; CI + human review gate the merge
  into `main`.
- **Status lives in `tasks/<ID>.md`** (`To do` → `In progress` → `Done`), so
  agents can see what is claimed without talking to each other.
- If two PRs still collide on merge, the second one rebases and resolves —
  keep the diff minimal, never reformat files you don't own.

## Suggested first batch (wave 1–2)

- `H4` recruitment (PM, no code, runs alongside everything)
- `A2` (yap-app) and `A3` (yap-app) — disjoint files
- then `B1` (yap-core) and `G1` (yap-app)
