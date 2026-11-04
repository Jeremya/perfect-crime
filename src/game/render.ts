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
  YAP_CAMERA_CONE_ALPHA,
  YAP_CONE_LINE_WIDTH,
  YAP_GUARD_CONE_ALPHA,
  YAP_INK_SOFT_ALPHA,
  YAP_PALETTE,
  yapCellCenter,
  yapCellRect,
  yapDirVector,
  yapHexToInt,
  yapLevelLayout,
  yapMixHex,
  type YapBoardLayout,
  type YapPaletteToken,
  type YapPoint,
} from './board';
import {
  YAP_CAMERA_LENS,
  YAP_HATCH_SPACING,
  YAP_HATCH_WIDTH,
  YAP_LASER_WIDTH,
  YAP_ROUTE_UNWALKED_ALPHA,
  YAP_SEAM_WIDTH,
  YAP_WALL_EDGE_WIDTH,
  yapCameraAnchor,
  yapDashes,
  yapDoorSide,
  yapFloorSeams,
  yapHatchSegments,
  yapLaserBeam,
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
// Looks: ink (the board) or pencil (the C6 ghost preview, graphite, dashed)
// ---------------------------------------------------------------------------

/**
 * How a threat is drawn: in ink, or in pencil for the ghost preview (spec
 * §7: graphite, dashed outlines; the caller sets the layer to
 * YAP_PENCIL_ALPHA).
 */
export type YapLook = 'ink' | 'pencil';

/** Dash and gap of a pencil outline, in px. */
const YAP_PENCIL_DASH = 3;

/** The colour of `token`, or graphite in pencil. */
function inLook(look: YapLook, token: YapPaletteToken): number {
  return color(look === 'pencil' ? 'graphite' : token);
}

/** A rect outline with the current line style: solid in ink, dashed in pencil. */
function yapOutlineRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  look: YapLook,
): void {
  if (look === 'ink') {
    g.strokeRect(x, y, w, h);
    return;
  }
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    if (a === undefined || b === undefined) continue;
    for (const s of yapDashes(a, b, YAP_PENCIL_DASH, YAP_PENCIL_DASH)) yapStroke(g, s);
  }
}

/** A circle outline with the current line style: solid, or dashed arcs of about `dash` px. */
function yapOutlineCircle(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  dash: number | null,
): void {
  if (dash === null) {
    g.strokeCircle(cx, cy, r);
    return;
  }
  const count = Math.max(4, Math.floor((2 * Math.PI * r) / (2 * dash)));
  const step = (2 * Math.PI) / count;
  for (let i = 0; i < count; i += 1) {
    g.beginPath();
    g.arc(cx, cy, r, i * step, i * step + step / 2);
    g.strokePath();
  }
}

// ---------------------------------------------------------------------------
// Vision cones — exact cells, tinted + outlined (never color-only)
// ---------------------------------------------------------------------------

/** The tint, its opacity and the outline of each kind of cone (spec §5, §7). */
const YAP_CONE_LOOKS = {
  guard: { tint: 'guard-cone', alpha: YAP_GUARD_CONE_ALPHA, edge: 'guard-cone-edge' },
  camera: { tint: 'camera-cone', alpha: YAP_CAMERA_CONE_ALPHA, edge: 'camera-cone' },
  // the caught state: the detector's cone turns stamp red (failure)
  stamp: { tint: 'stamp', alpha: YAP_GUARD_CONE_ALPHA, edge: 'stamp' },
} as const satisfies Record<
  string,
  { tint: YapPaletteToken; alpha: number; edge: YapPaletteToken }
>;

/**
 * A cone: exactly `cells` (visibleCells), each tinted and outlined with a
 * crisp 1.5 px line inside its rect. In pencil, a light graphite tint and a
 * dashed graphite outline.
 */
export function yapDrawCone(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  cells: readonly YapCell[],
  kind: keyof typeof YAP_CONE_LOOKS,
  look: YapLook = 'ink',
): void {
  const { tint, alpha, edge } = YAP_CONE_LOOKS[kind];
  for (const cell of cells) {
    const rect = yapCellRect(layout, cell);
    g.fillStyle(inLook(look, tint), look === 'pencil' ? 0.12 : alpha).fillRect(
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
  }
  const inset = YAP_CONE_LINE_WIDTH / 2;
  g.lineStyle(YAP_CONE_LINE_WIDTH, inLook(look, edge), 1);
  for (const cell of cells) {
    const rect = yapCellRect(layout, cell);
    yapOutlineRect(g, rect.x + inset, rect.y + inset, rect.w - 2 * inset, rect.h - 2 * inset, look);
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
// Lasers — a thin stamp-red beam with emitter nubs while active, a dashed
// laser-off line while off; the on/off tick at the emitter stays
// ---------------------------------------------------------------------------

export function yapDrawLaser(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  level: YapLevel,
  cells: readonly YapCell[],
  active: boolean,
  look: YapLook = 'ink',
): void {
  const first = cells[0];
  if (first === undefined) return;
  const beam = yapLaserBeam(level, layout, cells);
  if (active) {
    const red = inLook(look, 'stamp');
    // a faint red tint on its cells: the beam owns them
    for (const cell of cells) {
      const rect = yapCellRect(layout, cell);
      g.fillStyle(red, 0.12).fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    g.lineStyle(YAP_LASER_WIDTH, red, 1).lineBetween(
      beam.from.x,
      beam.from.y,
      beam.to.x,
      beam.to.y,
    );
    // emitter nubs at both ends: a laser has them, the route never does
    const nub = Math.max(4, layout.cell * 0.12);
    g.fillStyle(red, 1);
    for (const end of [beam.from, beam.to]) g.fillRect(end.x - nub / 2, end.y - nub / 2, nub, nub);
  } else {
    g.lineStyle(1.5, inLook(look, 'laser-off'), 1);
    for (const s of yapDashes(beam.from, beam.to, 4, 4)) yapStroke(g, s);
  }
  // cycle tick at the emitter cell: filled square = on, hollow = off
  const rect = yapCellRect(layout, first);
  const t = Math.max(3, Math.floor(layout.cell * 0.12));
  const tx = rect.x + rect.w - t - 2;
  const ty = rect.y + 2;
  if (active) {
    g.fillStyle(inLook(look, 'stamp'), 1).fillRect(tx, ty, t, t);
  } else {
    g.lineStyle(1, inLook(look, 'laser-off'), 1).strokeRect(tx + 0.5, ty + 0.5, t - 1, t - 1);
  }
}

// ---------------------------------------------------------------------------
// Entities — tokens drawn in code (spec §7): no sprite, no illustration
// ---------------------------------------------------------------------------

/**
 * The thief: a thief-token disc with a paper mask band and two eye dots, and
 * a 2.5 px paper ring so it stays visible over any cone.
 */
export function yapDrawThief(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  const r = layout.cell * 0.3;
  const dark = color('thief-token');
  g.fillStyle(dark, 1).fillCircle(p.x, p.y, r);
  g.lineStyle(2.5, color('paper'), 1).strokeCircle(p.x, p.y, r + 1.25);
  // the mask band across the upper third, inside the disc, and the eyes on it
  g.fillStyle(color('paper'), 1).fillRect(p.x - r * 0.85, p.y - r * 0.42, r * 1.7, r * 0.34);
  g.fillStyle(dark, 1)
    .fillCircle(p.x - r * 0.35, p.y - r * 0.25, Math.max(1, r * 0.1))
    .fillCircle(p.x + r * 0.35, p.y - r * 0.25, Math.max(1, r * 0.1));
}

/**
 * A guard: a guard-token disc (radius 0.28 cell) with a "G" drawn in strokes
 * and a filled facing wedge just outside the circle, all in guard-token-ink.
 * In pencil: a dashed graphite outline, the "G" and the wedge in graphite.
 */
export function yapDrawGuard(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
  facing: YapDir,
  look: YapLook = 'ink',
): void {
  const p = yapCellCenter(layout, at);
  const r = layout.cell * 0.28;
  const inkC = inLook(look, 'guard-token-ink');
  if (look === 'ink') g.fillStyle(color('guard-token'), 1).fillCircle(p.x, p.y, r);
  g.lineStyle(1.5, inkC, 1);
  yapOutlineCircle(g, p.x, p.y, r, look === 'pencil' ? YAP_PENCIL_DASH : null);
  // the "G": an open arc over the top, the left and the bottom, ending at the
  // middle of the right side, and a bar from there toward the centre
  const gr = r * 0.52;
  g.lineStyle(Math.max(1.5, layout.cell * 0.05), inkC, 1);
  g.beginPath();
  g.arc(p.x, p.y, gr, -Math.PI / 4, 0, true);
  g.strokePath();
  g.lineBetween(p.x + gr, p.y, p.x + gr * 0.2, p.y);
  // the facing wedge, its base just outside the circle
  const d = yapDirVector(facing);
  const base = r + layout.cell * 0.06;
  const tip = layout.cell * 0.46;
  const half = layout.cell * 0.1;
  g.fillStyle(inkC, 1).fillTriangle(
    p.x + d.x * tip,
    p.y + d.y * tip,
    p.x + d.x * base - d.y * half,
    p.y + d.y * base + d.x * half,
    p.x + d.x * base + d.y * half,
    p.y + d.y * base - d.x * half,
  );
}

/**
 * A camera: a paper box with an ink outline on its wall cell — straddling the
 * thin frame, flush with the board's edge, for a border camera — and a violet lens dot on the side it faces
 * (yapCameraAnchor). In pencil: a dashed graphite box and a graphite lens.
 */
export function yapDrawCamera(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
  facing: YapDir,
  look: YapLook = 'ink',
): void {
  const { box, lens } = yapCameraAnchor(layout, at, facing);
  if (look === 'ink') g.fillStyle(color('paper'), 1).fillRect(box.x, box.y, box.w, box.h);
  g.lineStyle(1.5, inLook(look, 'ink'), 1);
  yapOutlineRect(g, box.x, box.y, box.w, box.h, look);
  g.fillStyle(inLook(look, 'camera-cone'), 1).fillCircle(
    lens.x,
    lens.y,
    layout.cell * YAP_CAMERA_LENS,
  );
}

/** The diamond: an outlined gem with its girdle and two facet lines. */
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
  const edge = color('diamond-edge');
  g.fillStyle(color('diamond-fill'), 1).fillPoints(pts, true);
  g.lineStyle(1.5, edge, 1).strokePoints(pts, true);
  // the girdle across the upper part, and two facets down to the culet
  const gy = p.y - r * 0.3;
  g.lineStyle(1, edge, 1)
    .lineBetween(p.x - r * 0.7, gy, p.x + r * 0.7, gy)
    .lineBetween(p.x - r * 0.3, gy, p.x, p.y + r)
    .lineBetween(p.x + r * 0.3, gy, p.x, p.y + r);
}

/**
 * The exit: an architectural door symbol on the wall side of the cell
 * (yapDoorSide) — a dashed threshold along that edge, the leaf drawn open
 * into the room from the hinge, and its quarter-circle swing.
 */
export function yapDrawExit(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  level: YapLevel,
  at: YapCell,
): void {
  const rect = yapCellRect(layout, at);
  const side = yapDoorSide(level, at);
  const d = yapDirVector(side);
  // the edge on that side, and the direction along it
  const start =
    side === 'E'
      ? { x: rect.x + rect.w, y: rect.y }
      : side === 'S'
        ? { x: rect.x, y: rect.y + rect.h }
        : { x: rect.x, y: rect.y };
  const along = side === 'E' || side === 'W' ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const into = { x: -d.x, y: -d.y };
  const span = side === 'E' || side === 'W' ? rect.h : rect.w;
  // a door about half the cell, toward the far corner (as in the mockups)
  const margin = span * 0.4;
  const leaf = span * 0.55;
  const hinge = { x: start.x + along.x * margin, y: start.y + along.y * margin };
  const shut = { x: hinge.x + along.x * leaf, y: hinge.y + along.y * leaf };
  const open = { x: hinge.x + into.x * leaf, y: hinge.y + into.y * leaf };
  const green = color('exit-door');
  // the swing: a quarter circle around the hinge, from the open leaf to the
  // frame, lightly tinted so the objective reads at a glance
  const a0 = Math.atan2(into.y, into.x);
  const a1 = Math.atan2(along.y, along.x);
  const turn = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
  g.fillStyle(green, 0.12)
    .slice(hinge.x, hinge.y, leaf, a0, a1, turn < 0)
    .fillPath();
  g.lineStyle(1.5, green, 1);
  g.beginPath();
  g.arc(hinge.x, hinge.y, leaf, a0, a1, turn < 0);
  g.strokePath();
  for (const s of yapDashes(hinge, shut, 3, 3)) yapStroke(g, s);
  g.lineStyle(2.5, green, 1).lineBetween(hinge.x, hinge.y, open.x, open.y);
}

/** Start cell marker (under the thief): a thin dashed ink-muted ring. */
export function yapDrawStart(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  g.lineStyle(1, color('ink-muted'), 1);
  yapOutlineCircle(g, p.x, p.y, layout.cell * 0.42, 3);
}

// ---------------------------------------------------------------------------
// Route and pause badges
// ---------------------------------------------------------------------------

/**
 * A route through the centres of `cells`: a `width` px line in `token` with
 * round caps and joins (a disc at every vertex). With `walked` set (during
 * the playback), the part up to cell `walked` is solid and the rest is at
 * YAP_ROUTE_UNWALKED_ALPHA.
 */
export function yapDrawRoute(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  cells: readonly YapCell[],
  width: number,
  token: YapPaletteToken,
  walked?: number,
): void {
  const pts = cells.map((c) => yapCellCenter(layout, c));
  if (pts.length < 2) return;
  const solid = color(token);
  // the faint part in its colour mixed over paper, opaque: translucent
  // segments and joints would darken where they overlap
  const faint = yapHexToInt(
    yapMixHex(YAP_PALETTE[token], YAP_PALETTE.paper, YAP_ROUTE_UNWALKED_ALPHA),
  );
  const colourOf = (index: number): number =>
    walked === undefined || index < walked ? solid : faint;
  // faint first, so the walked part and the joint at the thief sit on top
  for (const pass of [faint, solid]) {
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a === undefined || b === undefined || colourOf(i) !== pass) continue;
      g.lineStyle(width, pass, 1).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(pass, 1)
        .fillCircle(a.x, a.y, width / 2)
        .fillCircle(b.x, b.y, width / 2);
    }
  }
}

/**
 * A pause badge's pill (spec §7), centred at `at`, `width` × `height`: paper
 * with a 1.5 px marker outline and two marker bars at its left. The scene
 * writes the count beside the bars.
 */
export function yapDrawPauseBadge(
  g: Phaser.GameObjects.Graphics,
  at: YapPoint,
  width: number,
  height: number,
): void {
  const x = at.x - width / 2;
  const y = at.y - height / 2;
  const red = color('marker');
  g.fillStyle(color('paper'), 1).fillRoundedRect(x, y, width, height, height / 2);
  g.lineStyle(1.5, red, 1).strokeRoundedRect(x, y, width, height, height / 2);
  const barH = height * 0.48;
  const barY = at.y - barH / 2;
  g.fillStyle(red, 1)
    .fillRect(x + YAP_PAUSE_BADGE_PAD, barY, 2.5, barH)
    .fillRect(x + YAP_PAUSE_BADGE_PAD + 5, barY, 2.5, barH);
}

/** Room left of a pause badge's bars, in px; the bars and their gap take 7.5. */
export const YAP_PAUSE_BADGE_PAD = 7;
/** Width of a pause badge's bars with the room after them, before the count. */
export const YAP_PAUSE_BADGE_BARS = 12;

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
  yapDrawExit(g, layout, level, level.exit);
  yapDrawBoardFrame(g, layout);
  return true;
}
