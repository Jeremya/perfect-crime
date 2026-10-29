# Nomenclature — Yap Corp

**Yap Corp** is the studio. **Perfect Crime** is the game (displayed name,
unchanged — it is a product decision, not a code identifier). The old folder
name `unix` is dead: it must not appear anywhere in the code, configs or docs.

## Rules

| What | Convention | Example |
|---|---|---|
| TS classes, interfaces, types | `Yap` prefix, PascalCase | `YapBootScene`, `YapLevel`, `YapSim`, `YapSolver`, `YapPayload` |
| Brand constants | `YAP_CORP` object in `src/app/brand.ts`; SCREAMING_SNAKE for loose constants | `YAP_CORP.vendor` |
| Phaser scene keys | `yap-<name>` | `'yap-boot'` |
| localStorage / IndexedDB keys | prefix `yapcorp:` (replaces the spec's `pc1:`) | `yapcorp:profile`, `yapcorp:days` |
| npm package | scoped `@yapcorp/perfect-crime` | `package.json` `name` |
| Analytics | vendor `yap-corp`; every event through `track()` | `track('yap.win', …)` |
| Cloudflare Pages project | `yap-corp-perfect-crime` | `.github/workflows/ci.yml` |
| Meta tags | `author` = `Yap Corp`, `data-studio="yap-corp"` | `index.html` |
| Files | kebab-case, unchanged | `src/game/level-scene.ts` |
| Directories | unchanged (`src/core`, `src/game`, `src/app`, `levels`, `tests`, `tools`) | — |
| Git branches | `<story-id>-<slug>` lowercase | `b2-simulation` |
| PR titles | `[<STORY>] <title>` | `[B2] Simulation` |
| Subagents (`.vibe/agents/`) | `yap-*` | `yap-core`, `yap-game`, `yap-app`, `yap-content` |
| Task files | `tasks/<STORY>.md` | `tasks/B2.md` |

## Why a prefix on classes

The game, the solver, the dev viewer and `tools/validate.ts` all import the
same modules. A `Yap` prefix makes it obvious at a glance that a symbol is
ours (not Phaser's, not a dependency's) and keeps autocomplete grouped.

## What does NOT change

- The player-facing game name: **Perfect Crime** (`<title>`, store listing).
- The public URL paths (`/c/1`…`/c/7`, `/dev/viewer`).
- Level file format (`.lvl`) — content spec, not code.
