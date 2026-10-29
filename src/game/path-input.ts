// YapPathInput — the path-drawing state machine of the Planning screen (C2).
//
// Pure and Phaser-free on purpose: the whole input contract of the Gate 1 spec
// ("Path drawing", "Pauses", "Rendering and input") is unit-tested in node
// (tests/unit/path-input.test.ts). The scene (./level-scene.ts) only forwards
// pointer positions and redraws from the getters.
//
// Rules implemented (Gate 1 — Screens and interactions):
// - drawing starts from the thief, or from the last cell of the path;
// - a cell is added only when the pointer enters its central zone (70%);
// - a fast swipe that skips cells is filled in cell by cell, in a straight
//   line, up to the first wall;
// - moving back onto the second-to-last cell erases the last one; touching
//   another cell of the path cuts it there and continues from that cell;
// - a tap (< 8 px, < 250 ms) on a path cell except the last adds a one-tick
//   pause; once the level's maximum is reached in total, the cell goes back
//   to zero;
// - the plan is at most 64 steps, pauses included;
// - reaching the exit once the diamond is picked up ends the drawing.
import { YAP_MAX_TICKS, type YapCell, type YapLevel } from '../core/level';
import type { YapMove } from '../core/sim';
import type { YapBoardLayout } from './board';

/** Central zone of a cell: a cell is entered only inside the central 70%. */
export const YAP_CENTRAL_ZONE = 0.7;
/** A tap is a touch of less than 8 px (spec: tunable threshold). */
export const YAP_TAP_MAX_DISTANCE = 8;
/** A tap lasts less than 250 ms (spec: tunable threshold). */
export const YAP_TAP_MAX_DURATION = 250;

export interface YapPathInputOptions {
  /** Plan length bound, pauses included; defaults to the spec's 64 steps. */
  readonly maxSteps?: number;
}

/** One in-progress stroke (pointer down, maybe moved, not yet released). */
interface YapGesture {
  readonly downX: number;
  readonly downY: number;
  readonly downTime: number;
  readonly downCell: YapCell;
  /** Index of downCell in the path, -1 when the press is not on the path. */
  readonly downIndex: number;
  /** True once the stroke extends the path (a tap stays false). */
  drawing: boolean;
}

export class YapPathInput {
  private readonly yapLevel: YapLevel;
  private yapLayout: YapBoardLayout;
  private readonly yapMaxSteps: number;
  private yapCells: YapCell[];
  private yapPauses: number[];
  private yapFinished: boolean;
  private yapGesture: YapGesture | null = null;

  constructor(level: YapLevel, layout: YapBoardLayout, options: YapPathInputOptions = {}) {
    this.yapLevel = level;
    this.yapLayout = layout;
    this.yapMaxSteps = options.maxSteps ?? YAP_MAX_TICKS;
    this.yapCells = [{ x: level.start.x, y: level.start.y }];
    this.yapPauses = [0];
    this.yapFinished = false;
  }

  /** Rebinds the geometry after a resize; the drawn path is preserved. */
  yapSetLayout(layout: YapBoardLayout): void {
    this.yapLayout = layout;
  }

  // -------------------------------------------------------------------------
  // Derived state (read-only views for the scene)
  // -------------------------------------------------------------------------

  /** The drawn path; the first cell is always the thief's start cell. */
  yapPath(): readonly YapCell[] {
    return this.yapCells;
  }

  /** Pause ticks per path cell (parallel to yapPath(); the last is always 0). */
  yapPauseCounts(): readonly number[] {
    return this.yapPauses;
  }

  /** Plan length in ticks: moves + pauses (the spec's "steps"). */
  yapSteps(): number {
    return this.yapCells.length - 1 + this.yapTotalPauses();
  }

  yapTotalPauses(): number {
    return this.yapPauses.reduce((sum, n) => sum + n, 0);
  }

  yapPausesLeft(): number {
    return this.yapLevel.maxPauses - this.yapTotalPauses();
  }

  /** True once the drawn path goes through the diamond. */
  yapHasLoot(): boolean {
    return this.yapIndexOf(this.yapLevel.loot) >= 0;
  }

  /** True once the exit is reached with the diamond: the drawing has ended. */
  yapIsFinished(): boolean {
    return this.yapFinished;
  }

  /** PLAY is enabled exactly when the drawing auto-finished at the exit. */
  yapCanPlay(): boolean {
    return this.yapFinished;
  }

  yapIsDrawing(): boolean {
    return this.yapGesture !== null && this.yapGesture.drawing;
  }

  /** The plan as moves/waits, ready for run() (src/core/sim.ts). */
  yapPlan(): YapMove[] {
    const plan: YapMove[] = [];
    for (let i = 0; i + 1 < this.yapCells.length; i += 1) {
      const from = this.yapCells[i];
      const to = this.yapCells[i + 1];
      if (from === undefined || to === undefined) break;
      const pauses = this.yapPauses[i] ?? 0;
      for (let k = 0; k < pauses; k += 1) plan.push('wait');
      plan.push(yapDirBetween(from, to));
    }
    return plan;
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  /**
   * The cell whose central zone (70%) contains the point, or null when the
   * point is in a border strip or outside the board: no stray jumps at cell
   * borders.
   */
  yapCellAtPoint(x: number, y: number): YapCell | null {
    const l = this.yapLayout;
    const cx = Math.floor((x - l.originX) / l.cell);
    const cy = Math.floor((y - l.originY) / l.cell);
    if (cx < 0 || cx >= this.yapLevel.width || cy < 0 || cy >= this.yapLevel.height) return null;
    const lx = x - l.originX - cx * l.cell;
    const ly = y - l.originY - cy * l.cell;
    const inset = (l.cell * (1 - YAP_CENTRAL_ZONE)) / 2;
    if (lx < inset || lx > l.cell - inset || ly < inset || ly > l.cell - inset) return null;
    return { x: cx, y: cy };
  }

  /** The cell under a point, ignoring the central zone (gesture starts). */
  private yapCellAtPointLoose(x: number, y: number): YapCell | null {
    const l = this.yapLayout;
    const cx = Math.floor((x - l.originX) / l.cell);
    const cy = Math.floor((y - l.originY) / l.cell);
    if (cx < 0 || cx >= this.yapLevel.width || cy < 0 || cy >= this.yapLevel.height) return null;
    return { x: cx, y: cy };
  }

  // -------------------------------------------------------------------------
  // Pointer input (positions in board pixels, time in ms — injected)
  // -------------------------------------------------------------------------

  yapPointerDown(x: number, y: number, now: number): void {
    if (this.yapFinished) return;
    const c = this.yapCellAtPointLoose(x, y);
    if (c === null) return;
    const idx = this.yapIndexOf(c);
    if (idx === this.yapCells.length - 1) {
      // drawing starts from the thief, or from the last cell to extend it
      this.yapGesture = {
        downX: x,
        downY: y,
        downTime: now,
        downCell: c,
        downIndex: idx,
        drawing: true,
      };
    } else if (idx >= 0) {
      // a press on another path cell: a tap pauses there, a drag cuts there
      this.yapGesture = {
        downX: x,
        downY: y,
        downTime: now,
        downCell: c,
        downIndex: idx,
        drawing: false,
      };
    }
    // otherwise the press is not on the path: nothing starts
  }

  yapPointerMove(x: number, y: number): void {
    const g = this.yapGesture;
    if (g === null || this.yapFinished) return;
    const target = this.yapCellAtPoint(x, y);
    if (target === null) return; // border strip: no stray jumps
    if (!g.drawing) {
      if (yapSameCell(target, g.downCell)) return;
      // touching another cell of the path cuts it there and continues from it
      if (g.downIndex >= 0 && g.downIndex < this.yapCells.length - 1) {
        this.yapTruncate(g.downIndex + 1);
      }
      g.drawing = true;
    }
    this.yapExtend(target);
    if (this.yapFinished) this.yapGesture = null; // the drawing has ended
  }

  yapPointerUp(x: number, y: number, now: number): void {
    const g = this.yapGesture;
    if (g === null) return;
    this.yapGesture = null;
    if (this.yapFinished) return;
    const dist = Math.hypot(x - g.downX, y - g.downY);
    const duration = now - g.downTime;
    const isTap = dist < YAP_TAP_MAX_DISTANCE && duration < YAP_TAP_MAX_DURATION;
    if (!g.drawing && isTap && g.downIndex >= 0 && g.downIndex < this.yapCells.length - 1) {
      this.yapTogglePause(g.downIndex);
    }
  }

  /** The Clear button: empties the whole path back to the thief. */
  yapClear(): void {
    this.yapCells = [{ x: this.yapLevel.start.x, y: this.yapLevel.start.y }];
    this.yapPauses = [0];
    this.yapFinished = false;
    this.yapGesture = null;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private yapIsWall(c: YapCell): boolean {
    if (c.x < 0 || c.x >= this.yapLevel.width || c.y < 0 || c.y >= this.yapLevel.height) {
      return true;
    }
    return this.yapLevel.map[c.y]?.charAt(c.x) === '#';
  }

  private yapIndexOf(c: YapCell): number {
    return this.yapCells.findIndex((p) => yapSameCell(p, c));
  }

  /** Keeps the first n cells (and their pauses). */
  private yapTruncate(n: number): void {
    this.yapCells.length = Math.min(n, this.yapCells.length);
    this.yapPauses.length = this.yapCells.length;
  }

  /** Appends a cell if it is floor and the step limit allows it. */
  private yapTryAdd(c: YapCell): boolean {
    if (this.yapIsWall(c)) return false;
    if (this.yapSteps() + 1 > this.yapMaxSteps) return false;
    this.yapCells.push({ x: c.x, y: c.y });
    this.yapPauses.push(0);
    if (this.yapHasLoot() && yapSameCell(c, this.yapLevel.exit)) {
      // the diamond is picked up and the exit is reached: the drawing ends
      this.yapFinished = true;
    }
    return true;
  }

  /** Extends the path towards `target` (already resolved, central zone). */
  private yapExtend(target: YapCell): void {
    const last = this.yapCells[this.yapCells.length - 1];
    if (last === undefined) return;
    if (yapSameCell(target, last)) return;
    // moving back onto the second-to-last cell erases the last one
    const prev = this.yapCells[this.yapCells.length - 2];
    if (prev !== undefined && yapSameCell(target, prev)) {
      this.yapCells.pop();
      this.yapPauses.pop();
      return;
    }
    // touching another cell of the path cuts it there
    const idx = this.yapIndexOf(target);
    if (idx >= 0) {
      this.yapTruncate(idx + 1);
      return;
    }
    // fast swipe: fill in cell by cell, in a straight line, up to the first wall
    let cur = last;
    while (!yapSameCell(cur, target)) {
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const step =
        Math.abs(dx) >= Math.abs(dy)
          ? { x: cur.x + Math.sign(dx), y: cur.y }
          : { x: cur.x, y: cur.y + Math.sign(dy) };
      if (step.x === cur.x && step.y === cur.y) break;
      if (this.yapIsWall(step)) break;
      const i = this.yapIndexOf(step);
      if (i >= 0) {
        this.yapTruncate(i + 1);
        break;
      }
      if (!this.yapTryAdd(step)) break;
      cur = step;
      if (this.yapFinished) break;
    }
  }

  /** Tap on a path cell: +1 pause, or back to zero once the maximum is reached. */
  private yapTogglePause(i: number): void {
    if (this.yapTotalPauses() >= this.yapLevel.maxPauses) {
      // the level's maximum is reached, in total: the cell goes back to zero
      if (this.yapPauses[i] !== undefined && this.yapPauses[i] > 0) this.yapPauses[i] = 0;
      return;
    }
    if (this.yapSteps() + 1 > this.yapMaxSteps) return;
    this.yapPauses[i] = (this.yapPauses[i] ?? 0) + 1;
  }
}

function yapSameCell(a: YapCell, b: YapCell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Orthogonal direction from one path cell to the next (they are adjacent). */
function yapDirBetween(from: YapCell, to: YapCell): YapMove {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  return 'N';
}
