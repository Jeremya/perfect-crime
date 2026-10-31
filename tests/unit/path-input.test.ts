// Tests for story C2 — the path-drawing state machine of the Planning screen
// (src/game/path-input.ts). The machine is pure and Phaser-free, so the whole
// input contract of the Gate 1 spec ("Path drawing" + "Pauses") is tested here
// in node: central zone, erase by going back, cut, fast-swipe fill, pauses on
// tap, the 64-step limit and the auto-finish at the exit.
import { describe, expect, it } from 'vitest';
import { parseLevel, YAP_MAX_TICKS, type YapCell, type YapLevel } from '../../src/core/level';
import { run } from '../../src/core/sim';
import { yapCellCenter, yapComputeLayout, type YapBoardLayout } from '../../src/game/board';
import {
  YapPathInput,
  YAP_CENTRAL_ZONE,
  YAP_TAP_MAX_DISTANCE,
  YAP_TAP_MAX_DURATION,
} from '../../src/game/path-input';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 8 x 12, S=(1,1), L=(3,10), E=(6,10), interior walls at (3,3) and (3,4).
const MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#..#...#',
  '#..#...#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#..L..E#',
  '########',
];

// Same grid without interior walls (60 open cells, for the step-limit tests).
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

function lvl(mapRows: readonly string[], maxPauses = 3): YapLevel {
  const src = [
    'name: Test',
    'type: tutorial',
    'moment: ""',
    `maxPauses: ${maxPauses}`,
    'par: 18',
    'map: |',
    ...mapRows.map((row) => `  ${row}`),
  ].join('\n');
  return parseLevel(src);
}

// 360 x 640 viewport: 39 px cells, board origin (24, 70).
const layout: YapBoardLayout = yapComputeLayout(360, 640, 8, 12);
// 390 x 844 viewport: 47 px cells, board origin (7, 124).
const layoutWide: YapBoardLayout = yapComputeLayout(390, 844, 8, 12);

const S: YapCell = { x: 1, y: 1 };
const cell = (x: number, y: number): YapCell => ({ x, y });
const center = (c: YapCell): { x: number; y: number } => yapCellCenter(layout, c);
const centerWide = (c: YapCell): { x: number; y: number } => yapCellCenter(layoutWide, c);

/** A point in the border zone of a cell (outside its central 70%). */
function borderPoint(c: YapCell): { x: number; y: number } {
  const p = center(c);
  return { x: p.x + layout.cell * 0.4, y: p.y };
}

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

/** A tap (or a near-tap) on a cell, with optional pixel drift and duration. */
function tap(
  input: YapPathInput,
  c: YapCell,
  opts: { at?: number; dt?: number; dx?: number; dy?: number } = {},
): void {
  const p = center(c);
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  const at = opts.at ?? 1000;
  const dt = opts.dt ?? 100;
  input.yapPointerDown(p.x, p.y, at);
  input.yapPointerMove(p.x + dx, p.y + dy);
  input.yapPointerUp(p.x + dx, p.y + dy, at + dt);
}

const same = (a: YapCell, b: YapCell): boolean => a.x === b.x && a.y === b.y;

/** Deterministic PRNG (LCG) for the fast-drawing property test. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Cells the machine's straight-line fill walk visits from `from` towards `to`. */
function walkCells(from: YapCell, to: YapCell): YapCell[] {
  const out: YapCell[] = [];
  let cur = from;
  while (!same(cur, to)) {
    const dx = to.x - cur.x;
    const dy = to.y - cur.y;
    const step =
      Math.abs(dx) >= Math.abs(dy)
        ? { x: cur.x + Math.sign(dx), y: cur.y }
        : { x: cur.x, y: cur.y + Math.sign(dy) };
    if (step.x === cur.x && step.y === cur.y) break;
    out.push(step);
    cur = step;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Central zone
// ---------------------------------------------------------------------------

describe('central zone (70% of the cell)', () => {
  const level = lvl(MAP);

  it('resolves the cell at its centre, and null in the border zone', () => {
    const input = new YapPathInput(level, layout);
    expect(input.yapCellAtPoint(center(cell(2, 1)).x, center(cell(2, 1)).y)).toEqual(cell(2, 1));
    expect(input.yapCellAtPoint(borderPoint(cell(2, 1)).x, borderPoint(cell(2, 1)).y)).toBeNull();
    // outside the board
    expect(input.yapCellAtPoint(-5, -5)).toBeNull();
    expect(input.yapCellAtPoint(layout.originX + layout.boardWidth + 1, 100)).toBeNull();
  });

  it('exposes the 70% ratio and the tap thresholds of the spec', () => {
    expect(YAP_CENTRAL_ZONE).toBe(0.7);
    expect(YAP_TAP_MAX_DISTANCE).toBe(8);
    expect(YAP_TAP_MAX_DURATION).toBe(250);
  });

  it('a move into the border zone of a cell does not add it (no stray jumps)', () => {
    const input = new YapPathInput(level, layout);
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    const b = borderPoint(cell(2, 1));
    input.yapPointerMove(b.x, b.y);
    expect(pathOf(input)).toEqual(['1,1']);
    const c = center(cell(2, 1));
    input.yapPointerMove(c.x, c.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1']);
  });
});

// ---------------------------------------------------------------------------
// Drawing: start, extend, erase by going back, cut
// ---------------------------------------------------------------------------

describe('drawing the plan', () => {
  const level = lvl(MAP);

  it('starts from the thief and extends from the last cell only', () => {
    const input = new YapPathInput(level, layout);
    // pressing a cell that is not on the path starts nothing
    const p = center(cell(4, 4));
    input.yapPointerDown(p.x, p.y, 0);
    const q = center(cell(5, 4));
    input.yapPointerMove(q.x, q.y);
    input.yapPointerUp(q.x, q.y, 10);
    expect(pathOf(input)).toEqual(['1,1']);
    // from the thief
    draw(input, [S, cell(2, 1)]);
    expect(pathOf(input)).toEqual(['1,1', '2,1']);
    // extend from the last cell
    draw(input, [cell(2, 1), cell(3, 1)]);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1']);
  });

  it('erases the last step when moving back onto the second-to-last cell', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1), cell(4, 1)]);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1', '4,1']);
    const p0 = center(cell(4, 1));
    input.yapPointerDown(p0.x, p0.y, 0);
    const back = center(cell(3, 1));
    input.yapPointerMove(back.x, back.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1']);
    const back2 = center(cell(2, 1));
    input.yapPointerMove(back2.x, back2.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1']);
    const back3 = center(S);
    input.yapPointerMove(back3.x, back3.y);
    expect(pathOf(input)).toEqual(['1,1']);
  });

  it('cuts the path when touching another of its cells, then continues from there', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1), cell(4, 1)]);
    const p0 = center(cell(4, 1));
    input.yapPointerDown(p0.x, p0.y, 0);
    const cut = center(cell(2, 1));
    input.yapPointerMove(cut.x, cut.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1']);
    const next = center(cell(2, 2));
    input.yapPointerMove(next.x, next.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '2,2']);
  });

  it('cuts when pressing a middle path cell and dragging away', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    const p = center(cell(2, 1));
    input.yapPointerDown(p.x, p.y, 0);
    const next = center(cell(2, 2));
    input.yapPointerMove(next.x, next.y);
    input.yapPointerUp(next.x, next.y, 10);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '2,2']);
  });

  it('lets the path revisit a cell already drawn (after a cut), never via an immediate U-turn', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1), cell(4, 1)]);
    // cut back to (2,1) then redraw over (3,1): a revisit, not a U-turn
    const p0 = center(cell(4, 1));
    input.yapPointerDown(p0.x, p0.y, 0);
    const cut = center(cell(2, 1));
    input.yapPointerMove(cut.x, cut.y);
    const re = center(cell(3, 1));
    input.yapPointerMove(re.x, re.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1']);
    // the path never contains an immediate U-turn (A -> B -> A)
    const cells = input.yapPath();
    for (let i = 2; i < cells.length; i += 1) {
      const a = cells[i - 2];
      const b = cells[i];
      if (a !== undefined && b !== undefined) expect(same(a, b)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Fast swipes
// ---------------------------------------------------------------------------

describe('fast swipes (skipped cells)', () => {
  const level = lvl(MAP);

  it('fills a fast swipe cell by cell, in a straight line', () => {
    const input = new YapPathInput(level, layout);
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    const far = center(cell(6, 1));
    input.yapPointerMove(far.x, far.y); // one single event, 5 cells away
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1', '4,1', '5,1', '6,1']);
  });

  it('fills a diagonal swipe as a staircase and stops at the first wall', () => {
    const input = new YapPathInput(level, layout);
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    const wall = center(cell(3, 3)); // (3,3) is a wall
    input.yapPointerMove(wall.x, wall.y);
    // walk from (1,1) towards (3,3): (2,1), (2,2), (3,2), then (3,3) is a wall: stop
    expect(pathOf(input)).toEqual(['1,1', '2,1', '2,2', '3,2']);
    for (const c of input.yapPath()) {
      expect(level.map[c.y]?.charAt(c.x)).not.toBe('#');
    }
  });
});

// ---------------------------------------------------------------------------
// Step limit (64 at most, pauses included)
// ---------------------------------------------------------------------------

describe('step limit', () => {
  it('never lets the plan exceed the 64-step limit of the spec', () => {
    const level = lvl(OPEN_MAP);
    const input = new YapPathInput(level, layout);
    // snake through all 60 open cells: 59 moves
    const snake: YapCell[] = [S];
    for (let y = 1; y <= 10; y += 1) {
      const xs = y % 2 === 1 ? [1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1];
      for (const x of xs) {
        const prev = snake[snake.length - 1];
        if (prev !== undefined && !(prev.x === x && prev.y === y)) snake.push(cell(x, y));
      }
    }
    draw(input, snake);
    expect(input.yapPath().length).toBe(60);
    expect(input.yapSteps()).toBe(59);
    // pauses are steps too: 59 moves + 3 pauses = 62, still within 64
    tap(input, cell(2, 1));
    tap(input, cell(2, 1));
    tap(input, cell(2, 1));
    expect(input.yapTotalPauses()).toBe(3);
    expect(input.yapSteps()).toBe(62);
    expect(input.yapSteps()).toBeLessThanOrEqual(YAP_MAX_TICKS);
  });

  it('refuses to add a cell beyond the step limit (tunable threshold)', () => {
    const level = lvl(OPEN_MAP);
    const input = new YapPathInput(level, layout, { maxSteps: 5 });
    draw(input, [S, cell(2, 1), cell(3, 1), cell(4, 1), cell(5, 1), cell(6, 1)]);
    expect(input.yapSteps()).toBe(5);
    const p0 = center(cell(6, 1));
    input.yapPointerDown(p0.x, p0.y, 0);
    const next = center(cell(6, 2));
    input.yapPointerMove(next.x, next.y);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1', '4,1', '5,1', '6,1']);
    expect(input.yapSteps()).toBe(5);
  });

  it('refuses a pause that would exceed the step limit', () => {
    const level = lvl(OPEN_MAP, 3);
    const input = new YapPathInput(level, layout, { maxSteps: 3 });
    draw(input, [S, cell(2, 1), cell(3, 1), cell(4, 1)]); // 3 moves = 3 steps
    tap(input, cell(2, 1)); // would be step 4 > 3
    expect(input.yapTotalPauses()).toBe(0);
    expect(input.yapPausesLeft()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Pauses on tap
// ---------------------------------------------------------------------------

describe('pauses on tap', () => {
  const level = lvl(MAP);

  it('a tap on a path cell (except the last) adds a one-tick pause; tapping again increments', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    tap(input, cell(2, 1));
    expect(input.yapPauseCounts()).toEqual([0, 1, 0]);
    expect(input.yapTotalPauses()).toBe(1);
    expect(input.yapPausesLeft()).toBe(2);
    expect(input.yapSteps()).toBe(3); // 2 moves + 1 pause
    tap(input, cell(2, 1));
    expect(input.yapPauseCounts()).toEqual([0, 2, 0]);
    expect(input.yapSteps()).toBe(4);
  });

  it('a tap on the last cell adds no pause', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    tap(input, cell(3, 1));
    expect(input.yapTotalPauses()).toBe(0);
  });

  it('a pause on the start cell makes the thief wait before leaving (plan starts with wait)', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1)]);
    tap(input, S);
    expect(input.yapPauseCounts()).toEqual([1, 0]);
    expect(input.yapPlan()).toEqual(['wait', 'E']);
  });

  it('a touch of 8 px or more, or 250 ms or more, is not a tap', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    tap(input, cell(2, 1), { dx: YAP_TAP_MAX_DISTANCE, dt: 100 }); // exactly 8 px
    expect(input.yapTotalPauses()).toBe(0);
    tap(input, cell(2, 1), { dx: 0, dt: YAP_TAP_MAX_DURATION }); // exactly 250 ms
    expect(input.yapTotalPauses()).toBe(0);
    tap(input, cell(2, 1), { dx: YAP_TAP_MAX_DISTANCE - 1, dt: YAP_TAP_MAX_DURATION - 1 });
    expect(input.yapTotalPauses()).toBe(1);
  });

  it('a drag is not a tap: moving to another cell draws instead of pausing', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    const p = center(cell(2, 1));
    input.yapPointerDown(p.x, p.y, 1000);
    const next = center(cell(2, 2));
    input.yapPointerMove(next.x, next.y);
    input.yapPointerUp(next.x, next.y, 1100);
    expect(input.yapTotalPauses()).toBe(0);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '2,2']);
  });

  it('caps the pauses at the level maximum in total, then the cell goes back to zero', () => {
    const level3 = lvl(MAP, 3);
    const input = new YapPathInput(level3, layout);
    draw(input, [S, cell(2, 1), cell(3, 1), cell(4, 1)]);
    tap(input, cell(2, 1));
    tap(input, cell(2, 1));
    tap(input, cell(3, 1));
    expect(input.yapTotalPauses()).toBe(3);
    expect(input.yapPausesLeft()).toBe(0);
    // maximum reached in total: tapping a cell without pauses changes nothing
    tap(input, S);
    expect(input.yapPauseCounts()).toEqual([0, 2, 1, 0]);
    // tapping a cell that holds pauses sends it back to zero
    tap(input, cell(2, 1));
    expect(input.yapPauseCounts()).toEqual([0, 0, 1, 0]);
    expect(input.yapPausesLeft()).toBe(2);
  });

  it('derives the plan (moves + waits) from cells and pauses', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    tap(input, S); // 1 wait on the start cell
    tap(input, cell(2, 1));
    tap(input, cell(2, 1)); // 2 waits on (2,1)
    expect(input.yapPlan()).toEqual(['wait', 'E', 'wait', 'wait', 'E']);
    expect(input.yapSteps()).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Auto-finish at the exit
// ---------------------------------------------------------------------------

describe('auto-finish at the exit', () => {
  const level = lvl(MAP);

  it('reaching the exit without the diamond does not finish; with the diamond it does', () => {
    const input = new YapPathInput(level, layout);
    // down the x=6 column straight to the exit (6,10), avoiding the loot (3,10)
    const toExit: YapCell[] = [S];
    for (let x = 2; x <= 6; x += 1) toExit.push(cell(x, 1));
    for (let y = 2; y <= 10; y += 1) toExit.push(cell(6, y));
    draw(input, toExit);
    expect(pathOf(input)[pathOf(input).length - 1]).toBe('6,10');
    expect(input.yapHasLoot()).toBe(false);
    expect(input.yapIsFinished()).toBe(false);
    expect(input.yapCanPlay()).toBe(false);
  });

  it('ends drawing at the exit; later drags do not extend the route', () => {
    const input = new YapPathInput(level, layout);
    // down the x=1 column to the loot row, through the loot (3,10), then to the exit (6,10)
    const route: YapCell[] = [S];
    for (let y = 2; y <= 10; y += 1) route.push(cell(1, y));
    for (let x = 2; x <= 6; x += 1) route.push(cell(x, 10));
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    for (let i = 1; i < route.length; i += 1) {
      const c = route[i];
      if (c === undefined) continue;
      const p = center(c);
      input.yapPointerMove(p.x, p.y);
      if (same(c, cell(5, 10))) {
        expect(input.yapIsFinished()).toBe(false); // not yet on the exit
      }
    }
    expect(pathOf(input)[pathOf(input).length - 1]).toBe('6,10');
    expect(input.yapHasLoot()).toBe(true);
    expect(input.yapIsFinished()).toBe(true);
    expect(input.yapCanPlay()).toBe(true);
    // the drawing has ended: dragging cannot extend the route
    const len = input.yapPath().length;
    const p = center(cell(5, 10));
    input.yapPointerMove(p.x, p.y);
    input.yapPointerDown(p.x, p.y, 500);
    input.yapPointerMove(center(cell(4, 10)).x, center(cell(4, 10)).y);
    expect(input.yapPath().length).toBe(len);
  });

  it('the drawn plan actually wins the level when run through the sim', () => {
    const input = new YapPathInput(level, layout);
    const route: YapCell[] = [S];
    for (let y = 2; y <= 10; y += 1) route.push(cell(1, y));
    for (let x = 2; x <= 6; x += 1) route.push(cell(x, 10));
    draw(input, route);
    expect(input.yapCanPlay()).toBe(true);
    const result = run(level, input.yapPlan());
    expect(result.outcome.kind).toBe('won');
  });

  it('allows adding a pause to a completed route, then keeps PLAY enabled', () => {
    const input = new YapPathInput(level, layout);
    const route: YapCell[] = [S];
    for (let y = 2; y <= 10; y += 1) route.push(cell(1, y));
    for (let x = 2; x <= 6; x += 1) route.push(cell(x, 10));
    draw(input, route);
    expect(input.yapCanPlay()).toBe(true);

    // Players can finish drawing first, then tap the cell where the thief
    // needs to wait (the same interaction required by Tutorial 4).
    tap(input, cell(1, 4));
    expect(input.yapPauseCounts()[3]).toBe(1);
    expect(input.yapCanPlay()).toBe(true);
    expect(input.yapPlan()[3]).toBe('wait');
    expect(run(level, input.yapPlan()).outcome.kind).toBe('won');
  });
});

// ---------------------------------------------------------------------------
// Clear and resize
// ---------------------------------------------------------------------------

describe('clear and resize', () => {
  const level = lvl(MAP);

  it('Clear empties the whole path back to the thief', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    tap(input, cell(2, 1));
    input.yapClear();
    expect(pathOf(input)).toEqual(['1,1']);
    expect(input.yapPauseCounts()).toEqual([0]);
    expect(input.yapSteps()).toBe(0);
    expect(input.yapIsFinished()).toBe(false);
    expect(input.yapCanPlay()).toBe(false);
  });

  it('keeps the drawn path across a resize (layout swap)', () => {
    const input = new YapPathInput(level, layout);
    draw(input, [S, cell(2, 1), cell(3, 1)]);
    input.yapSetLayout(layoutWide);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1']);
    // drawing continues with the new cell size
    const p = centerWide(cell(3, 1));
    input.yapPointerDown(p.x, p.y, 0);
    const next = centerWide(cell(3, 2));
    input.yapPointerMove(next.x, next.y);
    input.yapPointerUp(next.x, next.y, 10);
    expect(pathOf(input)).toEqual(['1,1', '2,1', '3,1', '3,2']);
  });
});

// ---------------------------------------------------------------------------
// Acceptance property: 20 fast drawings without an accidental erase
// ---------------------------------------------------------------------------

describe('20 fast drawings without an accidental erase', () => {
  const level = lvl(OPEN_MAP);

  it('keeps the path valid and only ever shortens it when the swipe touched the path', () => {
    const rand = lcg(20240601);
    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
    for (let iter = 0; iter < 20; iter += 1) {
      const input = new YapPathInput(level, layout);
      const p0 = center(S);
      input.yapPointerDown(p0.x, p0.y, 0);
      for (let step = 0; step < 40; step += 1) {
        const cells = input.yapPath();
        const last = cells[cells.length - 1];
        if (last === undefined) throw new Error('empty path');
        // a fast swipe: the pointer jumps up to 3 cells away in one event
        const tx = clamp(last.x + Math.floor(rand() * 7) - 3, 0, 7);
        const ty = clamp(last.y + Math.floor(rand() * 7) - 3, 0, 11);
        if (tx === last.x && ty === last.y) continue;
        const before = [...cells];
        const target = cell(tx, ty);
        const p = center(target);
        input.yapPointerMove(p.x, p.y);
        const after = input.yapPath();
        // the path stays a contiguous, wall-free, duplicate-free, U-turn-free chain
        expect(after.length).toBeGreaterThan(0);
        expect(new Set(pathOf(input)).size).toBe(after.length);
        for (let i = 1; i < after.length; i += 1) {
          const a = after[i - 1];
          const b = after[i];
          if (a === undefined || b === undefined) continue;
          expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
          expect(level.map[b.y]?.charAt(b.x)).not.toBe('#');
          const a2 = after[i - 2];
          if (i >= 2 && a2 !== undefined) expect(same(a2, b)).toBe(false);
        }
        expect(input.yapSteps()).toBeLessThanOrEqual(YAP_MAX_TICKS);
        // an accidental erase would shorten the path without the swipe having
        // touched a cell of the old path (directly or along the fill line)
        if (after.length < before.length) {
          const touched =
            before.some((c) => same(c, target)) ||
            walkCells(last, target).some((w) => before.some((c) => same(c, w)));
          expect(touched).toBe(true);
        }
      }
      const last = input.yapPath()[input.yapPath().length - 1];
      if (last !== undefined) {
        const p = center(last);
        input.yapPointerUp(p.x, p.y, 10);
      }
    }
  });
});
