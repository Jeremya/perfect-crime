// YapExecution — the playback controller of the Execution screen (story C3).
//
// Pure and Phaser-free on purpose, like YapPathInput (./path-input.ts): the
// whole playback contract of the Gate 1 spec is unit-tested in node
// (tests/unit/execution.test.ts). The scene (./level-scene.ts) only drives it
// with a timer and redraws from the getters.
//
// PLAY runs the drawn plan through resolveTick (src/core/sim.ts) — the single
// entry point of the rules — at 4 ticks per second, with an optional ×2 and
// a Stop that goes back to the plan. The frames are computed once, up front,
// so the playback can never drift from the simulation: what is displayed at a
// tick is exactly the frame resolveTick produced for that tick, and
// yapAssertDisplayedMatchesSim enforces it in dev builds.
import { YAP_MAX_TICKS, type YapCell, type YapDir, type YapLevel } from '../core/level';
import {
  createInitialState,
  resolveTick,
  type YapPlan,
  type YapSimOutcome,
  type YapSimState,
} from '../core/sim';

/** Execution speed of the Gate 1 spec: 4 ticks per second. */
export const YAP_TICKS_PER_SECOND = 4;
/** The optional ×2 of the Execution screen. */
export const YAP_EXECUTION_SPEEDS = [1, 2] as const;
export type YapExecutionSpeed = (typeof YAP_EXECUTION_SPEEDS)[number];

/** Playback error (dev assertion, plan bound). */
export class YapExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapExecutionError';
  }
}

/**
 * What the renderer has on screen for the current tick: the positions it
 * displays. yapAssertDisplayedMatchesSim compares it with the simulated frame.
 */
export interface YapDisplayedSnapshot {
  readonly tick: number;
  readonly thief: YapCell;
  readonly guards: readonly { readonly pos: YapCell; readonly facing: YapDir }[];
  readonly cameras: readonly { readonly at: YapCell; readonly facing: YapDir }[];
  readonly lasers: readonly { readonly cells: readonly YapCell[]; readonly active: boolean }[];
}

function sameCell(a: YapCell, b: YapCell): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameCells(a: readonly YapCell[], b: readonly YapCell[]): boolean {
  return a.length === b.length && a.every((c, i) => sameCell(c, b[i] as YapCell));
}

export class YapExecution {
  /** One frame per tick, tick 0 included; ends on the first non-running outcome. */
  private readonly yapSimFrames: readonly YapSimState[];
  private yapTickIndex = 0;
  private yapCurrentSpeed: YapExecutionSpeed = 1;
  private yapPlaying = false;

  constructor(level: YapLevel, plan: YapPlan) {
    if (plan.length > YAP_MAX_TICKS) {
      throw new YapExecutionError(
        `YapExecution: a plan is at most ${YAP_MAX_TICKS} steps (pauses included), got ${plan.length}`,
      );
    }
    // The plan runs through resolveTick, the single rule entry point: the
    // playback replays exactly these frames, it never re-implements a rule.
    let state = createInitialState(level);
    const frames: YapSimState[] = [state];
    for (const step of plan) {
      state = resolveTick(state, step);
      frames.push(state);
      if (state.outcome.kind !== 'running') break;
    }
    this.yapSimFrames = frames;
  }

  // -------------------------------------------------------------------------
  // Frames and ticks
  // -------------------------------------------------------------------------

  /** One frame per tick, tick 0 included. */
  yapFrames(): readonly YapSimState[] {
    return this.yapSimFrames;
  }

  /** Index of the current frame (0 = tick 0). */
  yapTick(): number {
    return this.yapTickIndex;
  }

  /** The last frame index (the tick the plan ends on). */
  yapMaxTick(): number {
    return this.yapSimFrames.length - 1;
  }

  /** The simulated frame of the current tick — what must be displayed. */
  yapFrame(): YapSimState {
    const frame = this.yapSimFrames[this.yapTickIndex];
    if (frame === undefined)
      throw new YapExecutionError(`YapExecution: no frame at tick ${this.yapTickIndex}`);
    return frame;
  }

  /** The outcome the plan ends on (running until the last frame). */
  yapOutcome(): YapSimOutcome {
    const last = this.yapSimFrames[this.yapSimFrames.length - 1];
    if (last === undefined) throw new YapExecutionError('YapExecution: no frames');
    return last.outcome;
  }

  // -------------------------------------------------------------------------
  // Speed: 4 ticks/s, with an optional ×2
  // -------------------------------------------------------------------------

  yapSpeed(): YapExecutionSpeed {
    return this.yapCurrentSpeed;
  }

  /** Toggles ×1 / ×2 and returns the new speed. */
  yapToggleSpeed(): YapExecutionSpeed {
    this.yapCurrentSpeed = this.yapCurrentSpeed === 1 ? 2 : 1;
    return this.yapCurrentSpeed;
  }

  /** Milliseconds per tick at the current speed (250 ms at ×1, 125 ms at ×2). */
  yapTickMs(): number {
    return Math.round(1000 / (YAP_TICKS_PER_SECOND * this.yapCurrentSpeed));
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  yapIsPlaying(): boolean {
    return this.yapPlaying;
  }

  /** True once the last frame is reached (won, detected, or plan consumed). */
  yapIsFinished(): boolean {
    return this.yapTickIndex >= this.yapSimFrames.length - 1;
  }

  yapStart(): void {
    if (!this.yapIsFinished()) this.yapPlaying = true;
  }

  /**
   * Advances one tick and returns the frame to display, or null when the
   * playback is over (not playing, or the last frame is reached).
   */
  yapAdvance(): YapSimState | null {
    if (!this.yapPlaying || this.yapIsFinished()) {
      this.yapPlaying = false;
      return null;
    }
    this.yapTickIndex += 1;
    return this.yapFrame();
  }

  /** Stop: back to the plan — tick 0, not playing (the attempt still counts). */
  yapStop(): void {
    this.yapPlaying = false;
    this.yapTickIndex = 0;
  }

  // -------------------------------------------------------------------------
  // Dev assertion: displayed positions = simulated positions at every tick
  // -------------------------------------------------------------------------

  /**
   * Dev assertion (import.meta.env.DEV): the snapshot the renderer has on
   * screen must equal the simulated frame of the current tick — thief, guards,
   * cameras and lasers. Throws YapExecutionError on any drift.
   */
  yapAssertDisplayedMatchesSim(displayed: YapDisplayedSnapshot): void {
    if (!import.meta.env.DEV) return;
    const frame = this.yapFrame();
    const fail = (what: string): never => {
      throw new YapExecutionError(
        `YapExecution: displayed != simulated at tick ${frame.tick}: ${what} (displayed tick ${displayed.tick})`,
      );
    };
    if (displayed.tick !== frame.tick) fail('tick');
    if (!sameCell(displayed.thief, frame.thief)) fail('thief');
    if (displayed.guards.length !== frame.guards.length) fail('guard-count');
    for (let i = 0; i < frame.guards.length; i += 1) {
      const want = frame.guards[i];
      const got = displayed.guards[i];
      if (want === undefined || got === undefined) fail('guard-count');
      else if (!sameCell(got.pos, want.pos) || got.facing !== want.facing) fail(`guard#${want.id}`);
    }
    if (displayed.cameras.length !== frame.cameras.length) fail('camera-count');
    for (let i = 0; i < frame.cameras.length; i += 1) {
      const want = frame.cameras[i];
      const got = displayed.cameras[i];
      if (want === undefined || got === undefined) fail('camera-count');
      else if (!sameCell(got.at, want.at) || got.facing !== want.facing) fail(`camera#${want.id}`);
    }
    if (displayed.lasers.length !== frame.lasers.length) fail('laser-count');
    for (let i = 0; i < frame.lasers.length; i += 1) {
      const want = frame.lasers[i];
      const got = displayed.lasers[i];
      if (want === undefined || got === undefined) fail('laser-count');
      else if (got.active !== want.active || !sameCells(got.cells, want.cells)) {
        fail(`laser#${want.id}`);
      }
    }
  }
}
