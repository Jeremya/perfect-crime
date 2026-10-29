import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapLevel } from '../../src/core/level';
import { run, type YapMove } from '../../src/core/sim';
import {
  solveLevel,
  YapSolver,
  YapSolverError,
  YAP_MAX_OPTIMAL_PLANS,
  type YapSolveResult,
} from '../../src/core/solver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a YapLevel from map rows plus extra top-level YAML lines (entities). */
function lvl(
  mapRows: readonly string[],
  extra: readonly string[] = [],
  opts: { maxPauses?: number; par?: number } = {},
): YapLevel {
  const src = [
    'name: Test',
    'type: tutorial',
    'moment: ""',
    `maxPauses: ${opts.maxPauses ?? 3}`,
    `par: ${opts.par ?? 18}`,
    'map: |',
    ...mapRows.map((row) => `  ${row}`),
    ...extra,
  ].join('\n');
  return parseLevel(src);
}

const rep = (m: YapMove, n: number): YapMove[] => Array.from({ length: n }, () => m);

/** The acceptance criterion: simulating the optimal plan wins in exactly par ticks. */
function expectWinAtPar(level: YapLevel, result: YapSolveResult): void {
  expect(result.plan.length).toBe(result.par);
  const res = run(level, result.plan);
  expect(res.outcome).toEqual({ kind: 'won', tick: result.par });
}

function tutorial1(): YapLevel {
  const path = fileURLToPath(new URL('../../levels/tutorial/t1.lvl', import.meta.url));
  return parseLevel(readFileSync(path, 'utf8'), path);
}

// ---------------------------------------------------------------------------
// Test levels
// ---------------------------------------------------------------------------

// Open room, no entity. S=(1,1), L=(3,10), E=(6,10); row 5 is '##.##.##'.
const OPEN_MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#......#',
  '#......#',
  '##.##.##',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#..L..E#',
  '########',
];

// One-cell-wide corridor with a laser on the only passage cell (on 1, off 1,
// phase 0: active on even ticks). S=(1,1), L=(4,1), E=(6,1).
const CORRIDOR_MAP = [
  '########',
  '#S..L.E#',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
];
const CORRIDOR_LASER = ['lasers:', '  - id: l1', '    cells: [[3,1]]', '    on: 1', '    off: 1', '    phase: 0'];

// Open room with S=(1,1), L=(2,2), E=(3,3): four optimal plans of 4 ticks.
const MULTI_MAP = [
  '########',
  '#S.....#',
  '#.L....#',
  '#..E...#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '########',
];

// Two-row corridor under a wall camera at (3,0) facing S with range 1: the
// camera sees (3,1), so the thief must cross column 3 on row 2, one cell away
// from the seen cell. S=(1,1), L=(5,2), E=(6,2).
const TENSION_MAP = [
  '########',
  '#S.....#',
  '#....LE#',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
];
const TENSION_CAMERA = [
  'cameras:',
  '  - id: c1',
  '    at: [3,0]',
  '    dirs: [S]',
  '    hold: 24',
  '    phase: 0',
  '    range: 1',
];

// Big open room (6 x 10 floor), no pauses allowed: 2002 monotone S->L paths,
// minus the 715 whose last step into L is E (the following W would be an
// immediate U-turn) = 1287 optimal plans, more than the cap.
// S=(1,1), L=(6,10), E=(1,10).
const CAP_MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#E....L#',
  '########',
];

// Corridor blocked by a static guard on the only passage cell: unsolvable.
const BLOCKED_MAP = [
  '########',
  '#S..L.E#',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
];
const BLOCKED_GUARD = [
  'guards:',
  '  - id: g1',
  '    route: [[3,1]]',
  '    mode: loop',
  '    phase: 0',
  '    range: 1',
  '    face: N',
];

// ---------------------------------------------------------------------------
// Golden plans
// ---------------------------------------------------------------------------

describe('YapSolver — golden plans', () => {
  it('open room: par is the Manhattan length and the plan wins in exactly par ticks', () => {
    const level = lvl(OPEN_MAP);
    const result = solveLevel(level);
    expect(result.par).toBe(14); // S->L = 11, L->E = 3
    expect(result.minPauses).toBe(0);
    expect(result.tension).toBe(0);
    expect(result.optimalPlans).toBeGreaterThanOrEqual(1);
    expectWinAtPar(level, result);
  });

  it('the canonical plan is the lexicographically smallest in the order N, E, S, W, wait', () => {
    const level = lvl(MULTI_MAP);
    const result = solveLevel(level);
    expect(result.par).toBe(4);
    expect(result.plan).toEqual(['E', 'S', 'E', 'S']);
    expect(result.optimalPlans).toBe(4); // [E,S,E,S] [E,S,S,E] [S,E,E,S] [S,E,S,E]
    expect(result.minPauses).toBe(0);
    expect(result.tension).toBe(0);
    expectWinAtPar(level, result);
  });

  it('a mandatory pause: par includes the wait and the minimum pauses is 1', () => {
    const level = lvl(CORRIDOR_MAP, CORRIDOR_LASER, { par: 6 });
    const result = solveLevel(level);
    expect(result.par).toBe(6);
    expect(result.plan).toEqual(['E', 'wait', 'E', 'E', 'E', 'E']);
    expect(result.minPauses).toBe(1);
    expect(result.optimalPlans).toBe(2); // the wait on the first or second step
    expect(result.tension).toBe(0);
    expectWinAtPar(level, result);
  });

  it('tension counts the ticks of the optimal plan one orthogonal cell away from a seen cell', () => {
    const level = lvl(TENSION_MAP, TENSION_CAMERA, { par: 6 });
    const result = solveLevel(level);
    expect(result.par).toBe(6);
    expect(result.plan).toEqual(['E', 'S', 'E', 'E', 'E', 'E']);
    expect(result.optimalPlans).toBe(2);
    expect(result.minPauses).toBe(0);
    // ticks 1 (2,1) and 3 (3,2) are one cell away from the seen cell (3,1)
    expect(result.tension).toBe(2);
    expectWinAtPar(level, result);
  });

  it('the number of optimal plans is capped at YAP_MAX_OPTIMAL_PLANS', () => {
    const level = lvl(CAP_MAP, [], { maxPauses: 0, par: 19 });
    const result = solveLevel(level);
    expect(result.par).toBe(19); // S->L = 14, L->E = 5
    expect(result.plan).toEqual([...rep('E', 5), ...rep('S', 9), ...rep('W', 5)]);
    expect(result.optimalPlans).toBe(YAP_MAX_OPTIMAL_PLANS); // 1287 uncapped
    expect(result.minPauses).toBe(0);
    expectWinAtPar(level, result);
  });

  it('a level that cannot be cleared within 64 ticks throws a YapSolverError', () => {
    const level = lvl(BLOCKED_MAP, BLOCKED_GUARD, { par: 6 });
    expect(() => solveLevel(level)).toThrow(YapSolverError);
  });

  it('tutorial level t1.lvl: simulating the optimal plan wins in exactly par ticks', () => {
    const level = tutorial1();
    const result = solveLevel(level);
    expect(result.par).toBeGreaterThanOrEqual(1);
    expect(result.par).toBeLessThanOrEqual(64);
    expect(result.optimalPlans).toBeGreaterThanOrEqual(1);
    expect(result.minPauses).toBeGreaterThanOrEqual(0);
    expect(result.minPauses).toBeLessThanOrEqual(level.maxPauses);
    expect(result.tension).toBeGreaterThanOrEqual(0);
    expectWinAtPar(level, result);
  });
});

// ---------------------------------------------------------------------------
// API and determinism
// ---------------------------------------------------------------------------

describe('YapSolver — API and determinism', () => {
  it('solveLevel matches a YapSolver instance, and a solver caches per level', () => {
    const level = lvl(MULTI_MAP);
    const viaClass = new YapSolver().solve(level);
    expect(solveLevel(level)).toEqual(viaClass);
    const solver = new YapSolver();
    expect(solver.solve(level)).toBe(solver.solve(level));
  });

  it('solving is deterministic: two solvers give identical results', () => {
    const level = tutorial1();
    const a = new YapSolver().solve(level);
    const b = new YapSolver().solve(level);
    expect(a).toEqual(b);
  });

  it('solves a level in under 50 ms per optimal plan', () => {
    const levels = [tutorial1(), lvl(CAP_MAP, [], { maxPauses: 0, par: 19 }), lvl(OPEN_MAP)];
    for (const level of levels) {
      const start = performance.now();
      const result = new YapSolver().solve(level);
      const ms = performance.now() - start;
      expectWinAtPar(level, result);
      expect(ms).toBeLessThan(50);
    }
  });
});
