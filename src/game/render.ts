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
  YAP_PALETTE,
  yapCellCenter,
  yapCellRect,
  yapDirVector,
  yapHexToInt,
  type YapBoardLayout,
  type YapPaletteToken,
} from './board';

function color(token: YapPaletteToken): number {
  return yapHexToInt(YAP_PALETTE[token]);
}

// ---------------------------------------------------------------------------
// Static grid (baked once into a texture by the scene)
// ---------------------------------------------------------------------------

/**
 * Floors, walls and cell boundaries. Floors stay visually open; decorative
 * detail is drawn only on wall cells (docs/UI-DESIGN.md). Draw with a layout
 * whose origin is (0, 0) so the result can be baked into a board-sized texture.
 */
export function yapDrawStaticGrid(
  g: Phaser.GameObjects.Graphics,
  level: YapLevel,
  layout: YapBoardLayout,
): void {
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const rect = yapCellRect(layout, { x, y });
      const ch = level.map[y]?.charAt(x) ?? '#';
      if (ch === '#') {
        g.fillStyle(color('wall'), 1).fillRect(rect.x, rect.y, rect.w, rect.h);
        // A restrained inset seam makes walls read as architectural panels
        // instead of a field of identical grey blocks. Floor remains untouched.
        const inset = Math.max(2, Math.floor(layout.cell * 0.1));
        g.lineStyle(1, color('wall-detail'), 0.62).strokeRoundedRect(
          rect.x + inset + 0.5,
          rect.y + inset + 0.5,
          rect.w - inset * 2 - 1,
          rect.h - inset * 2 - 1,
          Math.max(2, Math.floor(layout.cell * 0.08)),
        );
      } else {
        g.fillStyle(color('floor'), 1).fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
  }
  // crisp 1 px cell boundaries
  g.lineStyle(1, color('grid-line'), 1);
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const rect = yapCellRect(layout, { x, y });
      g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    }
  }
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

/** Dots spaced along each route segment, plus an arrow at each segment middle. */
export function yapDrawPatrol(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  guard: YapGuard,
): void {
  const pts = guard.route.map((c) => yapCellCenter(layout, c));
  const c = color('text-secondary');
  const dotR = Math.max(1.5, layout.cell * 0.055);
  const step = Math.max(4, layout.cell * 0.22);
  g.fillStyle(c, 0.85);
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue; // repeated cell = a wait, no segment to draw
    const ux = dx / len;
    const uy = dy / len;
    for (let d = step / 2; d < len; d += step) {
      g.fillCircle(a.x + ux * d, a.y + uy * d, dotR);
    }
    // direction arrow at the middle of the segment
    const mx = a.x + ux * len * 0.5;
    const my = a.y + uy * len * 0.5;
    const s = Math.max(3, layout.cell * 0.14);
    const px = -uy;
    const py = ux;
    g.fillTriangle(
      mx + ux * s,
      my + uy * s,
      mx - ux * s * 0.4 + px * s * 0.7,
      my - uy * s * 0.4 + py * s * 0.7,
      mx - ux * s * 0.4 - px * s * 0.7,
      my - uy * s * 0.4 - py * s * 0.7,
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
  g.fillStyle(color('path-light'), 1).fillCircle(p.x, p.y, r);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('text-primary'), 1).strokeCircle(p.x, p.y, r);
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

/** Camera: violet box on its wall cell with a lens dot and a facing tick. */
export function yapDrawCamera(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
  facing: YapDir,
): void {
  const p = yapCellCenter(layout, at);
  const s = layout.cell * 0.62;
  g.fillStyle(color('danger-camera'), 1).fillRect(p.x - s / 2, p.y - s / 2, s, s);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('text-primary'), 1).strokeRect(
    p.x - s / 2,
    p.y - s / 2,
    s,
    s,
  );
  g.fillStyle(color('path-light'), 1).fillCircle(p.x, p.y, Math.max(2, layout.cell * 0.1));
  const d = yapDirVector(facing);
  g.lineStyle(Math.max(2, layout.cell * 0.08), color('path-light'), 1).lineBetween(
    p.x,
    p.y,
    p.x + d.x * s * 0.75,
    p.y + d.y * s * 0.75,
  );
}

/** Diamond: cyan lozenge, visibly distinct from the floor. */
export function yapDrawDiamond(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  const r = layout.cell * 0.26;
  const pts = [
    new Phaser.Math.Vector2(p.x, p.y - r),
    new Phaser.Math.Vector2(p.x + r, p.y),
    new Phaser.Math.Vector2(p.x, p.y + r),
    new Phaser.Math.Vector2(p.x - r, p.y),
  ];
  g.fillStyle(color('objective-diamond'), 1).fillPoints(pts, true);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('path-outline'), 1).strokePoints(pts, true);
}

/** Exit: green door icon. */
export function yapDrawExit(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const rect = yapCellRect(layout, at);
  const inset = Math.floor(layout.cell * 0.18);
  const x = rect.x + inset;
  const y = rect.y + inset;
  const w = rect.w - inset * 2;
  const h = rect.h - inset * 2;
  g.fillStyle(color('objective-exit'), 1).fillRect(x, y, w, h);
  g.lineStyle(YAP_DANGER_LINE_WIDTH, color('path-outline'), 1).strokeRect(x, y, w, h);
  // door seam
  g.lineStyle(Math.max(1, Math.floor(layout.cell * 0.05)), color('path-light'), 1).lineBetween(
    x + w / 2,
    y + 2,
    x + w / 2,
    y + h - 2,
  );
}

/** Start cell marker (under the thief): a small neutral ring. */
export function yapDrawStart(
  g: Phaser.GameObjects.Graphics,
  layout: YapBoardLayout,
  at: YapCell,
): void {
  const p = yapCellCenter(layout, at);
  g.lineStyle(1, color('text-secondary'), 0.8).strokeCircle(
    p.x,
    p.y,
    layout.cell * 0.42,
  );
}
