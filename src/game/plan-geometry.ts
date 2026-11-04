// The pure geometry of the plan-style board (plan style 3/6, spec §7):
// hatching clipped to wall cells, the seams between floor cells, the ink edge
// where floor meets wall, dashed lines, laser beams, the side the exit door
// opens on, where a camera sits on its wall cell, and how much of the route
// the thief has walked at a tick. Everything here is a function of a level, a
// layout (./board.ts) and numbers: render.ts draws with it, and the unit tests
// pin it, since Phaser drawing does not run in node.
import type { YapCell, YapDir, YapLevel } from '../core/level';
import type { YapPlan } from '../core/sim';
import {
  yapCellRect,
  yapDirVector,
  type YapBoardLayout,
  type YapPoint,
  type YapRect,
} from './board';

/** A straight line from (x1, y1) to (x2, y2), in CSS px. */
export interface YapSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The player's route: a 5.5 px marker line (spec §7). */
export const YAP_ROUTE_WIDTH = 5.5;
/** An active laser: a thin 2.5 px line, so it never reads as the route. */
export const YAP_LASER_WIDTH = 2.5;
/** Wall hatching: 45° ink lines every 7 px, 1.3 px wide. */
export const YAP_HATCH_SPACING = 7;
export const YAP_HATCH_WIDTH = 1.3;
/** The grid between floor cells: 0.8 px of ink-soft. */
export const YAP_SEAM_WIDTH = 0.8;
/** The ink edge wherever floor meets wall: 1.8 px. */
export const YAP_WALL_EDGE_WIDTH = 1.8;
/** During the playback, the part of the route not yet walked is at 30%. */
export const YAP_ROUTE_UNWALKED_ALPHA = 0.3;
/** The pencil treatment (ghost preview, hint) is drawn at 50%. */
export const YAP_PENCIL_ALPHA = 0.5;
/** The friend's plan: solid ink, 4 px, so it never looks like the player's. */
export const YAP_FRIEND_ROUTE_WIDTH = 4;
/** How far a camera's lens sits from its centre, toward its facing, in cells. */
const YAP_LENS_OFFSET = 0.18;

const isWall = (level: YapLevel, x: number, y: number): boolean =>
  (level.map[y]?.charAt(x) ?? '#') === '#';

/**
 * The 45° hatching of `rect`: the lines x + y = k · spacing of the board, so
 * the hatching runs on across neighbouring wall cells, each clipped to the
 * rect.
 */
export function yapHatchSegments(rect: YapRect, spacing: number): YapSegment[] {
  const segments: YapSegment[] = [];
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  for (let k = Math.floor((left + top) / spacing); k * spacing <= right + bottom; k += 1) {
    const c = k * spacing;
    const xFrom = Math.max(left, c - bottom);
    const xTo = Math.min(right, c - top);
    if (xTo - xFrom <= 1e-9) continue;
    segments.push({ x1: xFrom, y1: c - xFrom, x2: xTo, y2: c - xTo });
  }
  return segments;
}

/** The side that cell `a` shares with its east or south neighbour. */
function yapSharedSide(layout: YapBoardLayout, a: YapCell, dir: 'E' | 'S'): YapSegment {
  const r = yapCellRect(layout, a);
  return dir === 'E'
    ? { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h }
    : { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h };
}

/** One segment per side that two floor cells share: the plan's faint grid. */
export function yapFloorSeams(level: YapLevel, layout: YapBoardLayout): YapSegment[] {
  const seams: YapSegment[] = [];
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      if (isWall(level, x, y)) continue;
      if (x + 1 < level.width && !isWall(level, x + 1, y)) {
        seams.push(yapSharedSide(layout, { x, y }, 'E'));
      }
      if (y + 1 < level.height && !isWall(level, x, y + 1)) {
        seams.push(yapSharedSide(layout, { x, y }, 'S'));
      }
    }
  }
  return seams;
}

/** One segment per side that a floor cell shares with a wall cell: the ink edge. */
export function yapWallEdges(level: YapLevel, layout: YapBoardLayout): YapSegment[] {
  const edges: YapSegment[] = [];
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      if (isWall(level, x, y)) continue;
      const r = yapCellRect(layout, { x, y });
      if (isWall(level, x, y - 1)) edges.push({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y });
      if (isWall(level, x, y + 1)) {
        edges.push({ x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h });
      }
      if (isWall(level, x - 1, y)) edges.push({ x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h });
      if (isWall(level, x + 1, y)) {
        edges.push({ x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h });
      }
    }
  }
  return edges;
}

/** Dashes of `on` px every `on + off` px from `from` to `to`; the last is clipped. */
export function yapDashes(from: YapPoint, to: YapPoint, on: number, off: number): YapSegment[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0 || on <= 0) return [];
  const ux = dx / length;
  const uy = dy / length;
  const dashes: YapSegment[] = [];
  for (let d = 0; d < length; d += on + off) {
    const end = Math.min(d + on, length);
    dashes.push({
      x1: from.x + ux * d,
      y1: from.y + uy * d,
      x2: from.x + ux * end,
      y2: from.y + uy * end,
    });
  }
  return dashes;
}

/** A laser's beam: from the outer edge of its first cell to that of its last. */
export interface YapLaserBeam {
  readonly from: YapPoint;
  readonly to: YapPoint;
  readonly axis: 'h' | 'v';
}

/**
 * The beam through `cells`. A run of two or more cells sets the axis; one
 * cell is a gap in a wall, so the beam crosses it from wall to wall:
 * horizontal between walls on the left and the right, vertical between walls
 * above and below, horizontal otherwise.
 */
export function yapLaserBeam(
  level: YapLevel,
  layout: YapBoardLayout,
  cells: readonly YapCell[],
): YapLaserBeam {
  const first = cells[0] ?? { x: 0, y: 0 };
  let axis: 'h' | 'v';
  if (cells.length >= 2) {
    axis = cells.every((c) => c.y === first.y) ? 'h' : 'v';
  } else if (isWall(level, first.x - 1, first.y) && isWall(level, first.x + 1, first.y)) {
    axis = 'h';
  } else if (isWall(level, first.x, first.y - 1) && isWall(level, first.x, first.y + 1)) {
    axis = 'v';
  } else {
    axis = 'h';
  }
  const along = (c: YapCell): number => (axis === 'h' ? c.x : c.y);
  let lo = first;
  let hi = first;
  for (const c of cells) {
    if (along(c) < along(lo)) lo = c;
    if (along(c) > along(hi)) hi = c;
  }
  const a = yapCellRect(layout, lo);
  const b = yapCellRect(layout, hi);
  return axis === 'h'
    ? {
        from: { x: a.x, y: a.y + a.h / 2 },
        to: { x: b.x + b.w, y: b.y + b.h / 2 },
        axis,
      }
    : {
        from: { x: a.x + a.w / 2, y: a.y },
        to: { x: b.x + b.w / 2, y: b.y + b.h },
        axis,
      };
}

/** The side the exit door opens on: its first wall neighbour, E, S, W then N; S in the open. */
export function yapDoorSide(level: YapLevel, at: YapCell): YapDir {
  for (const dir of ['E', 'S', 'W', 'N'] as const) {
    const d = yapDirVector(dir);
    if (isWall(level, at.x + d.x, at.y + d.y)) return dir;
  }
  return 'S';
}

/** Side of a camera's box, in cells. */
export const YAP_CAMERA_BOX = 0.44;
/** Radius of a camera's lens dot, in cells. */
export const YAP_CAMERA_LENS = 0.09;

/** Where a camera is drawn: its box, the box's centre and its lens. */
export interface YapCameraAnchor {
  readonly box: YapRect;
  readonly centre: YapPoint;
  readonly lens: YapPoint;
}

/**
 * Where a camera sits on its wall cell. Inside the board, its box is centred
 * on the cell. On the border, the box is flush with the board's outer edge
 * and straddles the thin frame, so it stays on the plan sheet instead of
 * hanging off it (and off a narrow phone's edge). The lens sits 0.18 of a
 * cell toward where the camera faces, held inside the box.
 */
export function yapCameraAnchor(
  layout: YapBoardLayout,
  at: YapCell,
  facing: YapDir,
): YapCameraAnchor {
  const s = layout.cell * YAP_CAMERA_BOX;
  const r = yapCellRect(layout, at);
  const left = layout.originX;
  const top = layout.originY;
  const right = left + layout.boardWidth;
  const bottom = top + layout.boardHeight;
  const along = (start: number, size: number, lo: number, hi: number): number =>
    Math.min(Math.max(start + size / 2 - s / 2, lo), hi - s);
  const box: YapRect = {
    x: along(r.x, r.w, left, right),
    y: along(r.y, r.h, top, bottom),
    w: s,
    h: s,
  };
  const centre = { x: box.x + s / 2, y: box.y + s / 2 };
  const d = yapDirVector(facing);
  const reach = Math.min(layout.cell * YAP_LENS_OFFSET, s / 2 - layout.cell * YAP_CAMERA_LENS);
  return { box, centre, lens: { x: centre.x + d.x * reach, y: centre.y + d.y * reach } };
}

/**
 * How far along the route the thief stands after `tick` ticks of `plan`: the
 * number of moves among the first `tick`, waits excluded — the index, in the
 * drawn path, of the cell the thief is on.
 */
export function yapWalkedSteps(plan: YapPlan, tick: number): number {
  let steps = 0;
  for (const move of plan.slice(0, Math.max(0, tick))) if (move !== 'wait') steps += 1;
  return steps;
}
