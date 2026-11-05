// The Observer (story X9, tasks/X9.md): one time control, before and after the
// route. Before it, the player watches one cycle of the world; after it, the
// thief walks the plan up to its first detection; while drawing, a band shows
// the ticks of the cell under the finger.
//
// Pure and Phaser-free, so the unit tests cover it. Every world comes from
// YapGhostPreview or yapPreviewStates (./ghost.ts), so through resolveTick: no
// rule is computed here. The scene only draws the frames and runs the timer.
import type { YapKey } from '../app/i18n';
import { YAP_MAX_TICKS, type YapCell, type YapLevel } from '../core/level';
import { createInitialState, type YapCause, type YapPlan } from '../core/sim';
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

/** The caption of a detection, by its cause. A contact has the guard's cause. */
const YAP_CAUGHT_KEYS: Readonly<Record<YapCause, YapKey>> = {
  guard: 'observer.caughtGuard',
  camera: 'observer.caughtCamera',
  laser: 'observer.caughtLaser',
};

function yapSameCell(a: YapCell, b: YapCell): boolean {
  return a.x === b.x && a.y === b.y;
}

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

/** The plan from tick 0 up to its first detection or its win, included. */
export function yapPlanStates(level: YapLevel, plan: YapPlan): YapPreviewState[] {
  const { tick, thief, hasLoot, guards, cameras, lasers, outcome } = createInitialState(level);
  const states = yapPreviewStates(level, plan);
  const end = states.findIndex((state) => state.outcome.kind !== 'running');
  return [
    { tick, thief, hasLoot, guards, cameras, lasers, outcome },
    ...(end < 0 ? states : states.slice(0, end + 1)),
  ];
}

/**
 * The cells of the detector, to draw in red. A guard or a camera counts only
 * when its cone holds the fatal cell: a contact is not a look.
 */
export function yapDetectorCells(state: YapPreviewState): readonly YapCell[] {
  const outcome = state.outcome;
  if (outcome.kind !== 'detected') return [];
  if (outcome.cause === 'laser') {
    return state.lasers.find((l) => l.id === outcome.by)?.cells ?? [];
  }
  const detectors = outcome.cause === 'guard' ? state.guards : state.cameras;
  const seen = detectors.find((d) => d.id === outcome.by)?.seen ?? [];
  return seen.some((cell) => yapSameCell(cell, state.thief)) ? seen : [];
}

/** The two ways of observing: the world alone, or the thief on the plan. */
export type YapObserverKind = 'round' | 'plan';

/** The frames of one observation and where the player stands in them. */
export class YapObserverRun {
  private index = 0;

  constructor(
    readonly kind: YapObserverKind,
    private readonly states: readonly YapPreviewState[],
    public playing: boolean,
  ) {
    if (states.length === 0) throw new Error('YapObserverRun: nothing to observe');
  }

  /** The frame on screen. */
  yapFrame(): YapPreviewState {
    const frame = this.states[this.index];
    if (frame === undefined) throw new Error('YapObserverRun: no frame');
    return frame;
  }

  /** One tick forward or back: a round loops, a plan stops at its ends. */
  yapStep(delta: 1 | -1): void {
    const count = this.states.length;
    if (this.kind === 'round') {
      this.index = (this.index + delta + count) % count;
      return;
    }
    this.index = Math.min(count - 1, Math.max(0, this.index + delta));
    if (this.index === count - 1) this.playing = false;
  }

  /** Pause or Play; Play on the last frame of a plan starts it over. */
  yapTogglePlaying(): void {
    if (!this.playing && this.kind === 'plan' && this.index === this.states.length - 1) {
      this.index = 0;
    }
    this.playing = !this.playing;
  }

  /** The total of the tick counter: a round's length, a plan's last tick. */
  yapMaxTick(): number {
    if (this.kind === 'round') return this.states.length;
    return this.states[this.states.length - 1]?.tick ?? 0;
  }
}

/** What the caption says about the frame on screen. */
export function yapObserverCaption(run: YapObserverRun): {
  readonly key: YapKey;
  readonly params: Record<string, number>;
} {
  const outcome = run.yapFrame().outcome;
  if (outcome.kind === 'detected') {
    return { key: YAP_CAUGHT_KEYS[outcome.cause], params: { tick: outcome.tick } };
  }
  if (outcome.kind === 'won') return { key: 'observer.won', params: { tick: outcome.tick } };
  return run.kind === 'round'
    ? { key: 'observer.round', params: { cycle: run.yapMaxTick() } }
    : { key: 'observer.running', params: {} };
}

/** What can catch the thief on a cell, on one frame of the world. */
export type YapBandThreat = 'guard' | 'camera' | 'contact' | 'laser';

const YAP_BAND_THREAT_KEYS: Readonly<Record<YapBandThreat, YapKey>> = {
  guard: 'observer.bandGuard',
  camera: 'observer.bandCamera',
  contact: 'observer.bandContact',
  laser: 'observer.bandLaser',
};

function yapCellThreats(world: YapGhostState, cell: YapCell): YapBandThreat[] {
  const threats = new Set<YapBandThreat>();
  for (const guard of world.guards) {
    if (yapSameCell(guard.pos, cell)) threats.add('contact');
    else if (guard.seen.some((c) => yapSameCell(c, cell))) threats.add('guard');
  }
  for (const camera of world.cameras) {
    if (camera.seen.some((c) => yapSameCell(c, cell))) threats.add('camera');
  }
  for (const laser of world.lasers) {
    if (laser.active && laser.cells.some((c) => yapSameCell(c, cell))) threats.add('laser');
  }
  return [...threats];
}

export interface YapBandTick {
  readonly tick: number;
  readonly threats: readonly YapBandThreat[];
  readonly arrival: boolean;
}

/**
 * The threats on `cell` around the tick the thief reaches it. It reads one
 * frame at a time, so it says nothing of a swap of places with a guard: an
 * empty tick is not a promise that the move is safe.
 */
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

/** The line above the band: the arrival tick and what threatens it. */
export function yapBandCaption(band: readonly YapBandTick[]): {
  readonly key: YapKey;
  readonly tick: number;
  readonly threats: readonly YapKey[];
} {
  const arrival = band.find((t) => t.arrival);
  const threats = (arrival?.threats ?? []).map((threat) => YAP_BAND_THREAT_KEYS[threat]);
  return {
    key: threats.length > 0 ? 'observer.bandExposed' : 'observer.bandClear',
    tick: arrival?.tick ?? 0,
    threats,
  };
}

/** A `?flag=<name>:0/1` switch: repeatable, comma-separated, last one wins. */
function yapResolveFlag(search: string, name: string, fallback: boolean): boolean {
  let value = fallback;
  for (const raw of new URLSearchParams(search).getAll('flag')) {
    for (const part of raw.split(',')) {
      const [key, setting] = part.trim().split(':');
      if (key === name && (setting === '0' || setting === '1')) value = setting === '1';
    }
  }
  return value;
}

/** The Observer: on by default, `?flag=observer:0` turns it off. */
export function yapResolveObserverFlag(search = ''): boolean {
  return yapResolveFlag(search, 'observer', true);
}

/** The dark board, a dev flag: off, `?flag=night:1` turns it on. */
export function yapResolveNightFlag(search = ''): boolean {
  return yapResolveFlag(search, 'night', false);
}
