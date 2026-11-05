// SPIKE (throwaway, branch spike-observer): the Observer mode.
//
// A prototype to judge on a phone, not production code: no tests, and the
// design is not decided. Pure and Phaser-free. The world at a tick always
// comes from YapGhostPreview / yapPreviewStates (./ghost.ts), so through
// resolveTick: no rule is re-implemented here.
import { YAP_MAX_TICKS, type YapCell, type YapLevel } from '../core/level';
import { createInitialState, type YapPlan } from '../core/sim';
import {
  yapPreviewStates,
  type YapGhostPreview,
  type YapGhostState,
  type YapPreviewState,
} from './ghost';

/** Level periods divide 24 (levels/*.lvl), so the world's cycle does too. */
const YAP_CYCLE_CANDIDATES = [1, 2, 3, 4, 6, 8, 12, 24] as const;
const YAP_LONGEST_CYCLE = 24;
/** Ticks shown before the arrival tick in the band of a cell. */
const YAP_BAND_BEFORE = 3;
/** Ticks shown in the band of a cell. */
const YAP_BAND_LENGTH = 12;

/** What makes two ticks of the world the same on screen. */
function yapWorldKey(world: YapGhostState): string {
  return JSON.stringify([
    world.guards.map((g) => [g.pos.x, g.pos.y, g.facing]),
    world.cameras.map((c) => c.facing),
    world.lasers.map((l) => l.active),
  ]);
}

/** The smallest number of ticks after which the world repeats. */
export function yapWorldCycle(ghost: YapGhostPreview): number {
  const keys = Array.from({ length: 2 * YAP_LONGEST_CYCLE + 1 }, (_, t) =>
    yapWorldKey(ghost.yapAt(t)),
  );
  for (const period of YAP_CYCLE_CANDIDATES) {
    if (keys.slice(0, YAP_LONGEST_CYCLE).every((key, t) => key === keys[t + period])) {
      return period;
    }
  }
  return YAP_LONGEST_CYCLE;
}

/** One full round of the world, the thief waiting on the start. */
export function yapRoundStates(level: YapLevel, ghost: YapGhostPreview): YapPreviewState[] {
  return Array.from({ length: yapWorldCycle(ghost) }, (_, t) => ({
    ...ghost.yapAt(t),
    thief: level.start,
    hasLoot: false,
    outcome: { kind: 'running' },
  }));
}

function yapInitialPreviewState(level: YapLevel): YapPreviewState {
  const initial = createInitialState(level);
  return {
    tick: initial.tick,
    thief: initial.thief,
    hasLoot: initial.hasLoot,
    guards: initial.guards,
    cameras: initial.cameras,
    lasers: initial.lasers,
    outcome: initial.outcome,
  };
}

/** The whole plan from tick 0 through its end, even past a detection. */
export function yapFlightStates(level: YapLevel, plan: YapPlan): YapPreviewState[] {
  return [yapInitialPreviewState(level), ...yapPreviewStates(level, plan)];
}

/** The plan from tick 0 up to its first detection or its win, included. */
export function yapPlanStates(level: YapLevel, plan: YapPlan): YapPreviewState[] {
  const states = yapPreviewStates(level, plan);
  const end = states.findIndex((state) => state.outcome.kind !== 'running');
  return [yapInitialPreviewState(level), ...(end < 0 ? states : states.slice(0, end + 1))];
}

/** Cells in the detector's visible area that contain the fatal cell. */
export function yapDetectorCells(state: YapPreviewState): readonly YapCell[] {
  const outcome = state.outcome;
  if (outcome.kind !== 'detected') return [];
  if (outcome.cause === 'guard') {
    const guard = state.guards.find((g) => g.id === outcome.by);
    return guard?.seen.some((cell) => yapSameCell(cell, state.thief)) ? guard.seen : [];
  }
  if (outcome.cause === 'camera') {
    const camera = state.cameras.find((c) => c.id === outcome.by);
    return camera?.seen.some((cell) => yapSameCell(cell, state.thief)) ? camera.seen : [];
  }
  return state.lasers.find((l) => l.id === outcome.by)?.cells ?? [];
}

function yapSameCell(a: YapCell, b: YapCell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Exposure labels for the cell band; these describe the frame, not a full move. */
export type YapBandThreat = 'guard' | 'camera' | 'contact' | 'laser';

function yapCellThreats(world: YapGhostState, cell: YapCell): YapBandThreat[] {
  const threats: YapBandThreat[] = [];
  for (const guard of world.guards) {
    if (yapSameCell(guard.pos, cell)) threats.push('contact');
    else if (guard.seen.some((c) => yapSameCell(c, cell))) threats.push('guard');
  }
  for (const camera of world.cameras) {
    if (camera.seen.some((c) => yapSameCell(c, cell))) threats.push('camera');
  }
  for (const laser of world.lasers) {
    if (laser.active && laser.cells.some((c) => yapSameCell(c, cell))) threats.push('laser');
  }
  return threats;
}

export interface YapBandTick {
  readonly tick: number;
  readonly threats: readonly YapBandThreat[];
  readonly arrival: boolean;
}

/** The frame exposures of `cell` around `arrival`; this is not a route-safety test. */
export function yapCellBand(
  ghost: YapGhostPreview,
  cell: YapCell,
  arrival: number,
): readonly YapBandTick[] {
  const start = Math.max(
    0,
    Math.min(arrival - YAP_BAND_BEFORE, YAP_MAX_TICKS - YAP_BAND_LENGTH + 1),
  );
  return Array.from({ length: YAP_BAND_LENGTH }, (_, i) => ({
    tick: start + i,
    threats: yapCellThreats(ghost.yapAt(start + i), cell),
    arrival: start + i === arrival,
  }));
}

/** The `night` flag of the spike: off, `?flag=night:1` turns it on. */
export function yapResolveNightFlag(search = ''): boolean {
  let value = false;
  for (const raw of new URLSearchParams(search).getAll('flag')) {
    for (const part of raw.split(',')) {
      const match = /^night:(?<value>[01])$/.exec(part.trim());
      const v = match?.groups?.value;
      if (v !== undefined) value = v === '1';
    }
  }
  return value;
}
