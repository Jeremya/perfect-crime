// YapGhostPreview — the ghost preview of the Planning screen (story C6).
//
// While the player draws a route, the Gate 1 spec shows guards, cameras and
// lasers at the tick of the cell under the finger, behind the `ghost` flag
// (src/app/config.ts, `?flag=ghost:0/1`, on by default). This module is pure
// and Phaser-free like YapPathInput (./path-input.ts): the world at a tick is
// computed only through the sim's single rule entry point (createInitialState
// + resolveTick in src/core/sim.ts) — never re-implemented here. Cones are
// exactly the cells of visibleCells for that tick (docs/UI-DESIGN.md).
//
// The hook that exposes the preview while drawing lives in YapPathInput
// (./path-input.ts); the scene renders a YapGhostState with reduced opacity
// and an explicit ghost treatment so it cannot be confused with tick 0.
import { YAP_MAX_TICKS, type YapCell, type YapLevel } from '../core/level';
import {
  createInitialState,
  resolveTick,
  visibleCells,
  type YapCameraView,
  type YapGuardView,
  type YapLaserView,
  type YapPlan,
  type YapSimOutcome,
} from '../core/sim';
import { parseFlagsFromSearch, YAP_DEFAULT_FLAGS, type YapFlags } from '../app/config';

/** Ghost preview error (invalid tick). */
export class YapGhostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapGhostError';
  }
}

/** The world at one tick, as the ghost preview shows it: no thief, no outcome. */
export interface YapGhostState {
  readonly tick: number;
  readonly guards: readonly YapGuardView[];
  readonly cameras: readonly YapCameraView[];
  readonly lasers: readonly YapLaserView[];
}

/** Cone cells of a ghost state — exactly visibleCells for that tick. */
export interface YapGhostCones {
  /** One entry per ghost guard, in the same order as YapGhostState.guards. */
  readonly guards: readonly (readonly YapCell[])[];
  /** One entry per ghost camera, in the same order as YapGhostState.cameras. */
  readonly cameras: readonly (readonly YapCell[])[];
}

/**
 * The ghost preview of one level: the world state at any tick in
 * [0, YAP_MAX_TICKS], cached per tick. The thief waits while the world
 * advances; a detection on the way is ignored — the preview shows where the
 * threats are at the tick, not the outcome — and every position still comes
 * from resolveTick, the single entry point of the rules.
 */
export class YapGhostPreview {
  private readonly yapLevel: YapLevel;
  private readonly yapCache = new Map<number, YapGhostState>();

  constructor(level: YapLevel) {
    this.yapLevel = level;
  }

  /** The world at `tick` (0 = the initial state). */
  yapAt(tick: number): YapGhostState {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > YAP_MAX_TICKS) {
      throw new YapGhostError(
        `YapGhost: tick must be an integer in [0, ${YAP_MAX_TICKS}], got ${tick}`,
      );
    }
    const cached = this.yapCache.get(tick);
    if (cached !== undefined) return cached;
    let state = createInitialState(this.yapLevel);
    for (let k = 0; k < tick; k += 1) {
      const next = resolveTick(state, 'wait');
      // keep advancing past a detection: the ghost shows the threats at the
      // tick, not whether a waiting thief would be caught there
      state = next.outcome.kind === 'running' ? next : { ...next, outcome: { kind: 'running' } };
    }
    const ghost: YapGhostState = {
      tick: state.tick,
      guards: state.guards,
      cameras: state.cameras,
      lasers: state.lasers,
    };
    this.yapCache.set(tick, ghost);
    return ghost;
  }
}

/**
 * Cone cells of a ghost state: for every guard and camera, exactly
 * `visibleCells(level, origin, facing, range)` at the ghost tick — the same
 * exact-cell rule as the tick-0 cones (docs/UI-DESIGN.md, non-negotiable).
 */
export function yapGhostCones(level: YapLevel, ghost: YapGhostState): YapGhostCones {
  return {
    guards: ghost.guards.map((g, i) => {
      const def = level.guards[i];
      return def === undefined ? g.seen : visibleCells(level, g.pos, g.facing, def.range);
    }),
    cameras: ghost.cameras.map((c, i) => {
      const def = level.cameras[i];
      return def === undefined ? c.seen : visibleCells(level, c.at, c.facing, def.range);
    }),
  };
}

/** The scene modes of YapLevelScene, as far as the ghost layer is concerned. */
export type YapGhostRenderMode = 'planning' | 'execution' | 'failure' | 'win' | 'preview';

/**
 * Whether the scene draws the ghost layer: only in planning mode, and only
 * when the path-input exposes a ghost state (drawing in progress + the ghost
 * flag on). Every other case — drawing stopped, execution/failure/win/preview
 * running, flag off — clears the layer. This is the visibility rule of the
 * C6 render in ./level-scene.ts, kept pure here so it is unit-tested in node.
 */
export function yapGhostLayerVisible(
  mode: YapGhostRenderMode,
  ghost: YapGhostState | null,
): boolean {
  return mode === 'planning' && ghost !== null;
}

/**
 * Resolve the `ghost` flag read-only from src/app/config.ts: the default (on),
 * then a stored profile flag, then the URL override (`?flag=ghost:0/1`, last
 * one wins) — the same precedence as loadYapProfile, without persisting.
 */
export function yapResolveGhostFlag(search = '', stored?: Partial<YapFlags>): boolean {
  const flags: YapFlags = {
    ...YAP_DEFAULT_FLAGS,
    ...(stored ?? {}),
    ...parseFlagsFromSearch(search),
  };
  return flags.ghost;
}

// ---------------------------------------------------------------------------
// Plan preview (X3) — the Angry Birds "dotted arc"
// (docs/design/experience.md §3.1): replay the whole drawn plan as a ghost
// ---------------------------------------------------------------------------

/**
 * One state of the plan preview (X3): the ghost world at one tick of the plan
 * (exactly a YapGhostState, so yapGhostCones applies unchanged) plus the
 * thief's cell and the outcome at that tick, so the scene can move the ghost
 * thief along the route and stop on the win/caught tick.
 */
export interface YapPreviewState extends YapGhostState {
  readonly thief: YapCell;
  readonly hasLoot: boolean;
  readonly outcome: YapSimOutcome;
}

/**
 * The plan preview of X3: one state per tick of the plan, computed only
 * through resolveTick — the single rule entry point, never re-implemented.
 * Like YapGhostPreview.yapAt, the chain keeps advancing past a detection (the
 * outcome is forced back to running) so the whole plan is always previewable;
 * each state still records the outcome of its own tick, so the last state of
 * a plan that ends on its last step carries exactly the outcome of
 * run(level, plan).
 */
export function yapPreviewStates(level: YapLevel, plan: YapPlan): YapPreviewState[] {
  if (plan.length > YAP_MAX_TICKS) {
    throw new YapGhostError(
      `YapPreview: a plan is at most ${YAP_MAX_TICKS} steps (pauses included), got ${plan.length}`,
    );
  }
  let state = createInitialState(level);
  const states: YapPreviewState[] = [];
  for (const step of plan) {
    const next = resolveTick(state, step);
    states.push({
      tick: next.tick,
      thief: next.thief,
      hasLoot: next.hasLoot,
      guards: next.guards,
      cameras: next.cameras,
      lasers: next.lasers,
      outcome: next.outcome,
    });
    // keep advancing past a detection, like YapGhostPreview.yapAt: the preview
    // replays the whole plan; the outcome of each tick is kept on its state
    state = next.outcome.kind === 'running' ? next : { ...next, outcome: { kind: 'running' } };
  }
  return states;
}

/**
 * Resolve the `preview` flag (X3) read-only: default ON, then the URL
 * override `?flag=preview:0/1` (repeatable, comma-separated, last one wins) —
 * the same URL syntax as the ghost flag. src/app/config.ts is owned by A2 and
 * its YapFlags has no `preview` key, so the flag is parsed here rather than
 * through parseFlagsFromSearch.
 */
export function yapResolvePreviewFlag(search = ''): boolean {
  let value = true; // default on, like the ghost flag
  for (const raw of new URLSearchParams(search).getAll('flag')) {
    for (const part of raw.split(',')) {
      const match = /^preview:(?<value>[01])$/.exec(part.trim());
      const v = match?.groups?.value;
      if (v !== undefined) value = v === '1';
    }
  }
  return value;
}
