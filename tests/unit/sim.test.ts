import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapCell, type YapLevel } from '../../src/core/level';
import {
  createInitialState,
  resolveTick,
  run,
  visibleCells,
  YapSimError,
  type YapCameraView,
  type YapGuardView,
  type YapLaserView,
  type YapMove,
  type YapRunResult,
  type YapSimState,
} from '../../src/core/sim';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 8 columns x 12 rows, origin top-left. S=(1,1), L=(3,10), E=(6,10).
const BASE_MAP = [
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

/** Build a YapLevel from map rows plus extra top-level YAML lines (entities). */
function lvl(mapRows: readonly string[] = BASE_MAP, extra: readonly string[] = []): YapLevel {
  const src = [
    'name: Test',
    'type: tutorial',
    'moment: ""',
    'maxPauses: 3',
    'par: 18',
    'map: |',
    ...mapRows.map((row) => `  ${row}`),
    ...extra,
  ].join('\n');
  return parseLevel(src);
}

const cell = (x: number, y: number): YapCell => ({ x, y });
const waits = (n: number): YapMove[] => Array.from({ length: n }, () => 'wait');
const rep = (m: YapMove, n: number): YapMove[] => Array.from({ length: n }, () => m);

function sortedCells(cells: readonly YapCell[]): string[] {
  return cells.map((c) => `${c.x},${c.y}`).sort();
}

function expectCells(cells: readonly YapCell[], expected: readonly string[]): void {
  expect(sortedCells(cells)).toEqual([...expected].sort());
}

function frame(res: YapRunResult, i: number): YapSimState {
  const f = res.frames[i];
  if (f === undefined) throw new Error(`missing frame ${i}`);
  return f;
}

function firstGuard(s: YapSimState): YapGuardView {
  const g = s.guards[0];
  if (g === undefined) throw new Error('missing guard');
  return g;
}

function firstCamera(s: YapSimState): YapCameraView {
  const c = s.cameras[0];
  if (c === undefined) throw new Error('missing camera');
  return c;
}

function firstLaser(s: YapSimState): YapLaserView {
  const l = s.lasers[0];
  if (l === undefined) throw new Error('missing laser');
  return l;
}

// ---------------------------------------------------------------------------
// Thief and time
// ---------------------------------------------------------------------------

describe('thief and time', () => {
  it('one tick is one orthogonal step of one cell', () => {
    const level = lvl();
    const s0 = createInitialState(level);
    expect(s0.tick).toBe(0);
    expect(s0.thief).toEqual(cell(1, 1));
    expect(s0.outcome).toEqual({ kind: 'running' });
    const s1 = resolveTick(s0, 'E');
    expect(s1.tick).toBe(1);
    expect(s1.thief).toEqual(cell(2, 1));
    const s2 = resolveTick(s1, 'S');
    expect(s2.tick).toBe(2);
    expect(s2.thief).toEqual(cell(2, 2));
    const res = run(level, ['E', 'S']);
    expect(res.frames.length).toBe(3); // one frame per tick, initial frame included
    expect(res.frames[2]?.thief).toEqual(cell(2, 2));
  });

  it('a wait is one tick without moving', () => {
    const s1 = resolveTick(createInitialState(lvl()), 'wait');
    expect(s1.tick).toBe(1);
    expect(s1.thief).toEqual(cell(1, 1));
  });

  it('the thief cannot pass through walls', () => {
    const s0 = createInitialState(lvl());
    expect(() => resolveTick(s0, 'N')).toThrow(YapSimError); // row 0 is a wall
    expect(() => resolveTick(s0, 'W')).toThrow(YapSimError); // column 0 is a wall
  });

  it('no immediate U-turn: moving back onto the previous cell is rejected', () => {
    const level = lvl();
    const s1 = resolveTick(createInitialState(level), 'E');
    expect(() => resolveTick(s1, 'W')).toThrow(YapSimError);
    // after a wait the way back is allowed (the U-turn is not immediate)
    const s2 = resolveTick(s1, 'wait');
    const s3 = resolveTick(s2, 'W');
    expect(s3.thief).toEqual(cell(1, 1));
    expect(s3.tick).toBe(3);
  });

  it('a plan is at most 64 steps, pauses included', () => {
    const level = lvl();
    expect(() => run(level, waits(65))).toThrow(YapSimError);
    expect(run(level, waits(64)).outcome).toEqual({ kind: 'running' });
  });

  it('a finished simulation cannot be advanced', () => {
    const level = lvl();
    const res = run(level, [...rep('S', 9), ...rep('E', 5)]); // wins on the exit
    expect(res.outcome).toEqual({ kind: 'won', tick: 14 });
    const last = res.frames[res.frames.length - 1];
    if (last === undefined) throw new Error('missing frame');
    expect(() => resolveTick(last, 'wait')).toThrow(YapSimError);
  });
});

// ---------------------------------------------------------------------------
// Guards: patrols and facings
// ---------------------------------------------------------------------------

describe('guards: patrols and facings', () => {
  it('a loop patrol advances one step per tick and wraps around', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[1,3], [2,3], [2,4], [1,4]]',
      '    mode: loop',
      '    phase: 0',
      '    range: 1',
    ]);
    const res = run(level, waits(4));
    const pos = [0, 1, 2, 3, 4].map((i) => firstGuard(frame(res, i)).pos);
    expect(pos).toEqual([cell(1, 3), cell(2, 3), cell(2, 4), cell(1, 4), cell(1, 3)]);
  });

  it('guard phase shifts the start of the patrol', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[1,3], [2,3], [2,4], [1,4]]',
      '    mode: loop',
      '    phase: 2',
      '    range: 1',
    ]);
    const res = run(level, waits(1));
    expect(firstGuard(frame(res, 0)).pos).toEqual(cell(2, 4)); // route[2]
    expect(firstGuard(frame(res, 1)).pos).toEqual(cell(1, 4)); // route[3]
  });

  it('a pingpong patrol goes out and back without repeating the endpoints', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[1,3], [2,3], [3,3]]',
      '    mode: pingpong',
      '    phase: 0',
      '    range: 1',
    ]);
    const res = run(level, waits(4));
    const pos = [0, 1, 2, 3, 4].map((i) => firstGuard(frame(res, i)).pos);
    expect(pos).toEqual([cell(1, 3), cell(2, 3), cell(3, 3), cell(2, 3), cell(1, 3)]);
  });

  it('a guard always faces its next cell', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[1,3], [2,3], [3,3]]',
      '    mode: pingpong',
      '    phase: 0',
      '    range: 1',
    ]);
    const res = run(level, waits(4));
    const facings = [0, 1, 2, 3, 4].map((i) => firstGuard(frame(res, i)).facing);
    expect(facings).toEqual(['E', 'E', 'W', 'W', 'E']);
  });

  it('during a wait the guard keeps its facing', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[2,3], [1,3], [1,3], [2,3]]',
      '    mode: pingpong',
      '    phase: 0',
      '    range: 1',
    ]);
    const res = run(level, waits(5));
    // waits at ticks 1 and 4: the facing of the previous tick is kept
    const facings = [0, 1, 2, 3, 4, 5].map((i) => firstGuard(frame(res, i)).facing);
    expect(facings).toEqual(['W', 'W', 'E', 'W', 'W', 'E']);
  });

  it('during a wait the guard takes the facing set by the level', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[2,3], [1,3], [1,3], [2,3]]',
      '    mode: pingpong',
      '    phase: 0',
      '    face: N',
      '    range: 1',
    ]);
    const res = run(level, waits(5));
    const facings = [0, 1, 2, 3, 4, 5].map((i) => firstGuard(frame(res, i)).facing);
    expect(facings).toEqual(['W', 'N', 'E', 'W', 'N', 'E']);
  });

  it('a static guard stays on its cell, facing the face set by the level', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[4,4]]',
      '    face: S',
      '    range: 2',
    ]);
    const res = run(level, waits(3));
    for (const i of [0, 1, 2, 3]) {
      expect(firstGuard(frame(res, i)).pos).toEqual(cell(4, 4));
      expect(firstGuard(frame(res, i)).facing).toBe('S');
    }
  });
});

// ---------------------------------------------------------------------------
// Vision cone
// ---------------------------------------------------------------------------

describe('vision cone (visibleCells)', () => {
  it('facing E with range 3 sees exactly the 9 cells of the spec diagram', () => {
    expectCells(visibleCells(lvl(), cell(3, 3), 'E', 3), [
      '4,3',
      '5,2',
      '5,3',
      '5,4',
      '6,1',
      '6,2',
      '6,3',
      '6,4',
      '6,5',
    ]);
  });

  it('the other facings are rotations of the same shape', () => {
    const level = lvl();
    expectCells(visibleCells(level, cell(3, 5), 'N', 3), [
      '3,4',
      '2,3',
      '3,3',
      '4,3',
      '1,2',
      '2,2',
      '3,2',
      '4,2',
      '5,2',
    ]);
    expectCells(visibleCells(level, cell(3, 3), 'S', 3), [
      '3,4',
      '2,5',
      '3,5',
      '4,5',
      '1,6',
      '2,6',
      '3,6',
      '4,6',
      '5,6',
    ]);
    expectCells(visibleCells(level, cell(5, 3), 'W', 3), [
      '4,3',
      '3,2',
      '3,3',
      '3,4',
      '2,1',
      '2,2',
      '2,3',
      '2,4',
      '2,5',
    ]);
  });

  it('a guard sees neither its own cell, nor its sides, nor behind it', () => {
    const seen = sortedCells(visibleCells(lvl(), cell(3, 3), 'E', 3));
    expect(seen).not.toContain('3,3'); // own cell
    expect(seen).not.toContain('3,2'); // side
    expect(seen).not.toContain('3,4'); // side
    expect(seen).not.toContain('2,3'); // behind
  });

  it('sneaking past the back of a guard is allowed', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[3,3]]',
      '    face: E',
      '    range: 3',
    ]);
    // (1,1) -> (1,2) -> (1,3) -> (2,3): the cell behind the guard
    const res = run(level, ['S', 'S', 'E']);
    expect(res.outcome).toEqual({ kind: 'running' });
    expect(res.frames[3]?.thief).toEqual(cell(2, 3));
  });

  it('the cone range is configurable', () => {
    const level = lvl();
    expectCells(visibleCells(level, cell(3, 3), 'E', 1), ['4,3']);
    expectCells(visibleCells(level, cell(3, 3), 'E', 2), ['4,3', '5,2', '5,3', '5,4']);
  });

  it('a cone cell that is a wall is not seen', () => {
    const map = [...BASE_MAP];
    map[3] = '#....#.#'; // wall at (5,3), inside the cone of (3,3) facing E
    // (5,3) is a wall and (6,3) is behind it; the other 7 cone cells stay visible
    expectCells(visibleCells(lvl(map), cell(3, 3), 'E', 3), [
      '4,3',
      '5,2',
      '5,4',
      '6,1',
      '6,2',
      '6,4',
      '6,5',
    ]);
  });

  it('a wall on the Bresenham line cuts the line of sight', () => {
    const map = [...BASE_MAP];
    map[1] = '#S#....#'; // wall at (2,1)
    // (3,1), (4,1) and (4,2) are behind the wall; (3,2) and (4,3) are still visible
    expectCells(visibleCells(lvl(map), cell(1, 1), 'E', 3), ['3,2', '4,3']);
  });

  it('a diagonal gap between two walls lets sight through', () => {
    const map = [...BASE_MAP];
    map[1] = '#S.#...#'; // wall at (3,1)
    map[2] = '#.#....#'; // wall at (2,2): touches (3,1) only at a corner
    const seen = sortedCells(visibleCells(lvl(map), cell(1, 1), 'E', 3));
    expect(seen).toContain('4,2'); // the Bresenham line threads the gap via (2,1) and (3,2)
    expect(seen).not.toContain('3,2'); // blocked by the wall at (2,2)
  });
});

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

describe('cameras', () => {
  it('a camera rotates between its directions, holding each for hold ticks', () => {
    const level = lvl(BASE_MAP, [
      'cameras:',
      '  - id: c1',
      '    at: [3,0]',
      '    dirs: [E, S]',
      '    hold: 3',
      '    phase: 0',
      '    range: 2',
    ]);
    const res = run(level, waits(8));
    const facings = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => firstCamera(frame(res, i)).facing);
    expect(facings).toEqual(['E', 'E', 'E', 'S', 'S', 'S', 'E', 'E', 'E']);
  });

  it('camera phase shifts the rotation', () => {
    const level = lvl(BASE_MAP, [
      'cameras:',
      '  - id: c1',
      '    at: [3,0]',
      '    dirs: [E, S]',
      '    hold: 3',
      '    phase: 1',
      '    range: 2',
    ]);
    const res = run(level, waits(3));
    const facings = [0, 1, 2, 3].map((i) => firstCamera(frame(res, i)).facing);
    expect(facings).toEqual(['E', 'E', 'S', 'S']);
  });

  it('a camera sees with the same cone as a guard, from its wall mount', () => {
    expectCells(visibleCells(lvl(), cell(3, 0), 'S', 2), ['3,1', '2,2', '3,2', '4,2']);
  });

  it('a camera spots the thief: cause camera', () => {
    const level = lvl(BASE_MAP, [
      'cameras:',
      '  - id: c1',
      '    at: [3,0]',
      '    dirs: [S]',
      '    hold: 24',
      '    phase: 0',
      '    range: 3',
    ]);
    const res = run(level, ['E', 'E', 'S']); // (3,1) at tick 2 is in the cone
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'camera', by: 'c1', tick: 2 });
  });
});

// ---------------------------------------------------------------------------
// Lasers
// ---------------------------------------------------------------------------

describe('lasers', () => {
  it('a laser is on for on ticks then off for off ticks, shifted by phase', () => {
    const level = lvl(BASE_MAP, [
      'lasers:',
      '  - id: l1',
      '    cells: [[1,9], [2,9]]',
      '    on: 2',
      '    off: 2',
      '    phase: 1',
    ]);
    const res = run(level, waits(5));
    const active = [0, 1, 2, 3, 4, 5].map((i) => firstLaser(frame(res, i)).active);
    expect(active).toEqual([true, false, false, true, true, false]);
  });

  it('laser phase 0 starts on', () => {
    const level = lvl(BASE_MAP, [
      'lasers:',
      '  - id: l1',
      '    cells: [[1,9], [2,9]]',
      '    on: 2',
      '    off: 2',
      '    phase: 0',
    ]);
    const res = run(level, waits(5));
    const active = [0, 1, 2, 3, 4, 5].map((i) => firstLaser(frame(res, i)).active);
    expect(active).toEqual([true, true, false, false, true, true]);
  });

  it('an active laser under the thief is a capture with cause laser', () => {
    const level = lvl(BASE_MAP, [
      'lasers:',
      '  - id: l1',
      '    cells: [[2,1], [3,1]]',
      '    on: 12',
      '    off: 12',
      '    phase: 0',
    ]);
    const res = run(level, ['E']);
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'laser', by: 'l1', tick: 1 });
  });

  it('an inactive laser under the thief is safe', () => {
    const level = lvl(BASE_MAP, [
      'lasers:',
      '  - id: l1',
      '    cells: [[2,1], [3,1]]',
      '    on: 2',
      '    off: 2',
      '    phase: 2',
    ]);
    expect(run(level, ['E']).outcome).toEqual({ kind: 'running' }); // laser off at tick 1
    const res = run(level, ['E', 'wait']); // laser on at tick 2, thief still on it
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'laser', by: 'l1', tick: 2 });
  });
});

// ---------------------------------------------------------------------------
// Tick resolution order and detection
// ---------------------------------------------------------------------------

describe('tick resolution order and detection', () => {
  it('contact: stepping onto a guard cell is a capture with cause guard', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[3,1]]',
      '    face: E',
      '    range: 1',
    ]);
    const res = run(level, ['E', 'E']);
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'guard', by: 'g1', tick: 2 });
  });

  it('swap: crossing cells with a guard is a capture with cause guard', () => {
    const map = [...BASE_MAP];
    map[1] = '#.S....#'; // start at (2,1)
    const level = lvl(map, [
      'guards:',
      '  - id: g1',
      '    route: [[3,1], [2,1]]',
      '    mode: loop',
      '    phase: 0',
      '    range: 1',
    ]);
    // thief (2,1) -> (3,1) while the guard (3,1) -> (2,1)
    const res = run(level, ['E']);
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'guard', by: 'g1', tick: 1 });
  });

  it('moving onto the cell a guard is leaving is neither contact nor swap', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[2,1], [3,1], [3,1]]',
      '    mode: pingpong',
      '    phase: 0',
      '    range: 1',
    ]);
    // the thief enters (2,1) at tick 1, exactly as the guard leaves it for (3,1)
    const res = run(level, ['E']);
    expect(res.outcome).toEqual({ kind: 'running' });
    expect(res.frames[1]?.thief).toEqual(cell(2, 1));
  });

  it('contact takes precedence over a laser (the first rule triggered gives the cause)', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[3,1]]',
      '    face: E',
      '    range: 1',
      'lasers:',
      '  - id: l1',
      '    cells: [[3,1], [4,1]]',
      '    on: 12',
      '    off: 12',
      '    phase: 0',
    ]);
    const res = run(level, ['E', 'E']); // tick 2: on the guard cell AND on an active laser
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'guard', by: 'g1', tick: 2 });
  });

  it('guard vision takes precedence over camera vision', () => {
    const level = lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[5,3]]',
      '    face: W',
      '    range: 3',
      'cameras:',
      '  - id: c1',
      '    at: [3,0]',
      '    dirs: [S]',
      '    hold: 24',
      '    phase: 0',
      '    range: 2',
    ]);
    const res = run(level, ['S', 'E']); // (2,2) at tick 2 is in both cones
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'guard', by: 'g1', tick: 2 });
  });

  it('camera vision takes precedence over a laser', () => {
    const level = lvl(BASE_MAP, [
      'cameras:',
      '  - id: c1',
      '    at: [3,0]',
      '    dirs: [S]',
      '    hold: 24',
      '    phase: 0',
      '    range: 2',
      'lasers:',
      '  - id: l1',
      '    cells: [[2,2], [2,3]]',
      '    on: 12',
      '    off: 12',
      '    phase: 0',
    ]);
    const res = run(level, ['S', 'E']); // (2,2) at tick 2: camera cone + active laser
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'camera', by: 'c1', tick: 2 });
  });
});

// ---------------------------------------------------------------------------
// Outcome: pickup and win
// ---------------------------------------------------------------------------

describe('outcome: pickup and win', () => {
  it('the thief picks up the diamond when on its cell', () => {
    const res = run(lvl(), [...rep('S', 9), 'E', 'E']); // (3,10) at tick 11
    const f = frame(res, 11);
    expect(f.hasLoot).toBe(true);
    expect(f.lootTick).toBe(11);
    expect(res.outcome).toEqual({ kind: 'running' });
  });

  it('the level is won on the exit with the diamond', () => {
    const res = run(lvl(), [...rep('S', 9), ...rep('E', 5)]); // exit (6,10) at tick 14
    expect(res.outcome).toEqual({ kind: 'won', tick: 14 });
    expect(res.lootTick).toBe(11);
  });

  it('the exit without the diamond is not a win', () => {
    // around the loot: (1,1) -> (1,9) -> (6,9) -> (6,10)
    const res = run(lvl(), [...rep('S', 8), ...rep('E', 5), 'S']);
    expect(res.outcome).toEqual({ kind: 'running' });
    expect(res.frames[14]?.thief).toEqual(cell(6, 10));
    expect(res.frames[14]?.hasLoot).toBe(false);
  });

  it('being seen on the exit counts as a capture', () => {
    const level = lvl(BASE_MAP, [
      'cameras:',
      '  - id: c1',
      '    at: [6,11]',
      '    dirs: [N]',
      '    hold: 24',
      '    phase: 0',
      '    range: 2',
    ]);
    const res = run(level, [...rep('S', 9), ...rep('E', 5)]); // exit at tick 14, in the cone
    expect(res.outcome).toEqual({ kind: 'detected', cause: 'camera', by: 'c1', tick: 14 });
  });
});

// ---------------------------------------------------------------------------
// Determinism and periods
// ---------------------------------------------------------------------------

describe('determinism and periods', () => {
  const busy = (): YapLevel =>
    lvl(BASE_MAP, [
      'guards:',
      '  - id: g1',
      '    route: [[1,8], [2,8]]',
      '    mode: loop',
      '    phase: 0',
      '    range: 1',
      'cameras:',
      '  - id: c1',
      '    at: [6,0]',
      '    dirs: [E, S]',
      '    hold: 3',
      '    phase: 1',
      '    range: 1',
      'lasers:',
      '  - id: l1',
      '    cells: [[1,10], [2,10]]',
      '    on: 2',
      '    off: 2',
      '    phase: 1',
    ]);

  it('the same plan always produces the same result', () => {
    const level = busy();
    const plan: YapMove[] = ['E', 'E', ...waits(10), 'S', 'W'];
    expect(run(level, plan)).toEqual(run(level, plan));
  });

  it('the world repeats at least every 24 ticks', () => {
    const res = run(busy(), waits(48));
    const a = frame(res, 24);
    const b = frame(res, 48);
    expect(firstGuard(a).pos).toEqual(firstGuard(b).pos);
    expect(firstGuard(a).facing).toBe(firstGuard(b).facing);
    expect(firstCamera(a).facing).toBe(firstCamera(b).facing);
    expect(firstLaser(a).active).toBe(firstLaser(b).active);
  });

  it('at tick 0 the simulation is running and the tutorial start is not seen', () => {
    const path = fileURLToPath(new URL('../../levels/tutorial/t1.lvl', import.meta.url));
    const level = parseLevel(readFileSync(path, 'utf8'), path);
    const s0 = createInitialState(level);
    expect(s0.tick).toBe(0);
    expect(s0.outcome).toEqual({ kind: 'running' });
    expect(s0.thief).toEqual(level.start);
    const seen = [...s0.guards.flatMap((g) => g.seen), ...s0.cameras.flatMap((c) => c.seen)];
    expect(sortedCells(seen)).not.toContain(`${level.start.x},${level.start.y}`);
    for (const l of s0.lasers) {
      expect(l.cells.some((c) => c.x === level.start.x && c.y === level.start.y)).toBe(false);
    }
  });
});
