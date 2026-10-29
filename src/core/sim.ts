// Deterministic simulation — Gate 1 spec, "Game rules" and "Simulation".
//
// One tick = one integer step. resolveTick(state, step) is the single entry
// point called by the game, the solver, the viewer and the tools: there is
// never a second implementation of the rules. visibleCells(level, origin,
// facing, range) is the vision cone with an integer Bresenham line of sight.
//
// src/core is pure and deterministic: integers only, no Math.random, no Date,
// no performance.now, no floats.

import {
  YAP_MAX_TICKS,
  type YapCamera,
  type YapCell,
  type YapDir,
  type YapGuard,
  type YapLaser,
  type YapLevel,
} from './level';

export type YapMove = YapDir | 'wait';
export type YapPlan = readonly YapMove[];

/** Written cause of a capture: the first detection rule triggered. */
export type YapCause = 'guard' | 'camera' | 'laser';

export type YapSimOutcome =
  | { readonly kind: 'running' }
  | {
      readonly kind: 'detected';
      readonly cause: YapCause;
      readonly by: string;
      readonly tick: number;
    }
  | { readonly kind: 'won'; readonly tick: number };

export interface YapGuardView {
  readonly id: string;
  readonly pos: YapCell;
  readonly facing: YapDir;
  readonly seen: readonly YapCell[];
}

export interface YapCameraView {
  readonly id: string;
  readonly at: YapCell;
  readonly facing: YapDir;
  readonly seen: readonly YapCell[];
}

export interface YapLaserView {
  readonly id: string;
  readonly cells: readonly YapCell[];
  readonly active: boolean;
}

export interface YapSimState {
  readonly level: YapLevel;
  readonly tick: number;
  readonly thief: YapCell;
  /** Cell of the thief at the previous tick (swap detection, U-turn rule). */
  readonly prevThief: YapCell;
  readonly guards: readonly YapGuardView[];
  readonly cameras: readonly YapCameraView[];
  readonly lasers: readonly YapLaserView[];
  readonly hasLoot: boolean;
  readonly lootTick: number | null;
  readonly outcome: YapSimOutcome;
}

export interface YapRunResult {
  /** One frame per tick, initial frame (tick 0) included. */
  readonly frames: readonly YapSimState[];
  readonly outcome: YapSimOutcome;
  readonly lootTick: number | null;
}

export class YapSimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapSimError';
  }
}

const DIR_VECTORS: Readonly<Record<YapDir, YapCell>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

function isWall(level: YapLevel, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return true;
  const row = level.map[y];
  if (row === undefined) return true;
  return row.charAt(x) === '#';
}

function sameCell(a: YapCell, b: YapCell): boolean {
  return a.x === b.x && a.y === b.y;
}

function cellIn(c: YapCell, cells: readonly YapCell[]): boolean {
  return cells.some((s) => sameCell(s, c));
}

function dirBetween(from: YapCell, to: YapCell): YapDir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return null;
}

// ---------------------------------------------------------------------------
// Patrols, cameras, lasers (pure functions of the tick)
// ---------------------------------------------------------------------------

function guardPeriod(guard: YapGuard): number {
  if (guard.mode === 'loop') return guard.route.length;
  return guard.route.length >= 2 ? 2 * guard.route.length - 2 : 1;
}

/** Position of a guard at `tick`; phase shifts the start of the patrol. */
function guardPosAt(guard: YapGuard, tick: number): YapCell {
  const route = guard.route;
  const n = route.length;
  const period = guardPeriod(guard);
  const i = (tick + guard.phase) % period;
  const idx = guard.mode === 'pingpong' && n >= 2 && i >= n ? period - i : i % n;
  const c = route[idx];
  if (c === undefined) {
    throw new YapSimError(`guard "${guard.id}": route index ${idx} out of range`);
  }
  return c;
}

/** Facing at `tick`: towards the next cell, or kept / set during a wait. */
function guardFacingAt(guard: YapGuard, tick: number, prevFacing: YapDir): YapDir {
  const d = dirBetween(guardPosAt(guard, tick), guardPosAt(guard, tick + 1));
  if (d !== null) return d;
  return guard.face ?? prevFacing;
}

function initialGuardFacing(guard: YapGuard): YapDir {
  const d = dirBetween(guardPosAt(guard, 0), guardPosAt(guard, 1));
  if (d !== null) return d;
  if (guard.face !== undefined) return guard.face;
  // wait at tick 0 without a level face: face the next distinct patrol cell
  const period = guardPeriod(guard);
  for (let k = 2; k <= period; k += 1) {
    const dd = dirBetween(guardPosAt(guard, 0), guardPosAt(guard, k));
    if (dd !== null) return dd;
  }
  return 'N';
}

/** Direction a camera faces at `tick`: each direction is held `hold` ticks. */
function cameraDirAt(camera: YapCamera, tick: number): YapDir {
  const period = camera.dirs.length * camera.hold;
  let rem = (tick + camera.phase) % period;
  let dirIdx = 0;
  while (rem >= camera.hold) {
    rem -= camera.hold;
    dirIdx += 1;
  }
  const d = camera.dirs[dirIdx];
  if (d === undefined) {
    throw new YapSimError(`camera "${camera.id}": dir index ${dirIdx} out of range`);
  }
  return d;
}

/** A laser is on for `on` ticks then off for `off` ticks, shifted by phase. */
function laserOnAt(laser: YapLaser, tick: number): boolean {
  const cycle = laser.on + laser.off;
  return ((tick + laser.phase) % cycle) < laser.on;
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------

/** Integer Bresenham, endpoints excluded (Gate 1 spec, Technical specs). */
function lineOfSight(level: YapLevel, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  // Bresenham reaches (x1, y1) in at most dx + |y1 - y0| steps.
  for (let k = 0; k <= dx - dy; k += 1) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === x1 && y === y1) return true;
    if (isWall(level, x, y)) return false;
  }
  throw new YapSimError(`lineOfSight from [${x0}, ${y0}] to [${x1}, ${y1}] did not converge`);
}

/** Cone membership: 1 <= forward <= range and |lateral| <= forward - 1. */
function inCone(origin: YapCell, facing: YapDir, range: number, x: number, y: number): boolean {
  const f = DIR_VECTORS[facing];
  const dx = x - origin.x;
  const dy = y - origin.y;
  const forward = dx * f.x + dy * f.y;
  const lateral = Math.abs(dx * f.y - dy * f.x);
  return forward >= 1 && forward <= range && lateral <= forward - 1;
}

const visibleCache = new WeakMap<YapLevel, Map<string, readonly YapCell[]>>();

/**
 * Cells seen from `origin` facing `facing` with `range`: inside the cone,
 * inside the grid, not a wall, and with a clear Bresenham line of sight
 * (endpoints excluded). Pure function of its arguments; cached per level.
 */
export function visibleCells(
  level: YapLevel,
  origin: YapCell,
  facing: YapDir,
  range: number,
): readonly YapCell[] {
  let perLevel = visibleCache.get(level);
  if (perLevel === undefined) {
    perLevel = new Map<string, readonly YapCell[]>();
    visibleCache.set(level, perLevel);
  }
  const key = `${origin.x},${origin.y},${facing},${range}`;
  const cached = perLevel.get(key);
  if (cached !== undefined) return cached;
  const cells: YapCell[] = [];
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      if (!inCone(origin, facing, range, x, y)) continue;
      if (isWall(level, x, y)) continue;
      if (!lineOfSight(level, origin.x, origin.y, x, y)) continue;
      cells.push({ x, y });
    }
  }
  const frozen: readonly YapCell[] = Object.freeze(cells);
  perLevel.set(key, frozen);
  return frozen;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** State at tick 0: nobody has moved yet, no detection is evaluated. */
export function createInitialState(level: YapLevel): YapSimState {
  const guards: YapGuardView[] = level.guards.map((g) => {
    const pos = guardPosAt(g, 0);
    const facing = initialGuardFacing(g);
    return { id: g.id, pos, facing, seen: visibleCells(level, pos, facing, g.range) };
  });
  const cameras: YapCameraView[] = level.cameras.map((c) => {
    const facing = cameraDirAt(c, 0);
    return { id: c.id, at: c.at, facing, seen: visibleCells(level, c.at, facing, c.range) };
  });
  const lasers: YapLaserView[] = level.lasers.map((l) => ({
    id: l.id,
    cells: l.cells,
    active: laserOnAt(l, 0),
  }));
  return {
    level,
    tick: 0,
    thief: level.start,
    prevThief: level.start,
    guards,
    cameras,
    lasers,
    hasLoot: false,
    lootTick: null,
    outcome: { kind: 'running' },
  };
}

/**
 * Advance the simulation from tick t to tick t + 1 by executing one plan
 * step. Resolution order (Gate 1 spec, "Tick resolution order"):
 *   1. the thief executes step t of its plan (a move or a wait);
 *   2. each guard advances one step along its patrol, facing recomputed;
 *   3. cameras and lasers take their state for tick t + 1;
 *   4. detection, in order: contact (same cell or swap), vision by a guard,
 *      vision by a camera, an active laser under the thief — the first rule
 *      triggered gives the cause;
 *   5. if not caught, the diamond is picked up on its cell, and the level is
 *      won on the exit with the diamond.
 */
export function resolveTick(state: YapSimState, step: YapMove): YapSimState {
  if (state.outcome.kind !== 'running') {
    throw new YapSimError(`the simulation is already ${state.outcome.kind} (tick ${state.tick})`);
  }
  const level = state.level;
  const t1 = state.tick + 1;

  // 1. The thief executes step t of its plan: a move or a wait.
  let thief: YapCell;
  if (step === 'wait') {
    thief = state.thief;
  } else {
    const v = DIR_VECTORS[step];
    const next = { x: state.thief.x + v.x, y: state.thief.y + v.y };
    if (isWall(level, next.x, next.y)) {
      throw new YapSimError(
        `tick ${t1}: the thief cannot move ${step} into the wall at [${next.x}, ${next.y}]`,
      );
    }
    if (sameCell(next, state.prevThief)) {
      throw new YapSimError(`tick ${t1}: no immediate U-turn onto [${next.x}, ${next.y}]`);
    }
    thief = next;
  }
  const prevThief = state.thief;

  // 2. Each guard advances one step along its patrol; its facing is recomputed.
  const guards: YapGuardView[] = level.guards.map((g, i) => {
    const prev = state.guards[i];
    const pos = guardPosAt(g, t1);
    const facing = guardFacingAt(g, t1, prev !== undefined ? prev.facing : initialGuardFacing(g));
    return { id: g.id, pos, facing, seen: visibleCells(level, pos, facing, g.range) };
  });

  // 3. Cameras and lasers take their state for tick t + 1.
  const cameras: YapCameraView[] = level.cameras.map((c) => {
    const facing = cameraDirAt(c, t1);
    return { id: c.id, at: c.at, facing, seen: visibleCells(level, c.at, facing, c.range) };
  });
  const lasers: YapLaserView[] = level.lasers.map((l) => ({
    id: l.id,
    cells: l.cells,
    active: laserOnAt(l, t1),
  }));

  // 4. Detection, in order; the first rule triggered gives the cause.
  let outcome: YapSimOutcome = { kind: 'running' };
  for (let i = 0; i < guards.length; i += 1) {
    const g = guards[i];
    const prev = state.guards[i];
    if (g === undefined || prev === undefined) continue;
    const onGuardCell = sameCell(thief, g.pos);
    const swapped = sameCell(thief, prev.pos) && sameCell(prevThief, g.pos);
    if (onGuardCell || swapped) {
      outcome = { kind: 'detected', cause: 'guard', by: g.id, tick: t1 };
      break;
    }
  }
  if (outcome.kind === 'running') {
    for (const g of guards) {
      if (cellIn(thief, g.seen)) {
        outcome = { kind: 'detected', cause: 'guard', by: g.id, tick: t1 };
        break;
      }
    }
  }
  if (outcome.kind === 'running') {
    for (const c of cameras) {
      if (cellIn(thief, c.seen)) {
        outcome = { kind: 'detected', cause: 'camera', by: c.id, tick: t1 };
        break;
      }
    }
  }
  if (outcome.kind === 'running') {
    for (const l of lasers) {
      if (l.active && cellIn(thief, l.cells)) {
        outcome = { kind: 'detected', cause: 'laser', by: l.id, tick: t1 };
        break;
      }
    }
  }

  // 5. If not caught: pick up the diamond; win on the exit with the diamond.
  let hasLoot = state.hasLoot;
  let lootTick = state.lootTick;
  if (outcome.kind === 'running') {
    if (sameCell(thief, level.loot)) {
      hasLoot = true;
      lootTick = t1;
    }
    if (hasLoot && sameCell(thief, level.exit)) {
      outcome = { kind: 'won', tick: t1 };
    }
  }

  return {
    level,
    tick: t1,
    thief,
    prevThief,
    guards,
    cameras,
    lasers,
    hasLoot,
    lootTick,
    outcome,
  };
}

/** Run a whole plan: one frame per tick, then the outcome, the cause, the tick and the pickup moment. */
export function run(level: YapLevel, plan: YapPlan): YapRunResult {
  if (plan.length > YAP_MAX_TICKS) {
    throw new YapSimError(
      `a plan is at most ${YAP_MAX_TICKS} steps (pauses included), got ${plan.length}`,
    );
  }
  let state = createInitialState(level);
  const frames: YapSimState[] = [state];
  for (const step of plan) {
    state = resolveTick(state, step);
    frames.push(state);
    if (state.outcome.kind !== 'running') break;
  }
  return { frames, outcome: state.outcome, lootTick: state.lootTick };
}
