// Phaser drawing for the level board (story C1) — every game element is drawn
// in code with simple vector shapes (Gate 1 spec: "Simple vector shapes: no
// illustrations at gate 1"). The static grid is baked once into a texture by
// the scene; cones, patrols, lasers and entities are redrawn per state.
//
// Readability rules from docs/UI-DESIGN.md: vision cones are the exact cells of
// visibleCells (tinted ~30% + crisp 2 px outline, never smooth or color-only),
// patrols are thin dotted lines with direction arrows, lasers are solid red
// when active and gray dashed when off.
import Phaser from 'phaser';
import type { YapCell, YapDir, YapGuard, YapLevel } from '../core/level';
import {
  YAP_CONE_FILL_ALPHA,
  YAP_DANGER_LINE_WIDTH,
  YAP_INK_SOFT_ALPHA,
  YAP_PALETTE,
  yapCellCenter,
  yapCellRect,
  yapDirVector,
  yapHexToInt,
  yapLevelLayout,
  type YapBoardLayout,
  type YapPaletteToken,
} from './board';
import {
  YAP_HATCH_SPACING,
  YAP_HATCH_WIDTH,
  YAP_SEAM_WIDTH,
  YAP_WALL_EDGE_WIDTH,
  yapDashes,
  yapFloorSeams,
  yapHatchSegments,
  yapWallEdges,
  type YapSegment,
} from './plan-geometry';

/** Patrols are ink at 55% (spec §7). */
const YAP_PATROL_ALPHA = 0.55;

function color(token: YapPaletteToken): number {
  return yapHexToInt(YAP_PALETTE[token]);
}

// ---------------------------------------------------------------------------
// Static grid (baked once into a texture by the scene)
// ---------------------------------------------------------------------------

/**
 * The plan sheet (spec §7, plan style 3/6): paper floor; walls in
 * hatch-ground with 45° ink hatching clipped to each wall cell; a faint
 * ink-soft grid between floor cells only; and an ink edge wherever floor meets
 * wall. Draw with a layout whose origin is (0, 0) so the result can be baked
 * into a board-sized texture.
 */
export function yapDrawStaticGrid(
  g: Phaser.GameObjects.Graphics,
  level: YapLevel,
  layout: YapBoardLayout,
): void {
  const ink = color('ink');
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const rect = yapCellRect(layout, { x, y });
      const wall = (level.map[y]?.charAt(x) ?? '#') === '#';
      g.fillStyle(color(wall ? 'hatch-ground' : 'paper'), 1).fillRect(
        rect.x,
        rect.y,
        rect.w,
        rect.h,
      );
      if (!wall) continue;
      g.lineStyle(YAP_HATCH_WIDTH, ink, 1);
      for (const s of yapHatchSegments(rect, YAP_HATCH_SPACING)) yapStroke(g, s);
    }
  }
  g.lineStyle(YAP_SEAM_WIDTH, ink, YAP_INK_SOFT_ALPHA);
  for (const s of yapFloorSeams(level, layout)) yapStroke(g, s);
  g.lineStyle(YAP_WALL_EDGE_WIDTH, ink, 1);
  for (const s of yapWallEdges(level, layout)) yapStroke(g, s);
}

/**
 * The double ink frame of the plan sheet (spec §7): a 2 px line on the board's
 * edge and a 0.8 px line 3 px inside it. No shadow, no rounded corners.
 */
export function yapDrawBoardFrame(g: Phaser.GameObjects.Graphics, layout: YapBoardLayout): void {
  const ink = color('ink');
  const { originX: x, originY: y, boardWidth: w, boardHeight: h } = layout;
  g.lineStyle(2, ink, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.lineStyle(0.8, ink, 1).strokeRect(x + 3.4, y + 3.4, w - 6.8, h - 6.8);
}

/** One segment, stroked with the Graphics' current line style. */
function yapStroke(g: Phaser.GameObjects.Graphics, s: YapSegment): void {
  g.lineBetween(s.x1, s.y1, s.x2, s.y2);
}

// ---------------------------------------------------------------------------
// Vision cones — exact cells, tinted + outlined (never color-only)
// ---------------------------------------------------------------------------

/** Tint each cell at ~30% and stroke a crisp 2 px outline around each cell. */
export function yapDrawCone(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  cells: readonly YapCell[],
  token: YapPaletteToken,
): void {
  const c = color(token);
  for (const cell of cells) {
    const rect = yapCellRect(layout, cell);
    g.fillStyle(c, YAP_CONE_FILL_ALPHA).fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  g.lineStyle(YAP_DANGER_LINE_WIDTH, c, 1);
  for (const cell of cells) {
    const rect = yapCellRect(layout, cell);
    g.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  }
}

// ---------------------------------------------------------------------------
// Patrols — thin dotted line with small direction arrows (secondary to cones)
// ---------------------------------------------------------------------------

/**
 * A guard's patrol (spec §7): an ink dashed line (4/4) at 55% along its route,
 * with a small ink arrowhead at the middle of each segment — always secondary
 * to the cones and the route.
 */
export function yapDrawPatrol(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  guard: YapGuard,
): void {
  const pts = guard.route.map((c) => yapCellCenter(layout, c));
  const ink = color('ink');
  g.lineStyle(1.5, ink, YAP_PATROL_ALPHA);
  g.fillStyle(ink, YAP_PATROL_ALPHA);
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue; // repeated cell = a wait, no segment to draw
    for (const s of yapDashes(a, b, 4, 4)) yapStroke(g, s);
    // direction arrowhead at the middle of the segment
    const ux = dx / len;
    const uy = dy / len;
    const mx = a.x + ux * len * 0.5;
    const my = a.y + uy * len * 0.5;
    const size = Math.max(3, layout.cell * 0.09);
    g.fillTriangle(
      mx + ux * size,
      my + uy * size,
      mx - ux * size * 0.6 - uy * size * 0.7,
      my - uy * size * 0.6 + ux * size * 0.7,
      mx - ux * size * 0.6 + uy * size * 0.7,
      my - uy * size * 0.6 - ux * size * 0.7,
    );
  }
}

// ---------------------------------------------------------------------------
// Lasers — solid red while active, gray dashed while off; on/off tick at the emitter
// ---------------------------------------------------------------------------

export function yapDrawLaser(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  cells: readonly YapCell[],
  active: boolean,
): void {
  const pts = cells.map((c) => yapCellCenter(layout, c));
  const first = pts[0];
  if (first === undefined) return;
  if (active) {
    const red = color('danger-laser');
    for (const cell of cells) {
      const rect = yapCellRect(layout, cell);
      g.fillStyle(red, 0.22).fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    g.lineStyle(Math.max(2, layout.cell * 0.1), red, 1);
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a === undefined || b === undefined) continue;
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.lineStyle(YAP_DANGER_LINE_WIDTH, red, 1);
    for (const cell of cells) {
      const rect = yapCellRect(layout, cell);
      g.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    }
  } else {
    const gray = color('laser-off');
    g.lineStyle(1, gray, 0.9);
    for (const cell of cells) {
      const rect = yapCellRect(layout, cell);
      g.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    }
    // dashed beam: dots along the centre line
    g.fillStyle(gray, 0.9);
    const dotR = Math.max(1.5, layout.cell * 0.06);
    const step = Math.max(4, layout.cell * 0.24);
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      for (let d = step / 2; d < len; d += step) {
        g.fillCircle(a.x + (dx / len) * d, a.y + (dy / len) * d, dotR);
      }
    }
  }
  // cycle tick at the emitter cell: filled square = on, hollow = off
  const rect = yapCellRect(layout, cells[0] ?? { x: 0, y: 0 });
  const t = Math.max(3, Math.floor(layout.cell * 0.16));
  const tx = rect.x + rect.w - t - 2;
  const ty = rect.y + 2;
  if (active) {
    g.fillStyle(color('danger-laser'), 1).fillRect(tx, ty, t, t);
  } else {
    g.lineStyle(1, color('laser-off'), 1).strokeRect(tx + 0.5, ty + 0.5, t - 1, t - 1);
  }
}

// ---------------------------------------------------------------------------
// Entities — code-drawn stand-ins (no weapon, no illustration at Gate 1)
// ---------------------------------------------------------------------------

/** Thief: light-edged disc under the Kenney silhouette for cone contrast. */
export function yapDrawThief(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  const r = layout.cell * 0.3;
  // ground shadow: the character reads as standing on the floor, not pasted on
  g.fillStyle(color('path-outline'), 0.16).fillEllipse(
    p.x,
    p.y + layout.cell * 0.24,
    r * 2.1,
    r * 0.8,
  );
  g.fillStyle(color('path-light'), 1).fillCircle(p.x, p.y, r);
  g.lineStyle(2, color('text-primary'), 1).strokeCircle(p.x, p.y, r);
}

/** Guard: amber square (shape differs from the thief) with a facing wedge. */
export function yapDrawGuard(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
  facing: YapDir,
): void {
  const p = yapCellCenter(layout, at);
  const s = layout.cell * 0.58;
  g.fillStyle(color('danger-guard'), 1).fillRect(p.x - s / 2, p.y - s / 2, s, s);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('text-primary'), 1).strokeRect(
    p.x - s / 2,
    p.y - s / 2,
    s,
    s,
  );
  // facing wedge from the centre towards the facing direction
  const d = yapDirVector(facing);
  const len = layout.cell * 0.42;
  const w = layout.cell * 0.2;
  const px = -d.y;
  const py = d.x;
  g.fillStyle(color('text-primary'), 1).fillTriangle(
    p.x + d.x * len,
    p.y + d.y * len,
    p.x - d.x * len * 0.3 + px * w,
    p.y - d.y * len * 0.3 + py * w,
    p.x - d.x * len * 0.3 - px * w,
    p.y - d.y * len * 0.3 - py * w,
  );
}

/** Camera: violet body mounted on its wall cell, with a lens ring and a facing nub. */
export function yapDrawCamera(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
  facing: YapDir,
): void {
  const p = yapCellCenter(layout, at);
  const s = layout.cell * 0.54;
  const d = yapDirVector(facing);
  // wall foot, on the side the camera looks away from
  g.fillStyle(color('text-primary'), 1).fillCircle(
    p.x - d.x * s * 0.62,
    p.y - d.y * s * 0.62,
    Math.max(1.5, s * 0.1),
  );
  g.fillStyle(color('danger-camera'), 1).fillRoundedRect(
    p.x - s / 2,
    p.y - s / 2,
    s,
    s,
    Math.max(2, s * 0.24),
  );
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('path-outline'), 1).strokeRoundedRect(
    p.x - s / 2,
    p.y - s / 2,
    s,
    s,
    Math.max(2, s * 0.24),
  );
  // lens ring on the facing edge: the camera visibly points somewhere
  const lx = p.x + d.x * s * 0.3;
  const ly = p.y + d.y * s * 0.3;
  g.fillStyle(color('path-light'), 1).fillCircle(lx, ly, s * 0.27);
  g.fillStyle(color('path-outline'), 1).fillCircle(lx, ly, Math.max(1.5, s * 0.13));
}

/** Diamond: cyan lozenge with a lit facet, clearly apart from the floor. */
export function yapDrawDiamond(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  const r = layout.cell * 0.27;
  const pts = [
    new Phaser.Math.Vector2(p.x, p.y - r),
    new Phaser.Math.Vector2(p.x + r, p.y),
    new Phaser.Math.Vector2(p.x, p.y + r),
    new Phaser.Math.Vector2(p.x - r, p.y),
  ];
  // a soft ground shadow lifts the gem off the floor
  g.fillStyle(color('path-outline'), 0.14).fillEllipse(p.x, p.y + r * 0.85, r * 1.7, r * 0.6);
  g.fillStyle(color('objective-diamond'), 1).fillPoints(pts, true);
  // one lit facet: the jewel reads as cut, not as a flat lozenge
  g.fillStyle(color('path-light'), 0.55).fillTriangle(p.x, p.y - r, p.x, p.y, p.x - r * 0.62, p.y);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('path-outline'), 1).strokePoints(pts, true);
}

/** Exit: a green door with a frame, a lit panel and a handle. */
export function yapDrawExit(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const rect = yapCellRect(layout, at);
  const inset = Math.max(2, Math.floor(layout.cell * 0.15));
  const x = rect.x + inset;
  const y = rect.y + inset;
  const w = rect.w - inset * 2;
  const h = rect.h - inset * 2;
  const radius = Math.max(2, Math.floor(layout.cell * 0.1));
  // frame + panel
  g.fillStyle(color('objective-exit'), 1).fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('path-outline'), 1).strokeRoundedRect(
    x,
    y,
    w,
    h,
    radius,
  );
  const pi = Math.max(2, Math.floor(layout.cell * 0.08));
  g.fillStyle(color('path-light'), 0.16).fillRoundedRect(
    x + pi,
    y + pi,
    w - pi * 2,
    h - pi * 2,
    Math.max(1, radius - 1),
  );
  // handle on the opening side
  g.fillStyle(color('path-light'), 1).fillCircle(
    x + w * 0.72,
    y + h * 0.55,
    Math.max(1.5, layout.cell * 0.045),
  );
  // threshold: the door sits in the floor, not on it
  g.fillStyle(color('path-outline'), 0.45).fillRect(x + w * 0.18, y + h - 2, w * 0.64, 2);
}

/** Start cell marker (under the thief): a small neutral ring. */
export function yapDrawStart(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  g.lineStyle(1, color('text-secondary'), 0.8).strokeCircle(p.x, p.y, layout.cell * 0.42);
}

/** Thickness of the thin wall frame on Home's mini-map, in px. */
const YAP_MINI_MAP_FRAME = 4;

/**
 * Spoiler-free thumbnail of a heist (Home, story D2 pass 2), as a small plan
 * sheet (plan style 3/6): the static grid, the start, the diamond, the exit
 * and the double frame — never a route, a guard cone or a threat. The board
 * is centred in the `width` × `height` box at (`x`, `y`). Returns false, and
 * draws nothing, when the box is too small for a readable map.
 */
export function yapDrawMiniMap(
  g: Phaser.GameObjects.Graphics,
  level: YapLevel,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const fitted = yapLevelLayout(width, height, level, 0, 0, YAP_MINI_MAP_FRAME, 0);
  if (fitted.cell < 6) return false;
  const layout: YapBoardLayout = {
    ...fitted,
    originX: Math.round(x + fitted.originX),
    originY: Math.round(y + fitted.originY),
  };
  yapDrawStaticGrid(g, level, layout);
  yapDrawStart(g, layout, level.start);
  yapDrawDiamond(g, layout, level.loot);
  yapDrawExit(g, layout, level.exit);
  yapDrawBoardFrame(g, layout);
  return true;
}
