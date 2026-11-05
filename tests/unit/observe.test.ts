// Tests for story X9, the Observer (tasks/X9.md): one cycle of the world before
// the route, the plan up to its first detection after it, and the ticks of the
// cell under the finger. The module is pure: every world comes from
// YapGhostPreview and yapPreviewStates, so through resolveTick.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapCell, type YapLevel } from '../../src/core/level';
import { run, type YapPlan } from '../../src/core/sim';
import { solveLevel } from '../../src/core/solver';
import { YapGhostPreview, type YapGhostState } from '../../src/game/ghost';
import {
  YapObserverRun,
  yapBandCaption,
  yapCellBand,
  yapDetectorCells,
  yapObserverCaption,
  yapPlanStates,
  yapResolveNightFlag,
  yapResolveObserverFlag,
  yapRoundStates,
  yapWorldCycle,
} from '../../src/game/observe';

const ENTRIES = (
  JSON.parse(readFileSync(new URL('../../levels/levels.json', import.meta.url), 'utf8')) as {
    levels: { id: string; level: YapLevel }[];
  }
).levels;
const PLAYED = ENTRIES.filter(({ id }) => /^(tutorial|daily)\//.test(id));

function shipped(id: string): YapLevel {
  const level = ENTRIES.find((entry) => entry.id === id)?.level;
  if (level === undefined) throw new Error(`no level ${id}`);
  return level;
}

// 8 x 12, S=(1,1), L=(3,10), E=(6,10), no interior walls.
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

function open(extra: readonly string[]): YapLevel {
  return parseLevel(
    [
      'name: Test',
      'type: tutorial',
      'moment: ""',
      'maxPauses: 3',
      'par: 18',
      'map: |',
      ...OPEN_MAP.map((row) => `  ${row}`),
      ...extra,
    ].join('\n'),
  );
}

const GUARD_SIGHT = open([
  'guards:',
  '  - id: g1',
  '    route: [[4,1], [5,1]]',
  '    mode: pingpong',
  '    phase: 0',
  '    range: 3',
]);
const CONTACT = open([
  'guards:',
  '  - id: g1',
  '    route: [[3,1], [2,1]]',
  '    mode: pingpong',
  '    phase: 0',
  '    range: 1',
]);
const CAMERA = open([
  'cameras:',
  '  - id: c1',
  '    at: [0,5]',
  '    dirs: [E]',
  '    hold: 24',
  '    phase: 0',
  '    range: 3',
]);
const LASER = open([
  'lasers:',
  '  - id: l1',
  '    cells: [[3,3], [4,3]]',
  '    on: 2',
  '    off: 2',
  '    phase: 0',
]);

/** What makes two worlds the same, for comparing ticks of a cycle. */
function worldOf(world: YapGhostState): unknown {
  return [
    world.guards.map((g) => [g.pos, g.facing, g.seen]),
    world.cameras.map((c) => [c.facing, c.seen]),
    world.lasers.map((l) => l.active),
  ];
}

describe('yapWorldCycle — how often the world repeats', () => {
  it.each([
    ['tutorial/t1', 1],
    ['tutorial/t2', 1],
    ['tutorial/t3', 8],
    ['tutorial/t4', 6],
    ['tutorial/t5', 24],
    ['daily/d1', 2],
    ['daily/d2', 12],
    ['daily/d3', 8],
    ['daily/d4', 12],
    ['daily/d5', 24],
    ['daily/d6', 24],
    ['daily/d7', 24],
  ])('%s repeats every %i ticks', (id, cycle) => {
    expect(yapWorldCycle(new YapGhostPreview(shipped(id)))).toBe(cycle);
  });

  it('is a true period of every shipped level', () => {
    for (const { id, level } of ENTRIES) {
      const ghost = new YapGhostPreview(level);
      const cycle = yapWorldCycle(ghost);
      for (let tick = 0; tick < 24; tick += 1) {
        expect(worldOf(ghost.yapAt(tick + cycle)), `${id} at ${tick}`).toEqual(
          worldOf(ghost.yapAt(tick)),
        );
      }
    }
  });
});

describe('yapRoundStates — one cycle, the thief on the start', () => {
  const level = shipped('tutorial/t4');
  const ghost = new YapGhostPreview(level);
  const round = yapRoundStates(level, ghost);

  it('holds one state per tick of the cycle', () => {
    expect(round.map((state) => state.tick)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('shows the world of the simulation at each tick', () => {
    for (const state of round) expect(worldOf(state)).toEqual(worldOf(ghost.yapAt(state.tick)));
  });

  it('leaves the thief on the start, with nothing to report', () => {
    for (const state of round) {
      expect(state.thief).toEqual(level.start);
      expect(state.outcome).toEqual({ kind: 'running' });
    }
  });
});

describe('yapPlanStates — the plan up to its first detection', () => {
  it('starts on tick 0 and stops where run() detects', () => {
    const plan: YapPlan = ['S', 'S', 'S', 'S', 'S', 'S'];
    const states = yapPlanStates(CAMERA, plan);
    const outcome = run(CAMERA, plan).outcome;
    expect(states[0]?.tick).toBe(0);
    expect(states[states.length - 1]?.outcome).toEqual(outcome);
    expect(states[states.length - 1]?.tick).toBe(4);
    expect(states).toHaveLength(5);
  });

  it('runs a winning plan to the win', () => {
    for (const { id, level } of PLAYED) {
      const { plan } = solveLevel(level);
      const states = yapPlanStates(level, plan);
      expect(states[states.length - 1]?.outcome.kind, id).toBe('won');
      expect(states, id).toHaveLength(plan.length + 1);
    }
  });
});

describe('the frame of a detection names its cause', () => {
  it.each([
    ['guard sight', GUARD_SIGHT, ['E'], 'observer.caughtGuard', 1],
    ['contact', CONTACT, ['E'], 'observer.caughtGuard', 1],
    ['camera', CAMERA, ['S', 'S', 'S', 'S'], 'observer.caughtCamera', 4],
    ['laser', LASER, ['E', 'E', 'S', 'S'], 'observer.caughtLaser', 4],
  ] as const)('%s', (_name, level, moves, key, tick) => {
    const plan: YapPlan = [...moves];
    const outcome = run(level, plan).outcome;
    expect(outcome).toMatchObject({ kind: 'detected', tick });
    const walk = new YapObserverRun('plan', yapPlanStates(level, plan), false);
    for (let i = 0; i < moves.length; i += 1) walk.yapStep(1);
    expect(walk.yapFrame().outcome).toEqual(outcome);
    expect(yapObserverCaption(walk)).toEqual({ key, params: { tick } });
  });

  it('draws the cone of the detector when the fatal cell is in it', () => {
    const states = yapPlanStates(GUARD_SIGHT, ['E']);
    const last = states[states.length - 1];
    if (last === undefined) throw new Error('no state');
    expect(yapDetectorCells(last)).toContainEqual(last.thief);
  });

  it('draws no cone on a contact: the cone does not hold the fatal cell', () => {
    const states = yapPlanStates(CONTACT, ['E']);
    const last = states[states.length - 1];
    if (last === undefined) throw new Error('no state');
    expect(yapDetectorCells(last)).toEqual([]);
  });

  it('draws the beam of a laser', () => {
    const states = yapPlanStates(LASER, ['E', 'E', 'S', 'S']);
    const last = states[states.length - 1];
    if (last === undefined) throw new Error('no state');
    expect(yapDetectorCells(last)).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
  });

  it('draws nothing on a frame without detection', () => {
    const first = yapPlanStates(CAMERA, ['S'])[0];
    if (first === undefined) throw new Error('no state');
    expect(yapDetectorCells(first)).toEqual([]);
  });
});

describe('YapObserverRun — stepping through the frames', () => {
  const level = shipped('tutorial/t4');
  const round = (): YapObserverRun =>
    new YapObserverRun('round', yapRoundStates(level, new YapGhostPreview(level)), true);
  const plan = (playing = true): YapObserverRun =>
    new YapObserverRun('plan', yapPlanStates(CAMERA, ['S', 'S', 'S', 'S']), playing);

  it('a round loops in both directions and keeps playing', () => {
    const run = round();
    run.yapStep(-1);
    expect(run.yapFrame().tick).toBe(5);
    run.yapStep(1);
    expect(run.yapFrame().tick).toBe(0);
    expect(run.playing).toBe(true);
  });

  it('counts a round by its length and a plan by its last tick', () => {
    expect(round().yapMaxTick()).toBe(6);
    expect(plan().yapMaxTick()).toBe(4);
  });

  it('a plan stops at both ends', () => {
    const walk = plan(false);
    walk.yapStep(-1);
    expect(walk.yapFrame().tick).toBe(0);
    for (let i = 0; i < 9; i += 1) walk.yapStep(1);
    expect(walk.yapFrame().tick).toBe(4);
  });

  it('a plan stops playing on its last frame', () => {
    const walk = plan();
    for (let i = 0; i < 3; i += 1) walk.yapStep(1);
    expect(walk.playing).toBe(true);
    walk.yapStep(1);
    expect(walk.playing).toBe(false);
  });

  it('Play on the last frame of a plan starts over', () => {
    const walk = plan();
    for (let i = 0; i < 4; i += 1) walk.yapStep(1);
    walk.yapTogglePlaying();
    expect(walk.yapFrame().tick).toBe(0);
    expect(walk.playing).toBe(true);
  });

  it('Pause then Play keeps the frame', () => {
    const walk = plan();
    walk.yapStep(1);
    walk.yapTogglePlaying();
    expect(walk.playing).toBe(false);
    walk.yapTogglePlaying();
    expect(walk.yapFrame().tick).toBe(1);
    expect(walk.playing).toBe(true);
  });

  it('refuses an empty run', () => {
    expect(() => new YapObserverRun('plan', [], false)).toThrow();
  });
});

describe('yapObserverCaption — what the frame says', () => {
  it('a round says how often it repeats', () => {
    const level = shipped('tutorial/t4');
    const run = new YapObserverRun(
      'round',
      yapRoundStates(level, new YapGhostPreview(level)),
      true,
    );
    expect(yapObserverCaption(run)).toEqual({ key: 'observer.round', params: { cycle: 6 } });
  });

  it('a plan on its way says so', () => {
    const walk = new YapObserverRun('plan', yapPlanStates(CAMERA, ['S', 'S']), false);
    expect(yapObserverCaption(walk)).toEqual({ key: 'observer.running', params: {} });
  });

  it('a won plan gives its last tick', () => {
    const level = shipped('tutorial/t1');
    const { plan } = solveLevel(level);
    const walk = new YapObserverRun('plan', yapPlanStates(level, plan), false);
    for (let i = 0; i < plan.length; i += 1) walk.yapStep(1);
    expect(yapObserverCaption(walk)).toEqual({
      key: 'observer.won',
      params: { tick: plan.length },
    });
  });
});

describe('yapCellBand — the ticks of a cell', () => {
  const level = shipped('daily/d3');
  const ghost = new YapGhostPreview(level);
  const cell: YapCell = { x: 3, y: 5 };

  it('shows 12 ticks, 3 before the arrival', () => {
    const band = yapCellBand(ghost, cell, 10);
    expect(band.map((t) => t.tick)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(band.filter((t) => t.arrival).map((t) => t.tick)).toEqual([10]);
  });

  it('starts at tick 0 near the start', () => {
    const band = yapCellBand(ghost, cell, 1);
    expect(band[0]?.tick).toBe(0);
    expect(band.filter((t) => t.arrival).map((t) => t.tick)).toEqual([1]);
  });

  it('keeps the arrival in view at the end of the plan', () => {
    const band = yapCellBand(ghost, cell, 64);
    expect(band.filter((t) => t.arrival).map((t) => t.tick)).toEqual([64]);
  });

  it('names the threat of a frame', () => {
    const seen = yapCellBand(new YapGhostPreview(CAMERA), { x: 1, y: 5 }, 3);
    expect(seen.every((t) => t.threats.includes('camera'))).toBe(true);
    const beam = yapCellBand(new YapGhostPreview(LASER), { x: 3, y: 3 }, 4);
    expect(beam.find((t) => t.tick === 4)?.threats).toEqual(['laser']);
    expect(beam.find((t) => t.tick === 2)?.threats).toEqual([]);
    const on = yapCellBand(new YapGhostPreview(GUARD_SIGHT), { x: 4, y: 1 }, 0);
    expect(on.find((t) => t.tick === 0)?.threats).toEqual(['contact']);
  });

  it('raises no alert on the cells of a winning plan, at every tick spent there', () => {
    for (const { id, level: played } of PLAYED) {
      const world = new YapGhostPreview(played);
      const { frames } = run(played, solveLevel(played).plan);
      for (const frame of frames) {
        const band = yapCellBand(world, frame.thief, frame.tick);
        const arrival = band.find((t) => t.arrival);
        expect(arrival?.threats, `${id} at tick ${frame.tick}`).toEqual([]);
      }
    }
  });
});

describe('yapBandCaption — the line above the band', () => {
  it('says the cell is free of sight and beam, and promises nothing more', () => {
    const band = yapCellBand(new YapGhostPreview(CAMERA), { x: 6, y: 9 }, 3);
    expect(yapBandCaption(band)).toEqual({ key: 'observer.bandClear', tick: 3, threats: [] });
  });

  it('names each threat of the arrival', () => {
    const band = yapCellBand(new YapGhostPreview(CAMERA), { x: 1, y: 5 }, 3);
    expect(yapBandCaption(band)).toEqual({
      key: 'observer.bandExposed',
      tick: 3,
      threats: ['observer.bandCamera'],
    });
  });
});

describe('the Observer flags', () => {
  it('Observer is on by default, and ?flag=observer:0 turns it off', () => {
    expect(yapResolveObserverFlag('')).toBe(true);
    expect(yapResolveObserverFlag('?flag=observer:0')).toBe(false);
    expect(yapResolveObserverFlag('?flag=observer:1')).toBe(true);
  });

  it('reads flags like the others: repeatable, comma-separated, last one wins', () => {
    expect(yapResolveObserverFlag('?flag=ghost:1,observer:0')).toBe(false);
    expect(yapResolveObserverFlag('?flag=observer:0&flag=observer:1')).toBe(true);
  });

  it('night is off unless asked for', () => {
    expect(yapResolveNightFlag('')).toBe(false);
    expect(yapResolveNightFlag('?flag=night:1')).toBe(true);
  });
});
