// Tests for story C7 — hints after 3 then 6 failures (src/game/hints.ts).
// The module is pure and Phaser-free like YapGhostPreview (./ghost.ts), so
// the whole contract is tested here in node:
// - the first hint unlocks after 3 failures on the level, the second after 6
//   (YAP_HINT_FAILURE_THRESHOLDS), and there is never a third one;
// - using a hint reveals the first third, then two thirds, of the optimal
//   plan of YapSolver (src/core/solver.ts) as ghost cells;
// - the ghost cells are exactly the thief cells of the simulated optimal
//   plan (run() in src/core/sim.ts) at ticks 0..steps — the hint never
//   re-implements a rule;
// - the number of hints used is what the Win screen puts in the share (💡),
//   see tests/unit/win.test.ts;
// - an unsolvable level degrades to "no hint" instead of throwing.
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapLevel } from '../../src/core/level';
import { run } from '../../src/core/sim';
import { YapSolver } from '../../src/core/solver';
import { YapHints, YAP_HINT_FAILURE_THRESHOLDS, YAP_MAX_HINTS } from '../../src/game/hints';

// ---------------------------------------------------------------------------
// Helpers — levels with a known optimal plan
// ---------------------------------------------------------------------------

// 8 x 12, S=(1,1), L=(3,10), E=(6,10), no walls inside, no entities: the
// optimal plan is E,E,S x 9 (onto the loot),E,E,E — 14 ticks, par 14.
const OPEN_MAP = [
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
  '#..L..E#',
  '########',
];

// 8 x 12 with the loot next to the start and the exit next to the loot:
// the optimal plan is E,E — 2 ticks, par 2.
const TINY_MAP = [
  '########',
  '#SLE...#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '########',
];

// The exit is walled in (walls at (5,10) and (6,9)): the level parses but
// cannot be cleared, so YapSolver throws YapSolverError.
const WALLED_MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#.....##',
  '#..L.#E#',
  '########',
];

function lvl(map: readonly string[], par: number): YapLevel {
  const src = [
    'name: Hint test',
    'type: tutorial',
    'moment: ""',
    'maxPauses: 3',
    `par: ${par}`,
    'map: |',
    ...map.map((row) => `  ${row}`),
  ].join('\n');
  return parseLevel(src);
}

/** The thief cells of the optimal plan at ticks 0..steps, via the sim only. */
function optimalCells(level: YapLevel, steps: number) {
  const plan = new YapSolver().solve(level).plan;
  const frames = run(level, plan).frames;
  return { plan, cells: frames.slice(0, steps + 1).map((f) => f.thief) };
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

describe('YapHints — failure thresholds', () => {
  it('unlocks the first hint after 3 failures and the second after 6', () => {
    expect([...YAP_HINT_FAILURE_THRESHOLDS]).toEqual([3, 6]);
    expect(YAP_MAX_HINTS).toBe(2);
    const hints = new YapHints(lvl(OPEN_MAP, 14));
    for (let i = 0; i < 3; i += 1) {
      expect(hints.yapRegisterFailure()).toBe(i + 1);
      expect(hints.yapFailures()).toBe(i + 1);
    }
    expect(hints.yapHintAvailable()).toBe(true);
    expect(hints.yapNextHintFailures()).toBe(3);
    hints.yapUseHint();
    expect(hints.yapHintsUsed()).toBe(1);
    expect(hints.yapHintAvailable()).toBe(false);
    expect(hints.yapNextHintFailures()).toBe(6);
    for (let i = 0; i < 3; i += 1) hints.yapRegisterFailure(); // 4, 5, 6
    expect(hints.yapHintAvailable()).toBe(true);
    hints.yapUseHint();
    expect(hints.yapHintsUsed()).toBe(2);
    expect(hints.yapHintAvailable()).toBe(false);
    expect(hints.yapNextHintFailures()).toBeNull();
  });

  it('is not available before 3 failures and never offers a third hint', () => {
    const hints = new YapHints(lvl(OPEN_MAP, 14));
    expect(hints.yapHintAvailable()).toBe(false);
    hints.yapRegisterFailure();
    hints.yapRegisterFailure();
    expect(hints.yapHintAvailable()).toBe(false);
    expect(hints.yapUseHint()).toBeNull();
    expect(hints.yapHintsUsed()).toBe(0);
    for (let i = 0; i < 20; i += 1) hints.yapRegisterFailure();
    hints.yapUseHint();
    hints.yapUseHint();
    expect(hints.yapHintsUsed()).toBe(2);
    expect(hints.yapHintAvailable()).toBe(false);
    expect(hints.yapUseHint()).toBeNull();
    expect(hints.yapHintsUsed()).toBe(2);
  });

  it('reveals both hints when the failures jump past both thresholds at once', () => {
    const hints = new YapHints(lvl(OPEN_MAP, 14));
    for (let i = 0; i < 7; i += 1) hints.yapRegisterFailure();
    const first = hints.yapUseHint();
    expect(first).not.toBeNull();
    expect(first?.index).toBe(0);
    expect(hints.yapHintAvailable()).toBe(true); // 7 >= 6
    const second = hints.yapUseHint();
    expect(second?.index).toBe(1);
    expect(hints.yapHintsUsed()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The ghost: first third, then two thirds of the optimal plan
// ---------------------------------------------------------------------------

describe('YapHints — ghost of the optimal plan', () => {
  it('reveals the first third then two thirds of the optimal plan', () => {
    const level = lvl(OPEN_MAP, 14);
    const solved = new YapSolver().solve(level);
    expect(solved.par).toBe(14);
    expect(solved.plan).toHaveLength(14);
    const hints = new YapHints(level);
    expect(hints.yapOptimalPlan()).toEqual([...solved.plan]);
    expect(hints.yapGhostCells()).toEqual([]);

    for (let i = 0; i < 3; i += 1) hints.yapRegisterFailure();
    const first = hints.yapUseHint();
    expect(first?.index).toBe(0);
    expect(first?.steps).toBe(Math.ceil(14 / 3)); // 5 steps: the first third
    expect(first?.cells).toHaveLength(6); // start cell + 5 steps
    expect(hints.yapGhostCells()).toEqual(first?.cells ?? []);

    for (let i = 0; i < 3; i += 1) hints.yapRegisterFailure();
    const second = hints.yapUseHint();
    expect(second?.index).toBe(1);
    expect(second?.steps).toBe(Math.ceil((2 * 14) / 3)); // 10 steps: two thirds
    expect(second?.cells).toHaveLength(11);
    // the second ghost extends the first one
    expect(second?.cells.slice(0, 6)).toEqual(first?.cells ?? []);
    expect(hints.yapGhostCells()).toEqual(second?.cells ?? []);
  });

  it('ghost cells are exactly the thief cells of the simulated optimal plan', () => {
    const level = lvl(OPEN_MAP, 14);
    const hints = new YapHints(level);
    for (let i = 0; i < 6; i += 1) hints.yapRegisterFailure();
    const first = hints.yapUseHint();
    const second = hints.yapUseHint();
    const { plan, cells } = optimalCells(level, second?.steps ?? 0);
    expect(plan).toHaveLength(14);
    expect(second?.cells).toEqual(cells);
    // tick-by-tick: cell i of the ghost is the thief at tick i of the plan
    const frames = run(level, plan).frames;
    for (let i = 0; i < cells.length; i += 1) {
      expect(second?.cells[i]).toEqual(frames[i]?.thief);
    }
    expect(first?.cells).toEqual(cells.slice(0, (first?.steps ?? 0) + 1));
  });

  it('uses ceil fractions on a short optimal plan (2 ticks)', () => {
    const level = lvl(TINY_MAP, 2);
    const solved = new YapSolver().solve(level);
    expect(solved.plan).toEqual(['E', 'E']);
    const hints = new YapHints(level);
    for (let i = 0; i < 6; i += 1) hints.yapRegisterFailure();
    const first = hints.yapUseHint();
    expect(first?.steps).toBe(1); // ceil(2/3)
    expect(first?.cells).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    const second = hints.yapUseHint();
    expect(second?.steps).toBe(2); // ceil(4/3): the whole plan
    expect(second?.cells).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it('reuses a shared YapSolver instead of re-solving the level', () => {
    const level = lvl(OPEN_MAP, 14);
    const solver = new YapSolver();
    const a = new YapHints(level, solver);
    const b = new YapHints(level, solver);
    expect(a.yapOptimalPlan()).toEqual(b.yapOptimalPlan());
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('YapHints — edge cases', () => {
  it('degrades to "no hint" on an unsolvable level, without throwing', () => {
    const level = lvl(WALLED_MAP, 64);
    const hints = new YapHints(level);
    expect(hints.yapOptimalPlan()).toBeNull();
    for (let i = 0; i < 6; i += 1) hints.yapRegisterFailure();
    expect(hints.yapHintAvailable()).toBe(false);
    expect(hints.yapUseHint()).toBeNull();
    expect(hints.yapHintsUsed()).toBe(0);
    expect(hints.yapGhostCells()).toEqual([]);
  });

  it('keeps the ghost of the last used hint (no hint = no ghost)', () => {
    const hints = new YapHints(lvl(OPEN_MAP, 14));
    expect(hints.yapGhostCells()).toEqual([]);
    for (let i = 0; i < 3; i += 1) hints.yapRegisterFailure();
    const first = hints.yapUseHint();
    expect(hints.yapGhostCells()).toEqual(first?.cells ?? []);
    // a failed use (not available anymore) does not clear the ghost
    expect(hints.yapUseHint()).toBeNull();
    expect(hints.yapGhostCells()).toEqual(first?.cells ?? []);
  });
});
