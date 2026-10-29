// Draft level generator (story O2) — produces draft .lvl levels, filtered by
// par and tension, to speed up F3 authoring ("drawn by hand, possibly from a
// generator draft", Gate 1 spec, Content section).
//
// Usage:
//   tsx tools/gen.ts [--seed N] [--count N] [--par-min N] [--par-max N]
//                    [--tension-min N] [--tension-max N] [--entities N]
//                    [--attempts N] [--out DIR]
//
// With no --out, the accepted drafts are printed to stdout as .lvl sources
// (each preceded by a `#` comment header with its metrics); with --out DIR,
// one draft-<seed>-<index>.lvl file per draft is written to DIR. Metrics and
// rejection counters go to stderr.
//
// Every accepted draft is emitted only after its serialized source has been
// round-tripped through the strict parser (src/core/level.ts) and accepted by
// validateLevelSource (tools/validate.ts) — the exact checks behind
// `npm run validate` — and its par/tension come from the solver
// (src/core/solver.ts). A draft is kept only when its solver par is within
// [parMin, parMax] and its tension within [tensionMin, tensionMax].
//
// Deterministic: all randomness comes from a seeded PRNG (YapPrng, mulberry32);
// never Math.random, never the clock. Same seed + same options => same drafts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  parseLevel,
  YAP_GRID_HEIGHT,
  YAP_GRID_WIDTH,
  YAP_MAX_PAUSES,
  YAP_MAX_TICKS,
  type YapCamera,
  type YapCell,
  type YapDir,
  type YapGuard,
  type YapLaser,
  type YapLevel,
} from '../src/core/level';
import { solveLevel, YapSolverError, type YapSolveResult } from '../src/core/solver';
import { validateLevelSource } from './validate';

// ---------------------------------------------------------------------------
// Options and results
// ---------------------------------------------------------------------------

export interface YapDraftOptions {
  readonly seed: number;
  /** How many accepted drafts to produce. */
  readonly count: number;
  /** Keep drafts whose solver par is within [parMin, parMax]. */
  readonly parMin: number;
  readonly parMax: number;
  /** Keep drafts whose solver tension is within [tensionMin, tensionMax]. */
  readonly tensionMin: number;
  readonly tensionMax: number;
  /** Maximum entities (guards + cameras + lasers) per draft; capped at 4 (quality bar). */
  readonly maxEntities: number;
  /** Maximum candidates to try before giving up. */
  readonly maxAttempts: number;
}

export const YAP_GEN_DEFAULTS: YapDraftOptions = {
  seed: 1,
  count: 5,
  parMin: 8,
  parMax: 32,
  tensionMin: 1,
  tensionMax: YAP_MAX_TICKS,
  maxEntities: 3,
  maxAttempts: 600,
};

/** One accepted draft: the .lvl source plus its solver metrics. */
export interface YapDraft {
  readonly seed: number;
  /** 1-based index of the candidate that produced this draft. */
  readonly index: number;
  readonly source: string;
  readonly level: YapLevel;
  readonly par: number;
  readonly tension: number;
  readonly optimalPlans: number;
  readonly minPauses: number;
}

export interface YapGenStats {
  readonly attempts: number;
  readonly accepted: number;
  readonly rejectedShape: number;
  readonly rejectedParse: number;
  readonly rejectedInvalid: number;
  readonly rejectedUnsolvable: number;
  readonly rejectedPar: number;
  readonly rejectedTension: number;
}

export interface YapGenResult {
  readonly drafts: readonly YapDraft[];
  readonly stats: YapGenStats;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — the only source of randomness in this tool
// ---------------------------------------------------------------------------

export class YapPrng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next uint32 in [0, 2^32). */
  nextUint(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Next float in [0, 1). */
  float(): number {
    return this.nextUint() / 4294967296;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (n <= 0) throw new Error(`YapPrng.int: n must be > 0, got ${n}`);
    return Math.floor(this.float() * n);
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    const v = arr[this.int(arr.length)];
    if (v === undefined) throw new Error('YapPrng.pick: empty array');
    return v;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }
}

// ---------------------------------------------------------------------------
// Candidate construction
// ---------------------------------------------------------------------------

const DIRS: readonly YapDir[] = ['N', 'E', 'S', 'W'];
const DIR_VECTORS: Readonly<Record<YapDir, YapCell>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** Pingpong route lengths whose period 2*len-2 divides YAP_TICK_PERIOD (24). */
const PINGPONG_LENGTHS: readonly number[] = [2, 3, 4, 5, 7];
/** Loop rectangles (w, h) whose perimeter 2*(w+h) divides 24. */
const LOOP_RECTS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 2],
  [2, 1],
  [1, 3],
  [3, 1],
  [2, 2],
  [2, 4],
  [4, 2],
  [3, 3],
  [1, 5],
  [5, 1],
];
/** Camera holds per direction count, so that hold * dirs.length divides 24. */
const CAMERA_HOLDS: Readonly<Record<number, readonly number[]>> = {
  1: [1, 2, 3, 4, 6, 8, 12, 24],
  2: [1, 2, 3, 4, 6, 12],
  4: [1, 2, 3, 6],
};
/** Laser (on, off) cycles whose period on+off divides 24. */
const LASER_CYCLES: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 2],
  [1, 3],
  [3, 1],
  [2, 4],
  [4, 2],
  [3, 3],
  [4, 4],
  [2, 6],
  [6, 2],
  [6, 6],
  [8, 4],
  [4, 8],
  [12, 12],
];

type YapFloorFn = (x: number, y: number) => boolean;

function manhattan(a: YapCell, b: YapCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Random map: border walls, sparse interior walls, connected S/L/E. */
function genMap(rng: YapPrng): { rows: string[]; start: YapCell; loot: YapCell; exit: YapCell } | null {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const wall: boolean[][] = [];
    for (let y = 0; y < YAP_GRID_HEIGHT; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < YAP_GRID_WIDTH; x += 1) {
        row.push(x === 0 || y === 0 || x === YAP_GRID_WIDTH - 1 || y === YAP_GRID_HEIGHT - 1 || rng.chance(0.16));
      }
      wall.push(row);
    }
    const isFloor: YapFloorFn = (x, y) => {
      if (x < 0 || y < 0 || x >= YAP_GRID_WIDTH || y >= YAP_GRID_HEIGHT) return false;
      return wall[y]?.[x] === false;
    };
    // Largest connected floor component (BFS from the first floor cell).
    let seedCell: YapCell | null = null;
    for (let y = 0; y < YAP_GRID_HEIGHT && seedCell === null; y += 1) {
      for (let x = 0; x < YAP_GRID_WIDTH; x += 1) {
        if (isFloor(x, y)) {
          seedCell = { x, y };
          break;
        }
      }
    }
    if (seedCell === null) continue;
    const component = new Set<number>();
    const queue: YapCell[] = [seedCell];
    component.add(seedCell.y * YAP_GRID_WIDTH + seedCell.x);
    while (queue.length > 0) {
      const c = queue.pop();
      if (c === undefined) break;
      for (const d of DIRS) {
        const v = DIR_VECTORS[d];
        const nx = c.x + v.x;
        const ny = c.y + v.y;
        const key = ny * YAP_GRID_WIDTH + nx;
        if (isFloor(nx, ny) && !component.has(key)) {
          component.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    if (component.size < 28) continue;
    const cells: YapCell[] = [];
    for (const key of component) {
      cells.push({ x: key % YAP_GRID_WIDTH, y: Math.floor(key / YAP_GRID_WIDTH) });
    }
    const top = cells.filter((c) => c.y <= 4);
    const mid = cells.filter((c) => c.y >= 3 && c.y <= 8);
    const bottom = cells.filter((c) => c.y >= 7);
    if (top.length === 0 || mid.length === 0 || bottom.length === 0) continue;
    for (let k = 0; k < 60; k += 1) {
      const start = rng.pick(top);
      const loot = rng.pick(mid);
      const exit = rng.pick(bottom);
      if (
        manhattan(start, loot) >= 5 &&
        manhattan(loot, exit) >= 5 &&
        manhattan(start, exit) >= 6
      ) {
        const rows: string[] = [];
        for (let y = 0; y < YAP_GRID_HEIGHT; y += 1) {
          let row = '';
          for (let x = 0; x < YAP_GRID_WIDTH; x += 1) {
            if (wall[y]?.[x] === true) row += '#';
            else if (x === start.x && y === start.y) row += 'S';
            else if (x === loot.x && y === loot.y) row += 'L';
            else if (x === exit.x && y === exit.y) row += 'E';
            else row += '.';
          }
          rows.push(row);
        }
        return { rows, start, loot, exit };
      }
    }
  }
  return null;
}

function randomFloorCell(rng: YapPrng, isFloor: YapFloorFn): YapCell {
  for (let k = 0; k < 80; k += 1) {
    const x = 1 + rng.int(YAP_GRID_WIDTH - 2);
    const y = 1 + rng.int(YAP_GRID_HEIGHT - 2);
    if (isFloor(x, y)) return { x, y };
  }
  throw new Error('gen: no floor cell found');
}

/** Random walk on floor cells; a repeated cell is a wait (allowed by the parser). */
function genWalk(rng: YapPrng, isFloor: YapFloorFn, length: number): YapCell[] {
  const route: YapCell[] = [randomFloorCell(rng, isFloor)];
  while (route.length < length) {
    const last = route[route.length - 1];
    if (last === undefined) break;
    const v = DIR_VECTORS[rng.pick(DIRS)];
    const nx = last.x + v.x;
    const ny = last.y + v.y;
    if (isFloor(nx, ny)) route.push({ x: nx, y: ny });
    else route.push({ x: last.x, y: last.y }); // blocked: wait in place
  }
  return route;
}

/** Perimeter cells of a w x h rectangle, clockwise from the top-left corner. */
function rectPerimeter(x: number, y: number, w: number, h: number): YapCell[] {
  const cells: YapCell[] = [];
  for (let i = 0; i <= w; i += 1) cells.push({ x: x + i, y });
  for (let j = 1; j <= h; j += 1) cells.push({ x: x + w, y: y + j });
  for (let i = w - 1; i >= 0; i -= 1) cells.push({ x: x + i, y: y + h });
  for (let j = h - 1; j >= 1; j -= 1) cells.push({ x, y: y + j });
  return cells;
}

function genGuard(rng: YapPrng, isFloor: YapFloorFn, id: string): YapGuard | null {
  const range = 2 + rng.int(2); // 2..3
  const kind = rng.int(3);
  if (kind === 0) {
    // Static guard: single-cell route, needs a face.
    const cell = randomFloorCell(rng, isFloor);
    const face = rng.pick(DIRS);
    return { id, route: [cell], mode: 'loop', phase: 0, range, face };
  }
  if (kind === 1) {
    const length = rng.pick(PINGPONG_LENGTHS);
    const route = genWalk(rng, isFloor, length);
    const period = 2 * route.length - 2;
    return { id, route, mode: 'pingpong', phase: rng.int(period), range };
  }
  // Loop guard: rectangle perimeter (period divides 24 by construction).
  for (let k = 0; k < 40; k += 1) {
    const [w, h] = rng.pick(LOOP_RECTS);
    const x = 1 + rng.int(YAP_GRID_WIDTH - 2 - w);
    const y = 1 + rng.int(YAP_GRID_HEIGHT - 2 - h);
    const route = rectPerimeter(x, y, w, h);
    if (route.every((c) => isFloor(c.x, c.y))) {
      return { id, route, mode: 'loop', phase: rng.int(route.length), range };
    }
  }
  return null;
}

function genCamera(rng: YapPrng, isWall: YapFloorFn, isFloor: YapFloorFn, id: string): YapCamera | null {
  // Wall cells with at least one floor neighbor (a mountable wall).
  const mounts: YapCell[] = [];
  for (let y = 0; y < YAP_GRID_HEIGHT; y += 1) {
    for (let x = 0; x < YAP_GRID_WIDTH; x += 1) {
      if (!isWall(x, y)) continue;
      if (DIRS.some((d) => {
        const v = DIR_VECTORS[d];
        return isFloor(x + v.x, y + v.y);
      })) {
        mounts.push({ x, y });
      }
    }
  }
  if (mounts.length === 0) return null;
  const at = rng.pick(mounts);
  const dirCount = rng.pick([1, 1, 2, 2, 4] as const);
  const dirs: YapDir[] = [];
  while (dirs.length < dirCount) {
    const d = rng.pick(DIRS);
    if (!dirs.includes(d)) dirs.push(d);
  }
  const holds = CAMERA_HOLDS[dirs.length];
  if (holds === undefined) return null;
  const hold = rng.pick(holds);
  const period = hold * dirs.length;
  return { id, at, dirs, hold, phase: rng.int(period), range: 2 + rng.int(2) };
}

function genLaser(rng: YapPrng, isFloor: YapFloorFn, id: string): YapLaser | null {
  const horizontal = rng.chance(0.5);
  // Contiguous floor runs on one row (or column).
  const runs: { fixed: number; from: number; to: number }[] = [];
  const lines = horizontal
    ? Array.from({ length: YAP_GRID_HEIGHT }, (_, y) => y)
    : Array.from({ length: YAP_GRID_WIDTH }, (_, x) => x);
  for (const fixed of lines) {
    let from = -1;
    const limit = horizontal ? YAP_GRID_WIDTH : YAP_GRID_HEIGHT;
    for (let i = 0; i <= limit; i += 1) {
      const ok = i < limit && (horizontal ? isFloor(i, fixed) : isFloor(fixed, i));
      if (ok && from < 0) from = i;
      if (!ok && from >= 0) {
        if (i - from >= 2) runs.push({ fixed, from, to: i - 1 });
        from = -1;
      }
    }
  }
  if (runs.length === 0) return null;
  for (let k = 0; k < 20; k += 1) {
    const run = rng.pick(runs);
    const maxLen = Math.min(4, run.to - run.from + 1);
    const len = 2 + rng.int(maxLen - 1);
    const start = run.from + rng.int(run.to - run.from + 1 - len + 1);
    const cells: YapCell[] = [];
    for (let i = 0; i < len; i += 1) {
      cells.push(horizontal ? { x: start + i, y: run.fixed } : { x: run.fixed, y: start + i });
    }
    const [on, off] = rng.pick(LASER_CYCLES);
    return { id, cells, on, off, phase: rng.int(on + off) };
  }
  return null;
}

/** Build one random candidate level (par is a placeholder until solved). */
function buildCandidate(rng: YapPrng, maxEntities: number): YapLevel | null {
  const map = genMap(rng);
  if (map === null) return null;
  const isFloor: YapFloorFn = (x, y) => {
    if (x < 0 || y < 0 || x >= YAP_GRID_WIDTH || y >= YAP_GRID_HEIGHT) return false;
    return map.rows[y]?.charAt(x) !== '#';
  };
  const isWall: YapFloorFn = (x, y) => !isFloor(x, y);
  const entityCount = Math.min(4, 1 + rng.int(Math.max(1, maxEntities)));
  const guards: YapGuard[] = [];
  const cameras: YapCamera[] = [];
  const lasers: YapLaser[] = [];
  for (let i = 0; i < entityCount; i += 1) {
    const kind = rng.int(3);
    if (kind === 0) {
      const g = genGuard(rng, isFloor, `g${guards.length + 1}`);
      if (g !== null) guards.push(g);
    } else if (kind === 1) {
      const c = genCamera(rng, isWall, isFloor, `c${cameras.length + 1}`);
      if (c !== null) cameras.push(c);
    } else {
      const l = genLaser(rng, isFloor, `l${lasers.length + 1}`);
      if (l !== null) lasers.push(l);
    }
  }
  return {
    name: 'Draft',
    type: 'normal',
    moment: '',
    maxPauses: 1 + rng.int(YAP_MAX_PAUSES),
    par: 1,
    width: YAP_GRID_WIDTH,
    height: YAP_GRID_HEIGHT,
    map: map.rows,
    start: map.start,
    loot: map.loot,
    exit: map.exit,
    guards,
    cameras,
    lasers,
  };
}

// ---------------------------------------------------------------------------
// Serialization to .lvl source
// ---------------------------------------------------------------------------

/** Quote a string for the .lvl format (only \" and \\ escapes are supported). */
function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function cellList(cells: readonly YapCell[]): string {
  return `[${cells.map((c) => `[${c.x},${c.y}]`).join(', ')}]`;
}

/** Serialize a YapLevel to .lvl source that parseLevel accepts. */
export function serializeLevel(level: YapLevel): string {
  const lines: string[] = [];
  lines.push(`name: ${quote(level.name)}`);
  lines.push(`type: ${level.type}`);
  lines.push(`moment: ${quote(level.moment)}`);
  lines.push(`maxPauses: ${level.maxPauses}`);
  lines.push(`par: ${level.par}`);
  lines.push('map: |');
  for (const row of level.map) lines.push(`  ${row}`);
  if (level.guards.length > 0) {
    lines.push('guards:');
    for (const g of level.guards) {
      lines.push(`  - id: ${quote(g.id)}`);
      lines.push(`    route: ${cellList(g.route)}`);
      lines.push(`    mode: ${g.mode}`);
      lines.push(`    phase: ${g.phase}`);
      lines.push(`    range: ${g.range}`);
      if (g.face !== undefined) lines.push(`    face: ${g.face}`);
    }
  }
  if (level.cameras.length > 0) {
    lines.push('cameras:');
    for (const c of level.cameras) {
      lines.push(`  - id: ${quote(c.id)}`);
      lines.push(`    at: [${c.at.x},${c.at.y}]`);
      lines.push(`    dirs: [${c.dirs.join(', ')}]`);
      lines.push(`    hold: ${c.hold}`);
      lines.push(`    phase: ${c.phase}`);
      lines.push(`    range: ${c.range}`);
    }
  }
  if (level.lasers.length > 0) {
    lines.push('lasers:');
    for (const l of level.lasers) {
      lines.push(`  - id: ${quote(l.id)}`);
      lines.push(`    cells: ${cellList(l.cells)}`);
      lines.push(`    on: ${l.on}`);
      lines.push(`    off: ${l.off}`);
      lines.push(`    phase: ${l.phase}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Generation with par / tension filtering
// ---------------------------------------------------------------------------

/**
 * Generate up to options.count accepted drafts. Each candidate is serialized,
 * round-tripped through parseLevel, checked with validateLevelSource (the
 * `npm run validate` gate) and solved; it is kept only when its solver par is
 * in [parMin, parMax] and its tension in [tensionMin, tensionMax]. The
 * emitted source carries the solver par, so the draft validates as-is.
 */
export function generateDrafts(options: YapDraftOptions): YapGenResult {
  const rng = new YapPrng(options.seed);
  const drafts: YapDraft[] = [];
  // Mutable while filling; returned as the readonly YapGenStats.
  const stats = {
    attempts: 0,
    accepted: 0,
    rejectedShape: 0,
    rejectedParse: 0,
    rejectedInvalid: 0,
    rejectedUnsolvable: 0,
    rejectedPar: 0,
    rejectedTension: 0,
  };
  for (let attempt = 1; attempt <= options.maxAttempts && drafts.length < options.count; attempt += 1) {
    stats.attempts += 1;
    const file = `draft-${options.seed}-${attempt}.lvl`;
    const candidate = buildCandidate(rng, options.maxEntities);
    if (candidate === null) {
      stats.rejectedShape += 1;
      continue;
    }
    let parsed: YapLevel;
    try {
      parsed = parseLevel(serializeLevel(candidate), file);
    } catch {
      stats.rejectedParse += 1;
      continue;
    }
    const check = validateLevelSource(serializeLevel(parsed), file);
    if (check.level === null || check.issues.length > 0) {
      stats.rejectedInvalid += 1;
      continue;
    }
    let solved: YapSolveResult;
    try {
      solved = solveLevel(parsed);
    } catch (e) {
      if (e instanceof YapSolverError) {
        stats.rejectedUnsolvable += 1;
        continue;
      }
      throw e;
    }
    if (solved.par < options.parMin || solved.par > options.parMax) {
      stats.rejectedPar += 1;
      continue;
    }
    if (solved.tension < options.tensionMin || solved.tension > options.tensionMax) {
      stats.rejectedTension += 1;
      continue;
    }
    // Final source: real name and the solver par, so the draft is
    // self-consistent and passes the validate gate unchanged.
    const level: YapLevel = { ...parsed, name: `Draft ${options.seed}-${attempt}`, par: solved.par };
    const source = serializeLevel(level);
    const finalCheck = validateLevelSource(source, file);
    if (finalCheck.level === null || finalCheck.issues.length > 0) {
      stats.rejectedInvalid += 1;
      continue;
    }
    drafts.push({
      seed: options.seed,
      index: attempt,
      source,
      level: finalCheck.level,
      par: solved.par,
      tension: solved.tension,
      optimalPlans: solved.optimalPlans,
      minPauses: solved.minPauses,
    });
    stats.accepted += 1;
  }
  return { drafts, stats };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface YapCliOptions extends YapDraftOptions {
  readonly outDir: string | null;
}

const USAGE = `usage: tsx tools/gen.ts [options]
  --seed N          PRNG seed (default ${YAP_GEN_DEFAULTS.seed})
  --count N         number of drafts to emit (default ${YAP_GEN_DEFAULTS.count})
  --par-min N       minimum solver par (default ${YAP_GEN_DEFAULTS.parMin})
  --par-max N       maximum solver par (default ${YAP_GEN_DEFAULTS.parMax})
  --tension-min N   minimum solver tension (default ${YAP_GEN_DEFAULTS.tensionMin})
  --tension-max N   maximum solver tension (default ${YAP_GEN_DEFAULTS.tensionMax})
  --entities N      max entities per draft, 1..4 (default ${YAP_GEN_DEFAULTS.maxEntities})
  --attempts N      max candidates tried (default ${YAP_GEN_DEFAULTS.maxAttempts})
  --out DIR         write draft-<seed>-<index>.lvl files to DIR instead of stdout
  --help            show this help`;

function parseIntArg(argv: readonly string[], i: number, name: string): number {
  const raw = argv[i + 1];
  if (raw === undefined) throw new Error(`${name} needs a value\n${USAGE}`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new Error(`${name}: not an integer: "${raw}"\n${USAGE}`);
  return n;
}

function parseArgs(argv: readonly string[]): YapCliOptions {
  let seed = YAP_GEN_DEFAULTS.seed;
  let count = YAP_GEN_DEFAULTS.count;
  let parMin = YAP_GEN_DEFAULTS.parMin;
  let parMax = YAP_GEN_DEFAULTS.parMax;
  let tensionMin = YAP_GEN_DEFAULTS.tensionMin;
  let tensionMax = YAP_GEN_DEFAULTS.tensionMax;
  let maxEntities = YAP_GEN_DEFAULTS.maxEntities;
  let maxAttempts = YAP_GEN_DEFAULTS.maxAttempts;
  let outDir: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) break;
    switch (arg) {
      case '--seed':
        seed = parseIntArg(argv, i, '--seed');
        i += 1;
        break;
      case '--count':
        count = parseIntArg(argv, i, '--count');
        i += 1;
        break;
      case '--par-min':
        parMin = parseIntArg(argv, i, '--par-min');
        i += 1;
        break;
      case '--par-max':
        parMax = parseIntArg(argv, i, '--par-max');
        i += 1;
        break;
      case '--tension-min':
        tensionMin = parseIntArg(argv, i, '--tension-min');
        i += 1;
        break;
      case '--tension-max':
        tensionMax = parseIntArg(argv, i, '--tension-max');
        i += 1;
        break;
      case '--entities':
        maxEntities = parseIntArg(argv, i, '--entities');
        i += 1;
        break;
      case '--attempts':
        maxAttempts = parseIntArg(argv, i, '--attempts');
        i += 1;
        break;
      case '--out': {
        const dir = argv[i + 1];
        if (dir === undefined) throw new Error(`--out needs a directory\n${USAGE}`);
        outDir = dir;
        i += 1;
        break;
      }
      case '--help':
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown option "${arg}"\n${USAGE}`);
    }
  }
  if (count < 1) throw new Error('--count must be >= 1');
  if (parMin < 1 || parMax > YAP_MAX_TICKS || parMin > parMax) {
    throw new Error(`--par-min/--par-max must satisfy 1 <= min <= max <= ${YAP_MAX_TICKS}`);
  }
  if (tensionMin < 0 || tensionMax > YAP_MAX_TICKS || tensionMin > tensionMax) {
    throw new Error(`--tension-min/--tension-max must satisfy 0 <= min <= max <= ${YAP_MAX_TICKS}`);
  }
  if (maxEntities < 1 || maxEntities > 4) throw new Error('--entities must be in 1..4');
  if (maxAttempts < 1) throw new Error('--attempts must be >= 1');
  return { seed, count, parMin, parMax, tensionMin, tensionMax, maxEntities, maxAttempts, outDir };
}

function main(): void {
  let cli: YapCliOptions;
  try {
    cli = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  const { drafts, stats } = generateDrafts(cli);
  for (const draft of drafts) {
    const header =
      `# draft seed=${draft.seed} index=${draft.index} par=${draft.par} ` +
      `tension=${draft.tension} optimalPlans=${draft.optimalPlans} minPauses=${draft.minPauses}\n`;
    if (cli.outDir !== null) {
      mkdirSync(cli.outDir, { recursive: true });
      const file = join(cli.outDir, `draft-${draft.seed}-${draft.index}.lvl`);
      writeFileSync(file, header + draft.source);
      console.error(`wrote ${file} (par ${draft.par}, tension ${draft.tension})`);
    } else {
      process.stdout.write(header + draft.source);
    }
  }
  console.error(
    `gen: seed=${cli.seed} attempts=${stats.attempts} accepted=${stats.accepted} ` +
      `rejected(shape=${stats.rejectedShape} parse=${stats.rejectedParse} invalid=${stats.rejectedInvalid} ` +
      `unsolvable=${stats.rejectedUnsolvable} par=${stats.rejectedPar} tension=${stats.rejectedTension}) ` +
      `filter par=[${cli.parMin},${cli.parMax}] tension=[${cli.tensionMin},${cli.tensionMax}]`,
  );
  if (drafts.length === 0) {
    console.error('gen: no draft passed the par/tension filter — try another seed or wider bounds');
    process.exitCode = 1;
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) main();
