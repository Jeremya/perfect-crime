// Tests for story X3 — the plan preview, the Angry Birds "dotted arc"
// (docs/design/experience.md §3.1): once the drawn route is complete, the
// Preview button replays the plan as a fast ghost, with the threats at each
// tick. The pure logic lives in src/game/ghost.ts (yapPreviewStates, behind
// the ?flag=preview: switch resolved by yapResolvePreviewFlag) and is tested
// here in node, like the C6 ghost preview (tests/unit/ghost.test.ts):
// - yapPreviewStates(level, plan) returns one ghost state per tick of the
//   plan, computed only through resolveTick (the single rule entry point);
//   its length is plan.length and the last state of a plan that runs to its
//   end carries exactly the outcome of run(level, plan);
// - each state's world is the same as YapGhostPreview.yapAt(tick) — the C6
//   machinery reused — and its cones are exactly visibleCells at that tick;
// - the preview flag defaults to on and follows ?flag=preview:0/1;
// - the C6 ghost layer stays cleared in the preview mode.
import { describe, expect, it } from 'vitest';
import { parseLevel, YAP_MAX_TICKS, type YapLevel } from '../../src/core/level';
import { run, visibleCells, type YapPlan } from '../../src/core/sim';
import {
  YapGhostError,
  YapGhostPreview,
  yapGhostCones,
  yapGhostLayerVisible,
  yapPreviewStates,
  yapResolvePreviewFlag,
  type YapGhostRenderMode,
} from '../../src/game/ghost';
import { YAP_PREVIEW_TICKS_PER_SECOND, YAP_TICKS_PER_SECOND } from '../../src/game/execution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 8 x 12, S=(1,1), L=(3,10), E=(6,10). One guard patrolling row 5, one camera
// on (3,0), one laser on row 9: enough threats to check the cones per tick.
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
    'name: Preview test',
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
    '    range: 2',
    'cameras:',
    '  - id: c1',
    '    at: [3,0]',
    '    dirs: [S, N]',
    '    hold: 2',
    '    phase: 0',
    '    range: 2',
    'lasers:',
    '  - id: l1',
    '    cells: [[1,8], [1,9]]',
    '    on: 2',
    '    off: 2',
    '    phase: 1',
  ].join('\n');
  return parseLevel(src);
}

// The guard stays on row 5, away from the winning corridor (column 2, row 10).
const lvlSafe = lvl('[[4,5], [5,5], [6,5]]');
// The guard walks through the thief's start cell: moving east is caught at tick 1.
const lvlDetected = lvl('[[1,1], [2,1]]');

/**
 * The winning plan of the safe level: (1,1) -> (2,1) -> down to (2,10) ->
 * east through the loot (3,10) -> east to the exit (6,10). 14 steps, won at
 * tick 14.
 */
const WIN_PLAN: YapPlan = ['E', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'E', 'E', 'E', 'E'];

// ---------------------------------------------------------------------------
// yapPreviewStates — one ghost state per tick of the plan, via resolveTick
// ---------------------------------------------------------------------------

describe('yapPreviewStates — the plan as ghost states (X3)', () => {
  it('returns one state per plan step (length == plan.length), ticks 1..N', () => {
    const states = yapPreviewStates(lvlSafe, WIN_PLAN);
    expect(states.length).toBe(WIN_PLAN.length);
    states.forEach((state, i) => {
      expect(state.tick).toBe(i + 1);
    });
  });

  it('the last state of a plan that runs to its end carries the outcome of the run', () => {
    const level = lvlSafe;
    const states = yapPreviewStates(level, WIN_PLAN);
    const reference = run(level, WIN_PLAN);
    expect(reference.outcome).toEqual({ kind: 'won', tick: WIN_PLAN.length });
    const last = states[states.length - 1];
    expect(last?.outcome).toEqual(reference.outcome);
    // and the whole last state is the final frame of the run
    const lastFrame = reference.frames[reference.frames.length - 1];
    expect(last?.thief).toEqual(lastFrame?.thief);
    expect(last?.hasLoot).toBe(lastFrame?.hasLoot);
    expect(last?.guards).toEqual(lastFrame?.guards);
    expect(last?.cameras).toEqual(lastFrame?.cameras);
    expect(last?.lasers).toEqual(lastFrame?.lasers);
  });

  it('matches run() frame by frame, and YapGhostPreview.yapAt tick by tick', () => {
    const level = lvlSafe;
    const states = yapPreviewStates(level, WIN_PLAN);
    const reference = run(level, WIN_PLAN);
    const ghost = new YapGhostPreview(level);
    expect(reference.frames.length).toBe(WIN_PLAN.length + 1);
    for (let i = 0; i < states.length; i += 1) {
      const state = states[i];
      const frame = reference.frames[i + 1];
      if (state === undefined || frame === undefined) throw new Error('missing state/frame');
      expect(state.thief).toEqual(frame.thief);
      expect(state.guards).toEqual(frame.guards);
      expect(state.cameras).toEqual(frame.cameras);
      expect(state.lasers).toEqual(frame.lasers);
      // the C6 machinery gives the same world at the same tick
      const at = ghost.yapAt(i + 1);
      expect(state.guards).toEqual(at.guards);
      expect(state.cameras).toEqual(at.cameras);
      expect(state.lasers).toEqual(at.lasers);
    }
  });

  it('keeps one state per plan step even past a detection, with the run outcome on the caught tick', () => {
    const level = lvlDetected;
    const plan: YapPlan = ['E', 'E', 'E']; // caught by the guard at tick 1
    const reference = run(level, plan);
    expect(reference.outcome).toEqual({ kind: 'detected', cause: 'guard', by: 'g1', tick: 1 });
    expect(reference.frames.length).toBe(2); // run() stops at the detection
    const states = yapPreviewStates(level, plan);
    expect(states.length).toBe(plan.length); // the preview still has one state per step
    // the caught tick carries exactly the outcome of the run
    expect(states[0]?.outcome).toEqual(reference.outcome);
    // and the world keeps advancing past it (same rule as YapGhostPreview.yapAt)
    const ghost = new YapGhostPreview(level);
    expect(states[2]?.tick).toBe(3);
    expect(states[2]?.guards).toEqual(ghost.yapAt(3).guards);
    expect(states[2]?.lasers).toEqual(ghost.yapAt(3).lasers);
  });

  it('cones of every preview state are exactly visibleCells at that tick', () => {
    const level = lvlSafe;
    const states = yapPreviewStates(level, WIN_PLAN);
    for (const state of states) {
      const cones = yapGhostCones(level, state);
      expect(cones.guards.length).toBe(level.guards.length);
      expect(cones.cameras.length).toBe(level.cameras.length);
      state.guards.forEach((guard, i) => {
        const def = level.guards[i];
        if (def === undefined) throw new Error('missing guard def');
        expect(cones.guards[i]).toEqual(visibleCells(level, guard.pos, guard.facing, def.range));
      });
      state.cameras.forEach((cam, i) => {
        const def = level.cameras[i];
        if (def === undefined) throw new Error('missing camera def');
        expect(cones.cameras[i]).toEqual(visibleCells(level, cam.at, cam.facing, def.range));
      });
    }
  });

  it('an empty plan gives no state, and an over-long plan throws', () => {
    expect(yapPreviewStates(lvlSafe, [])).toEqual([]);
    const tooLong: YapPlan = Array.from({ length: YAP_MAX_TICKS + 1 }, () => 'wait' as const);
    expect(() => yapPreviewStates(lvlSafe, tooLong)).toThrow(YapGhostError);
    const atLimit: YapPlan = Array.from({ length: YAP_MAX_TICKS }, () => 'wait' as const);
    expect(yapPreviewStates(lvlSafe, atLimit).length).toBe(YAP_MAX_TICKS);
  });
});

// ---------------------------------------------------------------------------
// The preview flag (?flag=preview:0/1), default on
// ---------------------------------------------------------------------------

describe('preview flag (?flag=preview:0/1)', () => {
  it('is on by default', () => {
    expect(yapResolvePreviewFlag('')).toBe(true);
    expect(yapResolvePreviewFlag('?internal=1')).toBe(true);
  });

  it('?flag=preview:0 turns it off, ?flag=preview:1 turns it back on (last wins)', () => {
    expect(yapResolvePreviewFlag('?flag=preview:0')).toBe(false);
    expect(yapResolvePreviewFlag('?flag=preview:1')).toBe(true);
    expect(yapResolvePreviewFlag('?flag=preview:0&flag=preview:1')).toBe(true);
    expect(yapResolvePreviewFlag('?flag=preview:1&flag=preview:0')).toBe(false);
    expect(yapResolvePreviewFlag('?flag=preview:0,preview:1')).toBe(true);
  });

  it('ignores unknown flags and invalid values (the ghost flag does not touch it)', () => {
    expect(yapResolvePreviewFlag('?flag=ghost:0')).toBe(true);
    expect(yapResolvePreviewFlag('?flag=other:1')).toBe(true);
    expect(yapResolvePreviewFlag('?flag=preview:2')).toBe(true);
    expect(yapResolvePreviewFlag('?flag=preview')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The preview mode and the C6 ghost layer + the preview speed
// ---------------------------------------------------------------------------

describe('preview mode (X3)', () => {
  it('clears the C6 ghost layer in the preview mode, like every non-planning mode', () => {
    const ghost = new YapGhostPreview(lvlSafe).yapAt(3);
    const modes: readonly YapGhostRenderMode[] = ['execution', 'failure', 'win', 'preview'];
    for (const mode of modes) {
      expect(yapGhostLayerVisible(mode, ghost)).toBe(false);
    }
    expect(yapGhostLayerVisible('planning', ghost)).toBe(true);
    expect(yapGhostLayerVisible('preview', null)).toBe(false);
  });

  it('replays accelerated: the preview runs faster than the 4 ticks/s playback', () => {
    expect(YAP_PREVIEW_TICKS_PER_SECOND).toBeGreaterThan(YAP_TICKS_PER_SECOND);
    expect(YAP_PREVIEW_TICKS_PER_SECOND).toBe(YAP_TICKS_PER_SECOND * 2);
  });
});
