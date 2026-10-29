// Tests for story C3 — YapExecution (src/game/execution.ts), the playback
// controller of the Execution screen. Like YapPathInput, it is pure and
// Phaser-free, so the whole playback contract of the Gate 1 spec is tested
// here in node: the plan runs through resolveTick (src/core/sim.ts) at
// 4 ticks/s with an optional ×2 and a Stop, and the displayed positions must
// equal the simulated positions at every tick (dev assertion).
import { describe, expect, it } from 'vitest';
import { parseLevel, YAP_MAX_TICKS, type YapLevel } from '../../src/core/level';
import { run, type YapPlan, type YapSimState } from '../../src/core/sim';
import {
  YapExecution,
  YapExecutionError,
  YAP_TICKS_PER_SECOND,
  type YapDisplayedSnapshot,
} from '../../src/game/execution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 8 x 12, S=(1,1), L=(3,10), E=(6,10), no interior walls: 60 open cells.
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

// Same grid with a pingpong guard watching the top corridor.
const GUARD_MAP = [
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

function lvl(mapRows: readonly string[], extra: readonly string[] = []): YapLevel {
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

const openLevel = (): YapLevel => lvl(OPEN_MAP);

const guardLevel = (): YapLevel =>
  lvl(GUARD_MAP, [
    'guards:',
    '  - id: g1',
    '    route: [[4,1], [5,1]]',
    '    mode: pingpong',
    '    phase: 0',
    '    range: 3',
  ]);

/** The winning plan of the open level: (1,1) -> (3,10) loot -> (6,10) exit. */
const WIN_PLAN: YapPlan = ['E', 'E', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'E', 'E', 'E'];

/** What a renderer records on screen for one frame (the "displayed" state). */
function snapshotOf(frame: YapSimState): YapDisplayedSnapshot {
  return {
    tick: frame.tick,
    thief: frame.thief,
    guards: frame.guards.map((g) => ({ pos: g.pos, facing: g.facing })),
    cameras: frame.cameras.map((c) => ({ at: c.at, facing: c.facing })),
    lasers: frame.lasers.map((l) => ({ cells: l.cells, active: l.active })),
  };
}

// ---------------------------------------------------------------------------
// Playback through resolveTick
// ---------------------------------------------------------------------------

describe('YapExecution — frames come from resolveTick', () => {
  it('produces one frame per tick, tick 0 included, and wins on the exit', () => {
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    expect(exec.yapFrames().length).toBe(WIN_PLAN.length + 1);
    expect(exec.yapTick()).toBe(0);
    expect(exec.yapFrame().tick).toBe(0);
    expect(exec.yapMaxTick()).toBe(WIN_PLAN.length);
    expect(exec.yapOutcome()).toEqual({ kind: 'won', tick: WIN_PLAN.length });
    const last = exec.yapFrames()[exec.yapMaxTick()];
    expect(last?.thief).toEqual({ x: 6, y: 10 });
    expect(last?.hasLoot).toBe(true);
  });

  it('matches run() (src/core/sim.ts) frame by frame on a scripted plan', () => {
    const level = guardLevel();
    const plan: YapPlan = ['E', 'E', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'E', 'E', 'E'];
    const exec = new YapExecution(level, plan);
    const reference = run(level, plan).frames;
    expect(exec.yapFrames().length).toBe(reference.length);
    for (let i = 0; i < reference.length; i += 1) {
      const got = exec.yapFrames()[i];
      const want = reference[i];
      expect(got?.tick).toBe(want?.tick);
      expect(got?.thief).toEqual(want?.thief);
      expect(got?.guards.map((g) => `${g.pos.x},${g.pos.y},${g.facing}`)).toEqual(
        want?.guards.map((g) => `${g.pos.x},${g.pos.y},${g.facing}`),
      );
      expect(got?.outcome).toEqual(want?.outcome);
    }
  });

  it('stops the frames at the first detection, with the cause', () => {
    // The guard watches the top corridor: walking east is spotted.
    const exec = new YapExecution(guardLevel(), ['E', 'E', 'E']);
    const outcome = exec.yapOutcome();
    expect(outcome.kind).toBe('detected');
    if (outcome.kind === 'detected') {
      expect(outcome.cause).toBe('guard');
      expect(outcome.tick).toBeLessThanOrEqual(3);
    }
    // frames end on the detection tick: no frame after it
    expect(exec.yapFrames().length).toBe(outcome.kind === 'detected' ? outcome.tick + 1 : 4);
  });

  it('rejects a plan longer than the 64-step limit', () => {
    const plan: YapPlan = Array.from({ length: YAP_MAX_TICKS + 1 }, () => 'wait' as const);
    expect(() => new YapExecution(openLevel(), plan)).toThrow(YapExecutionError);
  });
});

// ---------------------------------------------------------------------------
// Displayed positions = simulated positions at every tick (dev assertion)
// ---------------------------------------------------------------------------

describe('YapExecution — displayed == simulated at every tick', () => {
  it('asserts a matching displayed snapshot at every tick of a scripted plan', () => {
    const level = guardLevel();
    const plan: YapPlan = ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'E', 'E', 'E', 'E', 'E'];
    const exec = new YapExecution(level, plan);
    const reference = run(level, plan).frames;
    exec.yapStart();
    // tick 0: the renderer draws the initial frame
    let displayed = snapshotOf(exec.yapFrame());
    exec.yapAssertDisplayedMatchesSim(displayed);
    expect(displayed.thief).toEqual(reference[0]?.thief);
    let steps = 0;
    for (;;) {
      const frame = exec.yapAdvance();
      if (frame === null) break;
      steps += 1;
      // the renderer draws exactly what the controller advanced to
      displayed = snapshotOf(frame);
      exec.yapAssertDisplayedMatchesSim(displayed); // must not throw
      const want = reference[steps];
      expect(displayed.tick).toBe(want?.tick);
      expect(displayed.thief).toEqual(want?.thief);
      expect(displayed.guards).toEqual(want?.guards.map((g) => ({ pos: g.pos, facing: g.facing })));
      expect(displayed.cameras).toEqual(want?.cameras.map((c) => ({ at: c.at, facing: c.facing })));
      expect(displayed.lasers).toEqual(
        want?.lasers.map((l) => ({ cells: l.cells, active: l.active })),
      );
    }
    expect(steps).toBe(reference.length - 1);
    expect(exec.yapIsFinished()).toBe(true);
  });

  it('throws when the displayed thief is not the simulated one', () => {
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    exec.yapStart();
    exec.yapAdvance();
    const frame = exec.yapFrame();
    const tampered: YapDisplayedSnapshot = {
      ...snapshotOf(frame),
      thief: { x: frame.thief.x + 1, y: frame.thief.y },
    };
    expect(() => exec.yapAssertDisplayedMatchesSim(tampered)).toThrow(YapExecutionError);
  });

  it('throws when the displayed state is stale (previous tick)', () => {
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    exec.yapStart();
    const stale = snapshotOf(exec.yapFrame()); // tick 0
    exec.yapAdvance(); // simulated tick 1, display not redrawn
    expect(() => exec.yapAssertDisplayedMatchesSim(stale)).toThrow(YapExecutionError);
  });

  it('throws when a displayed guard position drifts from the simulation', () => {
    const exec = new YapExecution(guardLevel(), ['S', 'S', 'S']);
    exec.yapStart();
    exec.yapAdvance();
    const frame = exec.yapFrame();
    const guards = snapshotOf(frame).guards.map((g, i) =>
      i === 0 ? { pos: { x: g.pos.x, y: g.pos.y + 1 }, facing: g.facing } : g,
    );
    expect(() => exec.yapAssertDisplayedMatchesSim({ ...snapshotOf(frame), guards })).toThrow(
      YapExecutionError,
    );
  });
});

// ---------------------------------------------------------------------------
// Timing: 4 ticks/s, ×2, Stop
// ---------------------------------------------------------------------------

describe('YapExecution — 4 ticks/s, ×2, Stop', () => {
  it('runs at 4 ticks per second by default (250 ms per tick)', () => {
    expect(YAP_TICKS_PER_SECOND).toBe(4);
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    expect(exec.yapSpeed()).toBe(1);
    expect(exec.yapTickMs()).toBe(250);
  });

  it('×2 halves the tick period (125 ms) and toggles back', () => {
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    expect(exec.yapToggleSpeed()).toBe(2);
    expect(exec.yapTickMs()).toBe(125);
    expect(exec.yapToggleSpeed()).toBe(1);
    expect(exec.yapTickMs()).toBe(250);
  });

  it('the speed never changes the simulated frames', () => {
    const a = new YapExecution(openLevel(), WIN_PLAN);
    const b = new YapExecution(openLevel(), WIN_PLAN);
    b.yapToggleSpeed();
    a.yapStart();
    b.yapStart();
    for (;;) {
      const fa = a.yapAdvance();
      const fb = b.yapAdvance();
      expect(fa?.tick).toBe(fb?.tick);
      expect(fa?.thief).toEqual(fb?.thief);
      if (fa === null || fb === null) break;
    }
  });

  it('advances only while playing and returns null once finished', () => {
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    expect(exec.yapAdvance()).toBeNull(); // not started yet
    exec.yapStart();
    expect(exec.yapIsPlaying()).toBe(true);
    let last: YapSimState | null = null;
    for (;;) {
      const frame = exec.yapAdvance();
      if (frame === null) break;
      last = frame;
    }
    expect(last?.tick).toBe(WIN_PLAN.length);
    expect(exec.yapIsFinished()).toBe(true);
    expect(exec.yapIsPlaying()).toBe(false);
    expect(exec.yapAdvance()).toBeNull();
  });

  it('Stop goes back to the plan: tick 0, not playing, initial frame', () => {
    const exec = new YapExecution(openLevel(), WIN_PLAN);
    exec.yapStart();
    exec.yapAdvance();
    exec.yapAdvance();
    expect(exec.yapTick()).toBe(2);
    exec.yapStop();
    expect(exec.yapIsPlaying()).toBe(false);
    expect(exec.yapTick()).toBe(0);
    expect(exec.yapFrame().tick).toBe(0);
    expect(exec.yapFrame().thief).toEqual({ x: 1, y: 1 });
    expect(exec.yapAdvance()).toBeNull(); // stopped: no more ticks
    // and it can play again from the start
    exec.yapStart();
    expect(exec.yapAdvance()?.tick).toBe(1);
  });
});
