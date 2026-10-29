// Board geometry, palette and threat-cell helpers for the level scene (C1).
//
// This module is pure and Phaser-free on purpose: the exact-cell rule of the
// acceptance criteria ("tinted cells are exactly those of visibleCells") is
// unit-testable in node. The Phaser drawing lives in ./render.ts, the scene in
// ./level-scene.ts.
import type { YapCell, YapDir, YapGuard, YapLevel } from '../core/level';
import { visibleCells, type YapSimState } from '../core/sim';

// ---------------------------------------------------------------------------
// Palette — the named tokens of docs/UI-DESIGN.md (light theme, Gate 1).
// ---------------------------------------------------------------------------

export const YAP_PALETTE = {
  'surface-page': '#F4F2ED',
  'surface-panel': '#FFFFFF',
  floor: '#D9D8D2',
  wall: '#47515B',
  'wall-detail': '#77818A',
  'grid-line': '#B7B8B3',
  'text-primary': '#202A33',
  'text-secondary': '#56616B',
  'action-primary': '#176B78',
  'action-secondary': '#E6E8E6',
  'danger-guard': '#D99B32',
  'danger-camera': '#8260A8',
  'danger-laser': '#C74747',
  'laser-off': '#69727B',
  'objective-diamond': '#00AFC2',
  'objective-exit': '#32865A',
  'path-light': '#FFFFFF',
  'path-outline': '#26313B',
} as const;

export type YapPaletteToken = keyof typeof YAP_PALETTE;

/** '#D99B32' -> 0xd99b32, for Phaser fillStyle/lineStyle. */
export function yapHexToInt(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

/** Cone fill opacity: "about 30%" per docs/UI-DESIGN.md. */
export const YAP_CONE_FILL_ALPHA = 0.3;
/** Danger overlays get the 2 px outline of docs/UI-DESIGN.md. */
export const YAP_DANGER_LINE_WIDTH = 2;

// ---------------------------------------------------------------------------
// Layout — the grid fills the space between the top and bottom bars.
// ---------------------------------------------------------------------------

/** Top bar height in px (level name, ticks/par, pauses) — docs/UI-DESIGN.md. */
export const YAP_TOP_BAR_HEIGHT = 64;
/** Bottom action bar height in px (Clear, PLAY, Hint) — docs/UI-DESIGN.md. */
export const YAP_BOTTOM_BAR_HEIGHT = 96;

export interface YapBoardLayout {
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Square cell size in px: the largest integer that fits both axes. */
  readonly cell: number;
  /** Pixel position of the top-left corner of cell (0, 0). */
  readonly originX: number;
  readonly originY: number;
  readonly boardWidth: number;
  readonly boardHeight: number;
}

/**
 * Largest square-cell layout that fits `gridWidth` x `gridHeight` cells between
 * a `topBar`-px top bar and a `bottomBar`-px bottom bar, centred horizontally
 * and vertically in the remaining space. Pure function of its arguments, so it
 * scales down to a 360 x 640 screen (40 px cells) as well as 480 x 853.
 */
export function yapComputeLayout(
  viewWidth: number,
  viewHeight: number,
  gridWidth: number,
  gridHeight: number,
  topBar: number = YAP_TOP_BAR_HEIGHT,
  bottomBar: number = YAP_BOTTOM_BAR_HEIGHT,
): YapBoardLayout {
  const availW = Math.max(1, viewWidth);
  const availH = Math.max(1, viewHeight - topBar - bottomBar);
  const cell = Math.max(1, Math.floor(Math.min(availW / gridWidth, availH / gridHeight)));
  const boardWidth = cell * gridWidth;
  const boardHeight = cell * gridHeight;
  return {
    viewWidth,
    viewHeight,
    cell,
    originX: Math.floor((viewWidth - boardWidth) / 2),
    originY: topBar + Math.floor((availH - boardHeight) / 2),
    boardWidth,
    boardHeight,
  };
}

export interface YapPoint {
  readonly x: number;
  readonly y: number;
}

export interface YapRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Top-left pixel rect of a cell. */
export function yapCellRect(layout: YapBoardLayout, cell: YapCell): YapRect {
  return {
    x: layout.originX + cell.x * layout.cell,
    y: layout.originY + cell.y * layout.cell,
    w: layout.cell,
    h: layout.cell,
  };
}

/** Centre pixel of a cell. */
export function yapCellCenter(layout: YapBoardLayout, cell: YapCell): YapPoint {
  const half = layout.cell / 2;
  return {
    x: layout.originX + cell.x * layout.cell + half,
    y: layout.originY + cell.y * layout.cell + half,
  };
}

// ---------------------------------------------------------------------------
// Vision cones — exactly the cells of visibleCells (src/core/sim.ts).
// ---------------------------------------------------------------------------

export interface YapConeSet {
  /** One entry per guard view, in the same order as state.guards. */
  readonly guards: readonly (readonly YapCell[])[];
  /** One entry per camera view, in the same order as state.cameras. */
  readonly cameras: readonly (readonly YapCell[])[];
}

/**
 * The cells to tint for the tick-0 state: for every guard and camera, exactly
 * `visibleCells(level, origin, facing, range)` — never a smooth or triangular
 * approximation (docs/UI-DESIGN.md, non-negotiable readability rules).
 */
export function yapConeCells(level: YapLevel, state: YapSimState): YapConeSet {
  return {
    guards: state.guards.map((g, i) => {
      const def = level.guards[i];
      return def === undefined ? g.seen : visibleCells(level, g.pos, g.facing, def.range);
    }),
    cameras: state.cameras.map((c, i) => {
      const def = level.cameras[i];
      return def === undefined ? c.seen : visibleCells(level, c.at, c.facing, def.range);
    }),
  };
}

// ---------------------------------------------------------------------------
// Patrols — dotted line through the route cells, with direction arrows.
// ---------------------------------------------------------------------------

/** Pixel centres of the patrol route, in route order. */
export function yapPatrolPoints(layout: YapBoardLayout, guard: YapGuard): YapPoint[] {
  return guard.route.map((c) => yapCellCenter(layout, c));
}

/** Unit vector of a facing, in grid coordinates (y grows downwards). */
export function yapDirVector(dir: YapDir): YapPoint {
  switch (dir) {
    case 'N':
      return { x: 0, y: -1 };
    case 'E':
      return { x: 1, y: 0 };
    case 'S':
      return { x: 0, y: 1 };
    case 'W':
      return { x: -1, y: 0 };
  }
}

// ---------------------------------------------------------------------------
// Lasers — the cells of the beam and whether it is on at this tick.
// ---------------------------------------------------------------------------

export interface YapLaserCells {
  readonly cells: readonly YapCell[];
  readonly active: boolean;
}

export function yapLaserCells(state: YapSimState): YapLaserCells[] {
  return state.lasers.map((l) => ({ cells: l.cells, active: l.active }));
}
