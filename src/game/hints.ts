// YapHints — the hints of the Planning screen (story C7).
//
// Gate 1 spec, "Score, stars and attempts": "Hints: after 3 failures, then
// after 6, on the same heist. The first shows the first third of the optimal
// plan as a ghost, the second shows two thirds. They appear in the share
// (💡)." And "Hints and accessibility": "The hint shows as a dotted ghost
// path; the player can draw over it."
//
// This module is pure and Phaser-free like YapPathInput (./path-input.ts) and
// YapGhostPreview (./ghost.ts): the optimal plan comes from YapSolver
// (src/core/solver.ts) and the ghost cells are the thief cells of the
// simulated plan (run() in src/core/sim.ts) — the hint never re-implements a
// rule. The scene (./level-scene.ts) draws the ghost under the player's path
// and feeds yapHintsUsed() to the Win screen, which puts one 💡 per hint in
// the share (src/game/win.ts).
import { type YapCell, type YapLevel } from '../core/level';
import { run, type YapPlan } from '../core/sim';
import { YapSolver, YapSolverError, type YapSolveResult } from '../core/solver';

/**
 * Failures on the same heist that unlock each hint: the first hint after 3
 * failures, the second after 6 (Gate 1 spec).
 */
export const YAP_HINT_FAILURE_THRESHOLDS: readonly [number, number] = [3, 6];

/** At most two hints per heist (Gate 1 spec). */
export const YAP_MAX_HINTS = YAP_HINT_FAILURE_THRESHOLDS.length;

/** One revealed hint: how much of the optimal plan the ghost shows. */
export interface YapHintReveal {
  /** 0-based index of the hint (0 = first third, 1 = two thirds). */
  readonly index: number;
  /** Steps of the optimal plan revealed by this hint. */
  readonly steps: number;
  /** Ghost cells: the start cell plus one cell per revealed step. */
  readonly cells: readonly YapCell[];
}

/**
 * The hint state of one run of a level: how many failures were registered,
 * how many hints were used, and the ghost cells currently revealed. The
 * scene registers one failure per detection (C4) and calls yapUseHint() when
 * the player presses the Hint button of the bottom bar.
 */
export class YapHints {
  private readonly yapLevel: YapLevel;
  /** The solver result, or null when the level cannot be cleared. */
  private readonly yapSolved: YapSolveResult | null;
  private yapFailureCount = 0;
  private yapUsed = 0;
  private yapGhost: readonly YapCell[] = [];

  constructor(level: YapLevel, solver: YapSolver = new YapSolver()) {
    this.yapLevel = level;
    try {
      this.yapSolved = solver.solve(level);
    } catch (e) {
      // An unsolvable level simply has no hint (the bundled levels are all
      // validated solvable); the game must never crash on a hint.
      if (e instanceof YapSolverError) this.yapSolved = null;
      else throw e;
    }
  }

  /** Registers one failure on the heist and returns the new count. */
  yapRegisterFailure(): number {
    this.yapFailureCount += 1;
    return this.yapFailureCount;
  }

  /** Failures registered so far on this heist. */
  yapFailures(): number {
    return this.yapFailureCount;
  }

  /** Hints used so far (what the share counts in 💡). */
  yapHintsUsed(): number {
    return this.yapUsed;
  }

  /** Failures needed for the next hint, or null when all hints are used. */
  yapNextHintFailures(): number | null {
    if (this.yapUsed >= YAP_MAX_HINTS) return null;
    return YAP_HINT_FAILURE_THRESHOLDS[this.yapUsed] ?? null;
  }

  /** True when the player may use the next hint right now. */
  yapHintAvailable(): boolean {
    const next = this.yapNextHintFailures();
    return next !== null && this.yapSolved !== null && this.yapFailureCount >= next;
  }

  /**
   * Uses the next hint (first third, then two thirds of the optimal plan)
   * and returns what the ghost now shows. Returns null — and counts
   * nothing — when no hint is available.
   */
  yapUseHint(): YapHintReveal | null {
    if (!this.yapHintAvailable() || this.yapSolved === null) return null;
    const plan = this.yapSolved.plan;
    const n = plan.length;
    const index = this.yapUsed;
    // hint k (1-based) reveals the first ceil(k * n / 3) steps of the plan
    const steps = Math.min(n, Math.ceil(((index + 1) * n) / 3));
    // The ghost cells are the thief cells of the simulated optimal plan at
    // ticks 0..steps — run() is the single rule entry point.
    const frames = run(this.yapLevel, plan).frames;
    const cells: YapCell[] = [];
    for (let i = 0; i <= steps && i < frames.length; i += 1) {
      const thief = frames[i]?.thief;
      if (thief !== undefined) cells.push(thief);
    }
    this.yapUsed += 1;
    this.yapGhost = cells;
    return { index, steps, cells };
  }

  /** The ghost cells currently revealed (empty when no hint was used). */
  yapGhostCells(): readonly YapCell[] {
    return this.yapGhost;
  }

  /** The canonical optimal plan, or null when the level is unsolvable. */
  yapOptimalPlan(): YapPlan | null {
    return this.yapSolved?.plan ?? null;
  }
}
