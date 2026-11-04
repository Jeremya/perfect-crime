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
  // 3.2:1 against the floor: cell boundaries are gameplay (cones are exact
  // cells), so they must stay legible in daylight, not just decorative.
  'grid-line': '#6F767B',
  'text-primary': '#202A33',
  'text-secondary': '#56616B',
  'action-primary': '#176B78',
  'action-secondary': '#E6E8E6',
  'danger-guard': '#D99B32',
  'danger-camera': '#8260A8',
  'danger-laser': '#C74747',
  'laser-off': '#69727B',
  // 3.3:1 against the floor (the old #00AFC2 was 1.9:1: the objective read as
  // a pale smudge next to the exit).
  'objective-diamond': '#007F8D',
  'objective-exit': '#32865A',
  'path-light': '#FFFFFF',
  'path-outline': '#26313B',
  // -----------------------------------------------------------------------
  // Plan style tokens (docs/design/2026-10-30-plan-style-design.md §5), used by
  // kit.ts and every scene's chrome (C1 visual pass 3, the approved direction).
  // -----------------------------------------------------------------------
  /** Page background: `index.html` shell, `theme-color`, the body and the canvas clear colour. */
  'paper-page': '#F2EFE6',
  /** Floor, cards, secondary buttons and the light parts of tokens. */
  paper: '#FCFBF6',
  /** Text, outlines, wall edges and primary buttons. */
  ink: '#1E3A5F',
  /** Secondary text, at least 4.5:1 on paper and on the page. */
  'ink-muted': '#4E6480',
  /** Disabled primary button: ink at 28% over paper. */
  'ink-disabled': '#BEC5CC',
  // Plan style board tokens (spec §5 and §7, plan style 3/6): the board as an
  // architect's plan. The floor is `paper` and the wall edges are `ink`.
  /** Wall fill under the 45° ink hatching. */
  'hatch-ground': '#DDE4EE',
  /** The player's route and the pause badges: a red marker. */
  marker: '#D2403A',
  /** The caught state: the detector's cone, the fatal cell, the active laser. */
  stamp: '#C9302C',
  /** Guard cone tint (at YAP_GUARD_CONE_ALPHA). */
  'guard-cone': '#E8A030',
  /** Guard cone outline, 3:1 on paper. */
  'guard-cone-edge': '#C27A16',
  /** Camera cone tint (at YAP_CAMERA_CONE_ALPHA), its outline and the lens. */
  'camera-cone': '#7A54A8',
  /** Diamond outline and facets. */
  'diamond-edge': '#0E7C88',
  /** Diamond fill. */
  'diamond-fill': '#D3F0F2',
  /** The door symbol of the exit. */
  'exit-door': '#2E7D4F',
  /** Guard token fill. */
  'guard-token': '#F6DDAE',
  /** Guard token outline, its "G" and its facing wedge. */
  'guard-token-ink': '#8A5600',
  /** Thief token disc (with a paper mask band and ring). */
  'thief-token': '#1B1F24',
  /** Pencil treatment of the ghost preview and the hint. */
  graphite: '#5B6470',
  // Plan style screen tokens (spec §5, plan style 4/6).
  /** Home's folder of the day. */
  kraft: '#E4D4AE',
  /** The folder's edge and tab outline. */
  'kraft-edge': '#B99E66',
  /** Text on the folder (its tab). */
  'kraft-ink': '#5C4A24',
  /** Stars on the win report, Home and the archive. */
  star: '#B8860B',
} as const;

export type YapPaletteToken = keyof typeof YAP_PALETTE;

/**
 * `top` laid over `bottom` at opacity `alpha` (0..1), as an opaque #RRGGBB.
 * Drawing a faint line in its mixed colour avoids the darker spots where
 * translucent segments and joints overlap.
 */
export function yapMixHex(top: string, bottom: string, alpha: number): string {
  const channel = (hex: string, i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  const mixed = [1, 3, 5].map((i) =>
    Math.round(channel(top, i) * alpha + channel(bottom, i) * (1 - alpha))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${mixed.join('').toUpperCase()}`;
}

/** '#D99B32' -> 0xd99b32, for Phaser fillStyle/lineStyle. */
export function yapHexToInt(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

/** `ink-soft`: the grid between floor cells is ink at 16% (spec §5). */
export const YAP_INK_SOFT_ALPHA = 0.16;
/** Guard cone tint opacity (spec §5: rgba(232,160,48,.24)). */
export const YAP_GUARD_CONE_ALPHA = 0.24;
/** Camera cone tint opacity (spec §5: rgba(122,84,168,.18)). */
export const YAP_CAMERA_CONE_ALPHA = 0.18;
/** Cone outlines are crisp 1.5 px lines (spec §7). */
export const YAP_CONE_LINE_WIDTH = 1.5;

// ---------------------------------------------------------------------------
// Layout — the grid fills the space between the top and bottom bars.
// ---------------------------------------------------------------------------

/** Top bar height in px (level name, ticks/par, pauses) — docs/UI-DESIGN.md. */
export const YAP_TOP_BAR_HEIGHT = 64;
/** Registry key the consent scene publishes its note's height under (0 when gone). */
export const YAP_CONSENT_HEIGHT_KEY = 'yap-consent-height';

/**
 * The top band of the level scene while the first-launch consent note is up
 * (plan style 4/6, spec §8): the header moves down under the `note` px note,
 * so the note covers no board cell and the stats stay visible.
 */
export function yapConsentTopBar(note: number): number {
  return YAP_TOP_BAR_HEIGHT + Math.max(0, note);
}

/** Bottom action bar height in px (Clear, PLAY, Hint) — docs/UI-DESIGN.md. */
export const YAP_BOTTOM_BAR_HEIGHT = 96;
/**
 * Gap between the board and the page edge, in px: the page shows around the
 * plan sheet's double ink frame (plan style 3/6).
 */
export const YAP_BOARD_INSET = 6;

/**
 * Thickness in px of the border walls on the level board (spec §7, plan
 * style 3/6): the outer ring of walls renders as a thin frame and the
 * interior cells take the rest of the room.
 */
export const YAP_BOARD_FRAME = 10;

export interface YapBoardLayout {
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Size in px of an interior cell: the largest integer that fits both axes. */
  readonly cell: number;
  /**
   * Thickness in px of the border row and column, the thin wall frame; 0 when
   * every cell, border included, is `cell` wide (uniform cells).
   */
  readonly frame: number;
  /** Grid size in cells. */
  readonly columns: number;
  readonly rows: number;
  /** Pixel position of the top-left corner of cell (0, 0). */
  readonly originX: number;
  readonly originY: number;
  readonly boardWidth: number;
  readonly boardHeight: number;
}

/**
 * Largest square-cell layout that fits `gridWidth` x `gridHeight` cells between
 * a `topBar`-px top bar and a `bottomBar`-px bottom bar, centred horizontally
 * and vertically in the remaining space. With a `frame`, the border row and
 * column are `frame` px thick and the interior cells share the rest. Pure
 * function of its arguments.
 */
export function yapComputeLayout(
  viewWidth: number,
  viewHeight: number,
  gridWidth: number,
  gridHeight: number,
  topBar: number = YAP_TOP_BAR_HEIGHT,
  bottomBar: number = YAP_BOTTOM_BAR_HEIGHT,
  inset: number = YAP_BOARD_INSET,
  frame = 0,
): YapBoardLayout {
  const availW = Math.max(1, viewWidth - inset * 2);
  const availH = Math.max(1, viewHeight - topBar - bottomBar - inset * 2);
  // a frame needs an interior: a grid of 2 or fewer cells per axis stays uniform
  const thin = frame > 0 && gridWidth > 2 && gridHeight > 2 ? frame : 0;
  const innerW = thin > 0 ? gridWidth - 2 : gridWidth;
  const innerH = thin > 0 ? gridHeight - 2 : gridHeight;
  const cell = Math.max(
    1,
    Math.floor(Math.min((availW - 2 * thin) / innerW, (availH - 2 * thin) / innerH)),
  );
  const boardWidth = 2 * thin + cell * innerW;
  const boardHeight = 2 * thin + cell * innerH;
  return {
    viewWidth,
    viewHeight,
    cell,
    frame: thin,
    columns: gridWidth,
    rows: gridHeight,
    originX: Math.max(inset, Math.floor((viewWidth - boardWidth) / 2)),
    originY: topBar + inset + Math.max(0, Math.floor((availH - boardHeight) / 2)),
    boardWidth,
    boardHeight,
  };
}

/**
 * The frame `level` gets: `frame` when its outer ring of cells is all walls,
 * 0 (uniform cells) otherwise — a thin frame would squeeze a floor cell.
 */
export function yapBoardFrame(level: YapLevel, frame: number = YAP_BOARD_FRAME): number {
  const { width, height, map } = level;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (border && map[y]?.charAt(x) !== '#') return 0;
    }
  }
  return frame;
}

/**
 * The layout of `level` on a view: yapComputeLayout with the frame the level
 * gets (yapBoardFrame). Every board — the level scene, path input, the ghost,
 * the failure zoom, the viewer, the friend's plan, Home's mini-map and the e2e
 * strokes — takes its geometry from here (spec §7, one source of geometry).
 */
export function yapLevelLayout(
  viewWidth: number,
  viewHeight: number,
  level: YapLevel,
  topBar: number = YAP_TOP_BAR_HEIGHT,
  bottomBar: number = YAP_BOTTOM_BAR_HEIGHT,
  frame: number = YAP_BOARD_FRAME,
  inset: number = YAP_BOARD_INSET,
): YapBoardLayout {
  return yapComputeLayout(
    viewWidth,
    viewHeight,
    level.width,
    level.height,
    topBar,
    bottomBar,
    inset,
    yapBoardFrame(level, frame),
  );
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

/** Start and size in px of column (or row) `index` of `count`, from the board edge. */
function yapSpan(layout: YapBoardLayout, index: number, count: number): [number, number] {
  const { cell, frame } = layout;
  if (frame === 0) return [index * cell, cell];
  if (index <= 0) return [0, frame];
  if (index >= count - 1) return [frame + (count - 2) * cell, frame];
  return [frame + (index - 1) * cell, cell];
}

/** Index of the column (or row) at `offset` px from the board edge, or -1 outside. */
function yapIndexAt(layout: YapBoardLayout, offset: number, count: number, size: number): number {
  if (offset < 0 || offset >= size) return -1;
  const { cell, frame } = layout;
  if (frame === 0) return Math.min(count - 1, Math.floor(offset / cell));
  if (offset < frame) return 0;
  if (offset >= size - frame) return count - 1;
  return Math.min(count - 2, 1 + Math.floor((offset - frame) / cell));
}

/** Top-left pixel rect of a cell. */
export function yapCellRect(layout: YapBoardLayout, cell: YapCell): YapRect {
  const [x, w] = yapSpan(layout, cell.x, layout.columns);
  const [y, h] = yapSpan(layout, cell.y, layout.rows);
  return { x: layout.originX + x, y: layout.originY + y, w, h };
}

/** Centre pixel of a cell. */
export function yapCellCenter(layout: YapBoardLayout, cell: YapCell): YapPoint {
  const r = yapCellRect(layout, cell);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The cell under the pixel (`px`, `py`), the inverse of yapCellRect; null off the board. */
export function yapCellAt(layout: YapBoardLayout, px: number, py: number): YapCell | null {
  const x = yapIndexAt(layout, px - layout.originX, layout.columns, layout.boardWidth);
  const y = yapIndexAt(layout, py - layout.originY, layout.rows, layout.boardHeight);
  if (x < 0 || y < 0) return null;
  return { x, y };
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

// ---------------------------------------------------------------------------
// Fitting rows in a band (Home archive, story O1)
// ---------------------------------------------------------------------------

export interface YapRowMetrics {
  /** Row height in px, between `min` and `max`. */
  readonly height: number;
  /** Gap between two rows, in px. */
  readonly gap: number;
  /** Total height of `count` rows and their gaps. */
  readonly total: number;
}

/**
 * Largest row height (with a comfortable gap) that fits `count` rows in
 * `available` px, down to `min`. The archive can hold the whole week, so on a
 * 360 × 640 screen the rows shrink instead of running over the actions.
 */
export function yapFitRows(
  available: number,
  count: number,
  min = 44,
  max = 64,
): YapRowMetrics {
  if (count <= 0) return { height: 0, gap: 0, total: 0 };
  for (let height = max; height >= min; height -= 1) {
    const gap = height >= 56 ? 8 : 4;
    const total = count * height + (count - 1) * gap;
    if (total <= available) return { height, gap, total };
  }
  // Even the minimum does not fit: return it anyway, the caller can scroll.
  const gap = 2;
  return { height: min, gap, total: count * min + (count - 1) * gap };
}
