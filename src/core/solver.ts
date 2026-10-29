// Optimal-plan solver — Gate 1 spec, "Solver" (Technical specs).
//
// Breadth-first search over the state (x, y, previous cell, tick, pauses
// left, diamond taken). Every transition that reaches a new state goes
// through resolveTick — the solver never re-implements a rule — and a state
// where the thief is caught is dropped. Maximum depth: YAP_MAX_TICKS ticks.
//
// Outputs: par (the minimum number of ticks); the canonical optimal plan,
// i.e. the lexicographically smallest one in the transition order
// N, E, S, W, wait; the minimum number of pauses among the optimal plans;
// the number of optimal plans, capped at YAP_MAX_OPTIMAL_PLANS; and the
// tension, i.e. the number of ticks of the optimal plan where the thief is
// one orthogonal cell away from a seen cell.
//
// src/core is pure and deterministic: integers only, no Math.random, no Date,
// no performance.now, no floats.

import {
  YAP_MAX_TICKS,
  YAP_TICK_PERIOD,
  type YapCell,
  type YapDir,
  type YapLevel,
} from './level';
import {
  createInitialState,
  resolveTick,
  run,
  type YapMove,
  type YapPlan,
  type YapSimState,
} from './sim';

/** Cap on the reported number of optimal plans (Gate 1 spec). */
export const YAP_MAX_OPTIMAL_PLANS = 1000;

/** Thrown when a level cannot be cleared within YAP_MAX_TICKS ticks. */
export class YapSolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapSolverError';
  }
}

export interface YapSolveResult {
  readonly level: YapLevel;
  /** Minimum number of ticks to clear the level, pauses included (par). */
  readonly par: number;
  /** Canonical optimal plan: lexicographically smallest in the order N, E, S, W, wait. */
  readonly plan: YapPlan;
  /** Minimum number of pauses among the optimal plans. */
  readonly minPauses: number;
  /** Number of optimal plans, capped at YAP_MAX_OPTIMAL_PLANS. */
  readonly optimalPlans: number;
  /** Ticks of the optimal plan where the thief is one orthogonal cell away from a seen cell. */
  readonly tension: number;
}

/** Canonical transition order (Gate 1 spec): N, E, S, W, then wait. */
const STEPS: readonly YapMove[] = ['N', 'E', 'S', 'W', 'wait'];

const DIR_VECTORS: Readonly<Record<YapDir, YapCell>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

interface YapSearchNode {
  /** Simulation frame; released once the node has been expanded. */
  state: YapSimState | null;
  readonly x: number;
  readonly y: number;
  readonly prevX: number;
  readonly prevY: number;
  readonly tick: number;
  readonly pausesLeft: number;
  readonly hasLoot: number;
  readonly parent: number;
  readonly step: YapMove | null;
  /** Number of shortest plans reaching this node, capped at YAP_MAX_OPTIMAL_PLANS. */
  count: number;
}

/**
 * State key. The world (patrol positions, facings, camera directions, laser
 * cycles) is a pure function of the tick and repeats every YAP_TICK_PERIOD
 * ticks once every patrol has made its first step, so ticks at or above
 * YAP_TICK_PERIOD are keyed modulo the period. Ticks below it keep their own
 * key: a guard that waits before its first step can face differently at
 * tick 0 than at tick 24 (initialGuardFacing looks forward), so those states
 * are not merged.
 */
function stateKey(
  x: number,
  y: number,
  prevX: number,
  prevY: number,
  tick: number,
  pausesLeft: number,
  hasLoot: number,
): number {
  const tKey = tick < YAP_TICK_PERIOD ? tick : YAP_TICK_PERIOD + (tick % YAP_TICK_PERIOD);
  return (
    (x & 0xf) |
    ((y & 0xf) << 4) |
    ((prevX & 0xf) << 8) |
    ((prevY & 0xf) << 12) |
    (tKey << 16) |
    ((pausesLeft & 0x3) << 22) |
    ((hasLoot & 0x1) << 24)
  );
}

function isFloor(level: YapLevel, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  const row = level.map[y];
  return row !== undefined && row.charAt(x) !== '#';
}

function nearSeenCell(thief: YapCell, seen: readonly YapCell[]): boolean {
  for (const s of seen) {
    if (Math.abs(s.x - thief.x) + Math.abs(s.y - thief.y) === 1) return true;
  }
  return false;
}

/**
 * Tension of a plan: the number of its ticks where the thief stands one
 * orthogonal cell away from a cell seen by a guard or a camera.
 */
function tensionOf(level: YapLevel, plan: YapPlan): number {
  const { frames } = run(level, plan);
  let tension = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame === undefined) break;
    const thief = frame.thief;
    const near =
      frame.guards.some((g) => nearSeenCell(thief, g.seen)) ||
      frame.cameras.some((c) => nearSeenCell(thief, c.seen));
    if (near) tension += 1;
  }
  return tension;
}

export class YapSolver {
  private readonly cache = new WeakMap<YapLevel, YapSolveResult>();

  /**
   * Solve a level: par, canonical optimal plan, minimum pauses, number of
   * optimal plans (capped) and tension. Throws YapSolverError when the level
   * cannot be cleared within YAP_MAX_TICKS ticks. Results are cached per
   * level object.
   */
  solve(level: YapLevel): YapSolveResult {
    const cached = this.cache.get(level);
    if (cached !== undefined) return cached;
    const result = this.search(level);
    this.cache.set(level, result);
    return result;
  }

  private search(level: YapLevel): YapSolveResult {
    const root = createInitialState(level);
    const rootNode: YapSearchNode = {
      state: root,
      x: root.thief.x,
      y: root.thief.y,
      prevX: root.prevThief.x,
      prevY: root.prevThief.y,
      tick: 0,
      pausesLeft: level.maxPauses,
      hasLoot: 0,
      parent: -1,
      step: null,
      count: 1,
    };
    const nodes: YapSearchNode[] = [rootNode];
    // key -> index of the running node with that key
    const visited = new Map<number, number>();
    visited.set(
      stateKey(rootNode.x, rootNode.y, rootNode.prevX, rootNode.prevY, 0, level.maxPauses, 0),
      0,
    );
    // keys of states where the thief is caught
    const dead = new Set<number>();
    // win key -> number of optimal plans ending there, capped
    const winCounts = new Map<number, number>();
    let par = -1;
    let winParent = -1;
    let winStep: YapMove | null = null;
    let maxWinPausesLeft = 0;
    let head = 0;

    while (head < nodes.length) {
      const uIdx = head;
      head += 1;
      const u = nodes[uIdx];
      if (u === undefined) continue;
      // Wins are found while expanding the nodes at depth par - 1; once the
      // queue reaches depth par, every optimal plan has been counted.
      if (par >= 0 && u.tick >= par) break;
      if (u.tick >= YAP_MAX_TICKS) continue;
      const state = u.state;
      if (state === null) continue;

      for (const step of STEPS) {
        let childX = u.x;
        let childY = u.y;
        if (step === 'wait') {
          if (u.pausesLeft <= 0) continue;
        } else {
          const v = DIR_VECTORS[step];
          childX = u.x + v.x;
          childY = u.y + v.y;
          if (!isFloor(level, childX, childY)) continue;
          if (childX === u.prevX && childY === u.prevY) continue; // no immediate U-turn
        }
        const childPauses = step === 'wait' ? u.pausesLeft - 1 : u.pausesLeft;
        const childLoot =
          u.hasLoot === 1 || (childX === level.loot.x && childY === level.loot.y) ? 1 : 0;
        const childTick = u.tick + 1;
        const ckey = stateKey(childX, childY, u.x, u.y, childTick, childPauses, childLoot);

        // The child state is fully determined by its key: if it was already
        // reached (running) at the same depth, only the plan count grows.
        const seenIdx = visited.get(ckey);
        if (seenIdx !== undefined) {
          const v = nodes[seenIdx];
          if (v !== undefined && v.tick === childTick) {
            v.count = Math.min(YAP_MAX_OPTIMAL_PLANS, v.count + u.count);
          }
          continue;
        }
        if (dead.has(ckey)) continue;

        const child = resolveTick(state, step);
        const outcome = child.outcome;
        if (outcome.kind === 'detected') {
          dead.add(ckey);
          continue;
        }
        if (outcome.kind === 'won') {
          if (par < 0) {
            par = childTick;
            winParent = uIdx;
            winStep = step;
          }
          const prevCount = winCounts.get(ckey) ?? 0;
          winCounts.set(ckey, Math.min(YAP_MAX_OPTIMAL_PLANS, prevCount + u.count));
          if (childPauses > maxWinPausesLeft) maxWinPausesLeft = childPauses;
          continue;
        }
        visited.set(ckey, nodes.length);
        nodes.push({
          state: child,
          x: childX,
          y: childY,
          prevX: u.x,
          prevY: u.y,
          tick: childTick,
          pausesLeft: childPauses,
          hasLoot: childLoot,
          parent: uIdx,
          step,
          count: u.count,
        });
      }
      u.state = null; // the frame is only needed to expand the node
    }

    if (par < 0 || winStep === null) {
      throw new YapSolverError(
        `level "${level.name}" cannot be cleared within ${YAP_MAX_TICKS} ticks`,
      );
    }

    // Canonical plan: the first win found by the BFS in the order N, E, S, W,
    // wait is the lexicographically smallest optimal plan.
    const plan: YapMove[] = [winStep];
    let idx = winParent;
    while (idx >= 0) {
      const n = nodes[idx];
      if (n === undefined) break;
      if (n.step !== null) plan.push(n.step);
      idx = n.parent;
    }
    plan.reverse();

    let optimalPlans = 0;
    for (const c of winCounts.values()) {
      optimalPlans = Math.min(YAP_MAX_OPTIMAL_PLANS, optimalPlans + c);
    }

    return {
      level,
      par,
      plan,
      minPauses: level.maxPauses - maxWinPausesLeft,
      optimalPlans,
      tension: tensionOf(level, plan),
    };
  }
}

/** Convenience wrapper: solve a level with a fresh YapSolver. */
export function solveLevel(level: YapLevel): YapSolveResult {
  return new YapSolver().solve(level);
}
