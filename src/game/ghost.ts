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
export type YapGhostRenderMode = 'planning' | 'execution' | 'failure' | 'win';

/**
 * Whether the scene draws the ghost layer: only in planning mode, and only
 * when the path-input exposes a ghost state (drawing in progress + the ghost
 * flag on). Every other case — drawing stopped, execution/failure/win running,
 * flag off — clears the layer. This is the visibility rule of the C6 render in
 * ./level-scene.ts, kept pure here so it is unit-tested in node.
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
