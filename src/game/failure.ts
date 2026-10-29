// YapFailureReplay — the pure, Phaser-free controller of the Failure screen
// (story C4). Like YapExecution (./execution.ts), it holds no rendering and
// no rule: the frames come from resolveTick via YapExecution, and this class
// only describes what the Failure screen must show on a detection.
//
// Gate 1 spec, Failure screen: "Slow-motion replay of the last 4 ticks at
// quarter speed, zoom on the thief and whatever saw it, cone in red, written
// cause ('Spotted by the guard') and attempt number. Tap the screen: back to
// the intact plan, with a red marker on the fatal cell."
//
// The whole contract is unit-tested in node (tests/unit/failure.test.ts);
// the scene (./level-scene.ts) drives it with a timer and draws from the
// getters.
import type { YapCell } from '../core/level';
import type { YapCause, YapSimOutcome, YapSimState } from '../core/sim';
import type { YapKey } from '../app/i18n';
import { YAP_TICKS_PER_SECOND } from './execution';
import type { YapBoardLayout } from './board';

/** The slow-motion replay covers the last 4 ticks (Gate 1 spec). */
export const YAP_FAILURE_REPLAY_TICKS = 4;
/** Quarter speed: the replay tick lasts 4x the normal execution tick. */
export const YAP_FAILURE_SPEED_DIVISOR = 4;
/** Under prefers-reduced-motion the replay is shortened (Gate 1 spec). */
export const YAP_FAILURE_REDUCED_TICKS = 2;
/** Zoom window: about this many cells around the focus stay visible. */
export const YAP_FAILURE_ZOOM_CELLS = 5;
/** Zoom bounds: never below 1.25x, never above 2x (readability). */
export const YAP_FAILURE_ZOOM_MIN = 1.25;
export const YAP_FAILURE_ZOOM_MAX = 2;

/** Failure contract error (dev assertion, frames/outcome bound). */
export class YapFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapFailureError';
  }
}

/**
 * The written cause of a capture, mapped to its i18n key. The guard cause
 * reuses the existing `failure.spottedByGuard` key; camera and laser live in
 * the `failureReplay` section appended at the end of both dictionaries.
 */
export function yapCauseKey(cause: YapCause): YapKey {
  switch (cause) {
    case 'guard':
      return 'failure.spottedByGuard';
    case 'camera':
      return 'failureReplay.spottedByCamera';
    case 'laser':
      return 'failureReplay.spottedByLaser';
  }
}

/** Zoom focus in grid coordinates (may be fractional: a midpoint). */
export interface YapFailureFocus {
  readonly x: number;
  readonly y: number;
}

/**
 * What the Failure screen shows for one detection: the tail frames to
 * replay in slow motion, the fatal cell, the detector and its cone (drawn
 * in red), the cause key, and the zoom to apply. Built from the frames of
 * YapExecution and its outcome — never re-simulated.
 */
export class YapFailureReplay {
  private readonly yapFrames: readonly YapSimState[];
  private readonly yapOutcome: Extract<YapSimOutcome, { kind: 'detected' }>;

  constructor(frames: readonly YapSimState[], outcome: YapSimOutcome) {
    if (outcome.kind !== 'detected') {
      throw new YapFailureError(
        `YapFailureReplay: a failure replay needs a detection, got ${outcome.kind}`,
      );
    }
    const last = frames[frames.length - 1];
    if (last === undefined || last.tick !== outcome.tick || last.outcome.kind !== 'detected') {
      throw new YapFailureError(
        `YapFailureReplay: the frames must end on the detection tick ${outcome.tick}`,
      );
    }
    this.yapFrames = frames;
    this.yapOutcome = outcome;
  }

  // -------------------------------------------------------------------------
  // Cause and fatal cell
  // -------------------------------------------------------------------------

  /** Tick of the detection (the last frame). */
  yapDetectionTick(): number {
    return this.yapOutcome.tick;
  }

  /** The written cause: guard, camera or laser. */
  yapCause(): YapCause {
    return this.yapOutcome.cause;
  }

  /** Id of the guard / camera / laser that caught the thief. */
  yapBy(): string {
    return this.yapOutcome.by;
  }

  /** The i18n key of the written cause shown on the Failure screen. */
  yapCauseKey(): YapKey {
    return yapCauseKey(this.yapOutcome.cause);
  }

  /** The fatal cell: where the thief stands on the detection tick. */
  yapFatalCell(): YapCell {
    return this.yapDetectionFrame().thief;
  }

  // -------------------------------------------------------------------------
  // The detector: origin and the cone drawn in red
  // -------------------------------------------------------------------------

  /** Cell of whatever saw the thief (guard pos, camera mount, laser emitter). */
  yapDetectorOrigin(): YapCell {
    const frame = this.yapDetectionFrame();
    const by = this.yapOutcome.by;
    if (this.yapOutcome.cause === 'laser') {
      const laser = frame.lasers.find((l) => l.id === by);
      const first = laser?.cells[0];
      if (first === undefined)
        throw new YapFailureError(`YapFailureError: no laser "${by}" on the fatal frame`);
      return first;
    }
    if (this.yapOutcome.cause === 'camera') {
      const cam = frame.cameras.find((c) => c.id === by);
      if (cam === undefined)
        throw new YapFailureError(`YapFailureError: no camera "${by}" on the fatal frame`);
      return cam.at;
    }
    const guard = frame.guards.find((g) => g.id === by);
    if (guard === undefined)
      throw new YapFailureError(`YapFailureError: no guard "${by}" on the fatal frame`);
    return guard.pos;
  }

  /**
   * The cells drawn in red on the Failure screen: the vision cone of the
   * guard / camera that saw the thief, or the beam cells of the laser.
   */
  yapDetectorSeen(): readonly YapCell[] {
    const frame = this.yapDetectionFrame();
    const by = this.yapOutcome.by;
    if (this.yapOutcome.cause === 'laser') {
      const laser = frame.lasers.find((l) => l.id === by);
      if (laser === undefined)
        throw new YapFailureError(`YapFailureError: no laser "${by}" on the fatal frame`);
      return laser.cells;
    }
    if (this.yapOutcome.cause === 'camera') {
      const cam = frame.cameras.find((c) => c.id === by);
      if (cam === undefined)
        throw new YapFailureError(`YapFailureError: no camera "${by}" on the fatal frame`);
      return cam.seen;
    }
    const guard = frame.guards.find((g) => g.id === by);
    if (guard === undefined)
      throw new YapFailureError(`YapFailureError: no guard "${by}" on the fatal frame`);
    return guard.seen;
  }

  // -------------------------------------------------------------------------
  // Slow-motion replay: the last 4 ticks at quarter speed
  // -------------------------------------------------------------------------

  /**
   * The frames to replay, oldest first, ending on the detection frame: the
   * last 4 ticks (fewer when the detection happened within the first ticks).
   * Under prefers-reduced-motion the replay is shortened (Gate 1 spec).
   */
  yapReplayFrames(reducedMotion = false): readonly YapSimState[] {
    const count = reducedMotion
      ? Math.min(YAP_FAILURE_REDUCED_TICKS, this.yapFrames.length)
      : Math.min(YAP_FAILURE_REPLAY_TICKS, this.yapFrames.length);
    return this.yapFrames.slice(this.yapFrames.length - count);
  }

  /**
   * Milliseconds per replayed tick: quarter speed (4x the execution tick,
   * 1 s at the spec's 4 ticks/s), halved under prefers-reduced-motion.
   */
  yapTickMs(reducedMotion = false): number {
    const slowMs = Math.round((1000 / YAP_TICKS_PER_SECOND) * YAP_FAILURE_SPEED_DIVISOR);
    return reducedMotion ? Math.round(slowMs / 2) : slowMs;
  }

  // -------------------------------------------------------------------------
  // Zoom: on the thief and whatever saw it
  // -------------------------------------------------------------------------

  /** Midpoint between the fatal cell and the detector, in grid coordinates. */
  yapZoomFocus(): YapFailureFocus {
    const fatal = this.yapFatalCell();
    const origin = this.yapDetectorOrigin();
    return { x: (fatal.x + origin.x) / 2, y: (fatal.y + origin.y) / 2 };
  }

  /**
   * Camera zoom for the Failure screen: enough to keep about
   * YAP_FAILURE_ZOOM_CELLS cells around the focus visible, clamped to
   * [YAP_FAILURE_ZOOM_MIN, YAP_FAILURE_ZOOM_MAX] so the board stays readable.
   */
  yapZoomFactor(layout: YapBoardLayout): number {
    const raw =
      Math.min(layout.viewWidth, layout.viewHeight) / (YAP_FAILURE_ZOOM_CELLS * layout.cell);
    return Math.max(YAP_FAILURE_ZOOM_MIN, Math.min(YAP_FAILURE_ZOOM_MAX, raw));
  }

  // -------------------------------------------------------------------------

  private yapDetectionFrame(): YapSimState {
    const frame = this.yapFrames[this.yapFrames.length - 1];
    if (frame === undefined) throw new YapFailureError('YapFailureReplay: no frames');
    return frame;
  }
}
