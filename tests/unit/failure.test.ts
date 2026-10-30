// Tests for story C4 — YapFailureReplay (src/game/failure.ts), the pure,
// Phaser-free controller of the Failure screen. On detection, the Gate 1
// spec asks for a slow-motion replay of the last 4 ticks at quarter speed
// (zoom on the thief and whatever saw it), the written cause mapped to an
// i18n key, a marker on the fatal cell, and a one-tap return to the intact
// plan. The scene (./level-scene.ts) only drives this controller with a
// timer and draws from its getters.
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapLevel } from '../../src/core/level';
import { run, type YapPlan, type YapSimOutcome, type YapSimState } from '../../src/core/sim';
import { YapI18n } from '../../src/app/i18n';
import { yapComputeLayout } from '../../src/game/board';
import { YAP_TICKS_PER_SECOND } from '../../src/game/execution';
import {
  YapFailureError,
  YapFailureReplay,
  YAP_FAILURE_REPLAY_TICKS,
  YAP_FAILURE_SPEED_DIVISOR,
  yapCauseKey,
} from '../../src/game/failure';

// ---------------------------------------------------------------------------
// Helpers — scripted levels with a guaranteed detection of each cause
// ---------------------------------------------------------------------------

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

// A pingpong guard watching the top corridor: walking east is spotted at tick 1.
const guardLevel = (): YapLevel =>
  lvl(OPEN_MAP, [
    'guards:',
    '  - id: g1',
    '    route: [[4,1], [5,1]]',
    '    mode: pingpong',
    '    phase: 0',
    '    range: 3',
  ]);

// A camera on the west wall facing east: row 5 is inside its cone.
const cameraLevel = (): YapLevel =>
  lvl(OPEN_MAP, [
    'cameras:',
    '  - id: c1',
    '    at: [0,5]',
    '    dirs: [E]',
    '    hold: 24',
    '    phase: 0',
    '    range: 3',
  ]);

// A laser across row 3, on for the first 2 ticks of every 4: stepping on it
// at tick 4 is fatal.
const laserLevel = (): YapLevel =>
  lvl(OPEN_MAP, [
    'lasers:',
    '  - id: l1',
    '    cells: [[3,3], [4,3]]',
    '    on: 2',
    '    off: 2',
    '    phase: 0',
  ]);

/** Frames + outcome of a plan, as YapExecution computes them. */
function replayOf(
  level: YapLevel,
  plan: YapPlan,
): { frames: readonly YapSimState[]; outcome: YapSimOutcome } {
  const result = run(level, plan);
  return { frames: result.frames, outcome: result.outcome };
}

// ---------------------------------------------------------------------------
// The replay window: the last 4 ticks, ending on the detection tick
// ---------------------------------------------------------------------------

describe('YapFailureReplay — last 4 ticks at quarter speed', () => {
  it('replays exactly the last 4 frames, ending on the detection frame', () => {
    // Camera detection at tick 4: S,S,S,S then E into the cone at (1,5)? No:
    // the thief walks down column 1 and is seen on (1,5) at tick 4.
    const { frames, outcome } = replayOf(cameraLevel(), ['S', 'S', 'S', 'S']);
    expect(outcome).toEqual({ kind: 'detected', cause: 'camera', by: 'c1', tick: 4 });
    const replay = new YapFailureReplay(frames, outcome);
    expect(YAP_FAILURE_REPLAY_TICKS).toBe(4);
    const replayFrames = replay.yapReplayFrames();
    expect(replayFrames.length).toBe(4);
    expect(replayFrames.map((f) => f.tick)).toEqual([1, 2, 3, 4]);
    expect(replayFrames[replayFrames.length - 1]?.outcome.kind).toBe('detected');
    // the tail of the full frame list, never recomputed
    expect(replayFrames).toEqual(frames.slice(frames.length - 4));
  });

  it('replays fewer than 4 frames when the detection happens early', () => {
    // Guard detection at tick 1: only ticks 0 and 1 exist.
    const { frames, outcome } = replayOf(guardLevel(), ['E', 'E']);
    expect(outcome.kind).toBe('detected');
    if (outcome.kind !== 'detected') throw new Error('unreachable');
    expect(outcome.tick).toBe(1);
    const replay = new YapFailureReplay(frames, outcome);
    expect(replay.yapReplayFrames().map((f) => f.tick)).toEqual([0, 1]);
  });

  it('runs at quarter speed: 4x the normal tick period (1 s at 4 ticks/s)', () => {
    expect(YAP_FAILURE_SPEED_DIVISOR).toBe(4);
    const { frames, outcome } = replayOf(guardLevel(), ['E']);
    const replay = new YapFailureReplay(frames, outcome);
    const normalMs = Math.round(1000 / YAP_TICKS_PER_SECOND); // 250 ms
    expect(replay.yapTickMs()).toBe(normalMs * YAP_FAILURE_SPEED_DIVISOR); // 1000 ms
    expect(replay.yapTickMs()).toBe(1000);
  });

  it('shortens the replay under prefers-reduced-motion (spec: shortened, no shake)', () => {
    const { frames, outcome } = replayOf(cameraLevel(), ['S', 'S', 'S', 'S']);
    const replay = new YapFailureReplay(frames, outcome);
    expect(replay.yapReplayFrames(true).length).toBe(2);
    expect(replay.yapReplayFrames(true).map((f) => f.tick)).toEqual([3, 4]);
    expect(replay.yapTickMs(true)).toBe(500); // half the slow-motion period
    expect(replay.yapTickMs(true)).toBeLessThan(replay.yapTickMs());
  });
});

// ---------------------------------------------------------------------------
// The written cause, mapped to an i18n key, and the fatal cell
// ---------------------------------------------------------------------------

describe('YapFailureReplay — cause, i18n key, fatal cell, detector', () => {
  it('maps each cause to a resolvable i18n key in both locales', () => {
    expect(yapCauseKey('guard')).toBe('failure.spottedByGuard');
    expect(yapCauseKey('camera')).toBe('failureReplay.spottedByCamera');
    expect(yapCauseKey('laser')).toBe('failureReplay.spottedByLaser');
    for (const locale of ['fr', 'en'] as const) {
      const i18n = new YapI18n(locale, null);
      for (const cause of ['guard', 'camera', 'laser'] as const) {
        const text = i18n.t(yapCauseKey(cause));
        expect(text.trim().length, `${locale}:${cause}`).toBeGreaterThan(0);
        expect(text).not.toContain('{'); // no unresolved placeholder
      }
    }
  });

  it('exposes the guard cause, the fatal cell and the guard that saw it', () => {
    const { frames, outcome } = replayOf(guardLevel(), ['E', 'E']);
    const replay = new YapFailureReplay(frames, outcome);
    expect(replay.yapCause()).toBe('guard');
    expect(replay.yapBy()).toBe('g1');
    expect(replay.yapCauseKey()).toBe('failure.spottedByGuard');
    expect(replay.yapDetectionTick()).toBe(1);
    // the fatal cell is the thief cell on the detection frame
    const fatal = frames[frames.length - 1];
    expect(fatal?.outcome.kind).toBe('detected');
    expect(replay.yapFatalCell()).toEqual(fatal?.thief);
    expect(replay.yapFatalCell()).toEqual({ x: 2, y: 1 });
    // the detector is the guard, at its position on the detection tick
    expect(replay.yapDetectorOrigin()).toEqual({ x: 5, y: 1 });
    // its cone on the detection tick is what is drawn in red
    expect(replay.yapDetectorSeen()).toEqual(fatal?.guards[0]?.seen);
    expect(replay.yapDetectorSeen().some((c) => c.x === 2 && c.y === 1)).toBe(true);
  });

  it('exposes the camera cause and its cone', () => {
    const { frames, outcome } = replayOf(cameraLevel(), ['S', 'S', 'S', 'S']);
    const replay = new YapFailureReplay(frames, outcome);
    expect(replay.yapCause()).toBe('camera');
    expect(replay.yapCauseKey()).toBe('failureReplay.spottedByCamera');
    expect(replay.yapFatalCell()).toEqual({ x: 1, y: 5 });
    expect(replay.yapDetectorOrigin()).toEqual({ x: 0, y: 5 });
    const fatal = frames[frames.length - 1];
    expect(replay.yapDetectorSeen()).toEqual(fatal?.cameras[0]?.seen);
  });

  it('exposes the laser cause and the beam cells as the red "cone"', () => {
    // E,E,S,S steps onto the laser cell (3,3) at tick 4, while it is on.
    const { frames, outcome } = replayOf(laserLevel(), ['E', 'E', 'S', 'S']);
    expect(outcome).toEqual({ kind: 'detected', cause: 'laser', by: 'l1', tick: 4 });
    const replay = new YapFailureReplay(frames, outcome);
    expect(replay.yapCause()).toBe('laser');
    expect(replay.yapCauseKey()).toBe('failureReplay.spottedByLaser');
    expect(replay.yapFatalCell()).toEqual({ x: 3, y: 3 });
    expect(replay.yapDetectorOrigin()).toEqual({ x: 3, y: 3 });
    expect(replay.yapDetectorSeen()).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Zoom: focus between the thief and whatever saw it, factor from the layout
// ---------------------------------------------------------------------------

describe('YapFailureReplay — zoom', () => {
  it('focuses on the midpoint between the fatal cell and the detector', () => {
    const { frames, outcome } = replayOf(guardLevel(), ['E', 'E']);
    const replay = new YapFailureReplay(frames, outcome);
    // fatal (2,1), guard at (5,1) -> focus (3.5, 1)
    expect(replay.yapZoomFocus()).toEqual({ x: 3.5, y: 1 });
  });

  it('computes a zoom factor that keeps ~5 cells around the focus readable', () => {
    const { frames, outcome } = replayOf(guardLevel(), ['E', 'E']);
    const replay = new YapFailureReplay(frames, outcome);
    const layout = yapComputeLayout(390, 844, 8, 12);
    const zoom = replay.yapZoomFactor(layout);
    expect(zoom).toBeGreaterThan(1); // an actual zoom
    expect(zoom).toBeLessThanOrEqual(2); // never disorienting
    expect(zoom).toBeCloseTo(Math.min(390, 844) / (5 * layout.cell), 5);
    // a smaller phone zooms a bit more, still capped
    const small = yapComputeLayout(360, 640, 8, 12);
    expect(replay.yapZoomFactor(small)).toBeGreaterThanOrEqual(zoom);
    expect(replay.yapZoomFactor(small)).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Contract guards
// ---------------------------------------------------------------------------

describe('YapFailureReplay — contract', () => {
  it('rejects a non-detected outcome (a win is not a failure)', () => {
    const level = lvl(OPEN_MAP);
    const plan: YapPlan = ['E', 'E', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'E', 'E', 'E'];
    const { frames, outcome } = replayOf(level, plan);
    expect(outcome.kind).toBe('won');
    expect(() => new YapFailureReplay(frames, outcome)).toThrow(YapFailureError);
  });

  it('rejects frames that do not end on the detection tick', () => {
    const { frames, outcome } = replayOf(guardLevel(), ['E', 'E']);
    expect(() => new YapFailureReplay(frames.slice(0, 1), outcome)).toThrow(YapFailureError);
    expect(() => new YapFailureReplay([], outcome)).toThrow(YapFailureError);
  });

  it('the replay frames are the simulated frames, never recomputed', () => {
    const { frames, outcome } = replayOf(cameraLevel(), ['S', 'S', 'S', 'S']);
    const replay = new YapFailureReplay(frames, outcome);
    for (const frame of replay.yapReplayFrames()) {
      expect(frames).toContain(frame);
    }
  });
});
