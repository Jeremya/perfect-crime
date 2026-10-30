// Tests for story C6 — the ghost preview while drawing (src/game/ghost.ts +
// the hook in src/game/path-input.ts). Both modules are pure and Phaser-free,
// so the whole contract is tested here in node:
// - the ghost state at a tick is exactly the world part of the simulated frame
//   at that tick (guards, cameras, lasers — cones included via visibleCells),
//   even past a detection (the preview shows threats, not the outcome);
// - while drawing, YapPathInput exposes the tick of the cell under the finger
//   and the world at that tick — only when the ghost flag is on
//   (?flag=ghost:0/1, resolved read-only from src/app/config.ts).
import { describe, expect, it } from 'vitest';
import { parseLevel, YAP_MAX_TICKS, type YapCell, type YapLevel } from '../../src/core/level';
import { createInitialState, run, visibleCells } from '../../src/core/sim';
import { yapCellCenter, yapComputeLayout, type YapBoardLayout } from '../../src/game/board';
import { YapPathInput } from '../../src/game/path-input';
import {
  YapGhostError,
  YapGhostPreview,
  yapGhostCones,
  yapResolveGhostFlag,
} from '../../src/game/ghost';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 8 x 12, S=(1,1), L=(3,10), E=(6,10). The guard patrols through the start
// cell, so a waiting thief is detected at tick 1: the ghost preview must
// still resolve later ticks.
const MAP = [
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

function lvl(guardRoute: string): YapLevel {
  const src = [
    'name: Ghost test',
    'type: tutorial',
    'moment: ""',
    'maxPauses: 3',
    'par: 18',
    'map: |',
    ...MAP.map((row) => `  ${row}`),
    'guards:',
    '  - id: g1',
    `    route: ${guardRoute}`,
    '    mode: pingpong',
    '    phase: 0',
    '    range: 3',
    'cameras:',
    '  - id: c1',
    '    at: [3,0]',
    '    dirs: [S, N]',
    '    hold: 2',
    '    phase: 0',
    '    range: 2',
    'lasers:',
    '  - id: l1',
    '    cells: [[1,9], [2,9]]',
    '    on: 2',
    '    off: 2',
    '    phase: 1',
  ].join('\n');
  return parseLevel(src);
}

/** The guard walks through the thief's start cell (detection at tick 1). */
const lvlDetected = lvl('[[1,1], [2,1]]');
/** The guard stays far from the start: waiting is safe for many ticks. */
const lvlSafe = lvl('[[4,2], [5,2], [6,2]]');

// 360 x 640 viewport: 39 px cells.
const layout: YapBoardLayout = yapComputeLayout(360, 640, 8, 12);

const S: YapCell = { x: 1, y: 1 };
const cell = (x: number, y: number): YapCell => ({ x, y });
const center = (c: YapCell): { x: number; y: number } => yapCellCenter(layout, c);
const pathOf = (input: YapPathInput): string[] => input.yapPath().map((c) => `${c.x},${c.y}`);

/** One stroke: press on `cells[0]`, drag through the rest, release on the last. */
function draw(input: YapPathInput, cells: readonly YapCell[]): void {
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (first === undefined || last === undefined) throw new Error('empty stroke');
  const p0 = center(first);
  input.yapPointerDown(p0.x, p0.y, 0);
  for (let i = 1; i < cells.length; i += 1) {
    const c = cells[i];
    if (c === undefined) continue;
    const p = center(c);
    input.yapPointerMove(p.x, p.y);
  }
  const pl = center(last);
  input.yapPointerUp(pl.x, pl.y, 10);
}

/** A tap on a cell (adds a pause when the cell is on the path, not the last). */
function tap(input: YapPathInput, c: YapCell): void {
  const p = center(c);
  input.yapPointerDown(p.x, p.y, 1000);
  input.yapPointerUp(p.x, p.y, 1100);
}

// ---------------------------------------------------------------------------
// YapGhostPreview — the world at a tick, through resolveTick only
// ---------------------------------------------------------------------------

describe('YapGhostPreview.yapAt', () => {
  it('tick 0 is exactly the initial state (guards, cameras, lasers)', () => {
    const ghost = new YapGhostPreview(lvlDetected);
    const init = createInitialState(lvlDetected);
    const g0 = ghost.yapAt(0);
    expect(g0.tick).toBe(0);
    expect(g0.guards).toEqual(init.guards);
    expect(g0.cameras).toEqual(init.cameras);
    expect(g0.lasers).toEqual(init.lasers);
  });

  it('matches the simulated world at every tick of a safe plan', () => {
    const level = lvlSafe;
    const ghost = new YapGhostPreview(level);
    const waits = Array.from({ length: 12 }, () => 'wait' as const);
    const result = run(level, waits);
    expect(result.outcome.kind).toBe('running');
    expect(result.frames.length).toBe(13);
    for (let k = 0; k <= 12; k += 1) {
      const frame = result.frames[k];
      if (frame === undefined) throw new Error('missing frame');
      const g = ghost.yapAt(k);
      expect(g.tick).toBe(k);
      expect(g.guards).toEqual(frame.guards);
      expect(g.cameras).toEqual(frame.cameras);
      expect(g.lasers).toEqual(frame.lasers);
    }
  });

  it('resolves ticks beyond a detection (the preview shows threats, not the outcome)', () => {
    const level = lvlDetected;
    const ghost = new YapGhostPreview(level);
    // a waiting thief is seen by the guard at tick 1: run() stops there
    const result = run(level, ['wait', 'wait', 'wait']);
    expect(result.outcome.kind).toBe('detected');
    expect(result.frames.length).toBe(2);
    // the ghost still resolves tick 5, with the guard where the patrol puts it
    const g5 = ghost.yapAt(5);
    expect(g5.tick).toBe(5);
    const guard = g5.guards[0];
    expect(guard?.pos).toEqual(cell(2, 1));
    expect(guard?.facing).toBe('W');
    expect(guard?.seen).toEqual(visibleCells(level, cell(2, 1), 'W', 3));
    // laser l1: on 2 / off 2, phase 1 — (5 + 1) % 4 = 2 >= 2, so off at tick 5
    expect(g5.lasers[0]?.active).toBe(false);
    expect(ghost.yapAt(0).lasers[0]?.active).toBe(true);
  });

  it('caches per tick and rejects invalid ticks', () => {
    const ghost = new YapGhostPreview(lvlSafe);
    expect(ghost.yapAt(4)).toBe(ghost.yapAt(4)); // same cached object
    expect(() => ghost.yapAt(-1)).toThrow(YapGhostError);
    expect(() => ghost.yapAt(1.5)).toThrow(YapGhostError);
    expect(() => ghost.yapAt(YAP_MAX_TICKS + 1)).toThrow(YapGhostError);
    expect(ghost.yapAt(YAP_MAX_TICKS).tick).toBe(YAP_MAX_TICKS);
  });
});

describe('yapGhostCones — exactly visibleCells at the ghost tick', () => {
  it('guard and camera cones are the visibleCells cells for that tick', () => {
    const level = lvlDetected;
    const ghost = new YapGhostPreview(level);
    for (const tick of [0, 1, 2, 3, 7, 8]) {
      const g = ghost.yapAt(tick);
      const cones = yapGhostCones(level, g);
      expect(cones.guards.length).toBe(level.guards.length);
      expect(cones.cameras.length).toBe(level.cameras.length);
      g.guards.forEach((guard, i) => {
        const def = level.guards[i];
        if (def === undefined) throw new Error('missing guard def');
        expect(cones.guards[i]).toEqual(visibleCells(level, guard.pos, guard.facing, def.range));
      });
      g.cameras.forEach((cam, i) => {
        const def = level.cameras[i];
        if (def === undefined) throw new Error('missing camera def');
        expect(cones.cameras[i]).toEqual(visibleCells(level, cam.at, cam.facing, def.range));
      });
    }
  });
});

// ---------------------------------------------------------------------------
// The ghost flag, resolved read-only from src/app/config.ts
// ---------------------------------------------------------------------------

describe('ghost flag (?flag=ghost:0/1)', () => {
  it('is on by default', () => {
    expect(yapResolveGhostFlag('')).toBe(true);
    expect(yapResolveGhostFlag('?internal=1')).toBe(true);
  });

  it('?flag=ghost:0 turns it off, ?flag=ghost:1 turns it back on (last wins)', () => {
    expect(yapResolveGhostFlag('?flag=ghost:0')).toBe(false);
    expect(yapResolveGhostFlag('?flag=ghost:1')).toBe(true);
    expect(yapResolveGhostFlag('?flag=ghost:0&flag=ghost:1')).toBe(true);
    expect(yapResolveGhostFlag('?flag=ghost:1&flag=ghost:0')).toBe(false);
    expect(yapResolveGhostFlag('?flag=ghost:0,ghost:1')).toBe(true);
  });

  it('ignores unknown flags and invalid values', () => {
    expect(yapResolveGhostFlag('?flag=other:1')).toBe(true);
    expect(yapResolveGhostFlag('?flag=ghost:2')).toBe(true);
    expect(yapResolveGhostFlag('?flag=ghost')).toBe(true);
  });

  it('honours a stored flag unless the URL overrides it', () => {
    expect(yapResolveGhostFlag('', { ghost: false })).toBe(false);
    expect(yapResolveGhostFlag('?flag=ghost:1', { ghost: false })).toBe(true);
    expect(yapResolveGhostFlag('?flag=ghost:0', { ghost: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The hook in YapPathInput — preview while drawing, behind the flag
// ---------------------------------------------------------------------------

describe('YapPathInput ghost hook', () => {
  it('is hidden when not drawing, even with the flag on (default)', () => {
    const input = new YapPathInput(lvlDetected, layout);
    expect(input.yapIsGhostVisible()).toBe(false);
    expect(input.yapGhostCell()).toBeNull();
    expect(input.yapGhostTick()).toBeNull();
    expect(input.yapGhostState()).toBeNull();
  });

  it('shows guards and cones at the tick of the cell under the finger while drawing', () => {
    const level = lvlDetected;
    const input = new YapPathInput(level, layout);
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    // the stroke has started on the last cell (the thief): tick 0
    expect(input.yapIsGhostVisible()).toBe(true);
    expect(input.yapGhostCell()).toEqual(S);
    expect(input.yapGhostTick()).toBe(0);
    const p1 = center(cell(2, 1));
    input.yapPointerMove(p1.x, p1.y);
    expect(input.yapGhostCell()).toEqual(cell(2, 1));
    expect(input.yapGhostTick()).toBe(1);
    const state = input.yapGhostState();
    expect(state?.tick).toBe(1);
    if (state === null) throw new Error('ghost state expected while drawing');
    // the guard is where the patrol puts it at tick 1, with its exact cone
    expect(state.guards[0]?.pos).toEqual(cell(2, 1));
    expect(state.guards[0]?.facing).toBe('W');
    expect(state.guards[0]?.seen).toEqual(visibleCells(level, cell(2, 1), 'W', 3));
    expect(yapGhostCones(level, state).guards[0]).toEqual(
      visibleCells(level, cell(2, 1), 'W', 3),
    );
    input.yapPointerUp(p1.x, p1.y, 10);
    // released: the preview is gone
    expect(input.yapIsGhostVisible()).toBe(false);
    expect(input.yapGhostTick()).toBeNull();
    expect(input.yapGhostState()).toBeNull();
  });

  it('the ghost tick equals the simulated tick of the cell under the finger', () => {
    const level = lvlSafe;
    const input = new YapPathInput(level, layout);
    // draw S -> (2,1) -> (3,1) and keep the finger on (3,1)
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    input.yapPointerMove(center(cell(2, 1)).x, center(cell(2, 1)).y);
    input.yapPointerMove(center(cell(3, 1)).x, center(cell(3, 1)).y);
    expect(input.yapGhostTick()).toBe(2);
    const state = input.yapGhostState();
    const prefix = run(level, ['E', 'E']);
    const frame = prefix.frames[2];
    if (frame === undefined) throw new Error('missing frame');
    expect(state?.guards).toEqual(frame.guards);
    expect(state?.cameras).toEqual(frame.cameras);
    expect(state?.lasers).toEqual(frame.lasers);
    input.yapPointerUp(center(cell(3, 1)).x, center(cell(3, 1)).y, 10);
  });

  it('counts the pauses before the cell under the finger in its tick', () => {
    const input = new YapPathInput(lvlSafe, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    tap(input, cell(2, 1)); // one pause on (2,1): pauses [0, 1, 0]
    expect(input.yapPauseCounts()).toEqual([0, 1, 0]);
    // extend from the last cell (3,1) to (4,1), finger on (4,1)
    const p = center(cell(3, 1));
    input.yapPointerDown(p.x, p.y, 2000);
    input.yapPointerMove(center(cell(4, 1)).x, center(cell(4, 1)).y);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1', '4,1']);
    expect(input.yapGhostTick()).toBe(4); // 3 moves + 1 pause before (4,1)
    // erase back to (3,1): its tick is 2 moves + 1 pause
    input.yapPointerMove(center(cell(3, 1)).x, center(cell(3, 1)).y);
    expect(input.yapGhostTick()).toBe(3);
    input.yapPointerUp(center(cell(3, 1)).x, center(cell(3, 1)).y, 2100);
  });

  it('is fully disabled with ghost: false (the ?flag=ghost:0 case)', () => {
    const input = new YapPathInput(lvlDetected, layout, { ghost: false });
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    input.yapPointerMove(center(cell(2, 1)).x, center(cell(2, 1)).y);
    // drawing still works, but no preview is exposed
    expect(pathOf(input)).toEqual(['1,1', '2,1']);
    expect(input.yapIsDrawing()).toBe(true);
    expect(input.yapIsGhostVisible()).toBe(false);
    expect(input.yapGhostCell()).toBeNull();
    expect(input.yapGhostTick()).toBeNull();
    expect(input.yapGhostState()).toBeNull();
    input.yapPointerUp(center(cell(2, 1)).x, center(cell(2, 1)).y, 10);
  });

  it('hides again after Clear', () => {
    const input = new YapPathInput(lvlSafe, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    const p = center(cell(3, 1));
    input.yapPointerDown(p.x, p.y, 0);
    expect(input.yapIsGhostVisible()).toBe(true);
    input.yapClear();
    expect(input.yapIsGhostVisible()).toBe(false);
    expect(input.yapGhostState()).toBeNull();
  });
});
