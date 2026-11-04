// Tests for the pure geometry of the plan-style board (plan style 3/6, spec
// §7): hatching, seams, wall edges, dashes, laser beams, the door side, the
// camera anchors and the walked part of the route. Phaser draws with these;
// the drawing itself is checked in screenshots.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { YapLevel } from '../../src/core/level';
import { yapCellAt, yapCellRect, yapLevelLayout } from '../../src/game/board';
import {
  YAP_LASER_WIDTH,
  YAP_ROUTE_WIDTH,
  yapCameraAnchor,
  yapDashes,
  yapDoorSide,
  yapFloorSeams,
  yapHatchSegments,
  yapLaserBeam,
  yapWalkedSteps,
  yapWallEdges,
  type YapSegment,
} from '../../src/game/plan-geometry';

const LEVELS: readonly { id: string; level: YapLevel }[] = (
  JSON.parse(readFileSync(new URL('../../levels/levels.json', import.meta.url), 'utf8')) as {
    levels: { id: string; level: YapLevel }[];
  }
).levels;
function level(id: string): YapLevel {
  const found = LEVELS.find((entry) => entry.id === id)?.level;
  if (found === undefined) throw new Error(`no level ${id}`);
  return found;
}
const T1 = level('tutorial/t1');
const T5 = level('tutorial/t5');
const D4 = level('daily/d4');
const D5 = level('daily/d5');
const H4 = level('hard/h4');

const isWall = (lvl: YapLevel, x: number, y: number): boolean =>
  (lvl.map[y]?.charAt(x) ?? '#') === '#';

describe('yapHatchSegments — 45° hatching clipped to a cell', () => {
  it('hatching stays inside its cell and keeps its phase', () => {
    const spacing = 7;
    for (const rect of [
      { x: 16, y: 80, w: 59, h: 59 },
      { x: 75, y: 80, w: 59, h: 59 },
      { x: 6, y: 70, w: 10, h: 10 },
    ]) {
      const segments = yapHatchSegments(rect, spacing);
      expect(segments.length).toBeGreaterThan(0);
      for (const s of segments) {
        for (const [px, py] of [
          [s.x1, s.y1],
          [s.x2, s.y2],
        ] as const) {
          expect(px).toBeGreaterThanOrEqual(rect.x - 1e-9);
          expect(px).toBeLessThanOrEqual(rect.x + rect.w + 1e-9);
          expect(py).toBeGreaterThanOrEqual(rect.y - 1e-9);
          expect(py).toBeLessThanOrEqual(rect.y + rect.h + 1e-9);
        }
        // a 45° line: both ends share x + y, on the board-wide grid of the spacing
        const k = (s.x1 + s.y1) / spacing;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        expect(s.x2 + s.y2).toBeCloseTo(s.x1 + s.y1, 9);
      }
    }
  });
});

describe('yapFloorSeams and yapWallEdges', () => {
  it('seams and edges on T1', () => {
    const layout = yapLevelLayout(390, 844, T1);
    // the 6 × 10 open interior: 5 × 10 vertical and 6 × 9 horizontal sides
    expect(yapFloorSeams(T1, layout)).toHaveLength(104);
    expect(yapWallEdges(T1, layout)).toHaveLength(32);
  });

  it('every edge on D5 has a wall on exactly one side', () => {
    const layout = yapLevelLayout(390, 844, D5);
    const edges = yapWallEdges(D5, layout);
    expect(edges.length).toBeGreaterThan(32);
    const sideOf = (s: YapSegment, sign: number): boolean => {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      const vertical = s.x1 === s.x2;
      const at = yapCellAt(layout, mx + (vertical ? sign : 0), my + (vertical ? 0 : sign));
      if (at === null) throw new Error('edge off the board');
      return isWall(D5, at.x, at.y);
    };
    for (const s of edges) expect(sideOf(s, -1) !== sideOf(s, 1)).toBe(true);
  });
});

describe('yapDashes — dashed lines', () => {
  it('dashes of 4/4 cover half the line', () => {
    const dashes = yapDashes({ x: 0, y: 0 }, { x: 40, y: 0 }, 4, 4);
    expect(dashes).toHaveLength(5);
    expect(dashes[0]).toEqual({ x1: 0, y1: 0, x2: 4, y2: 0 });
    expect(dashes[4]).toEqual({ x1: 32, y1: 0, x2: 36, y2: 0 });
  });

  it('clips the last dash to the end', () => {
    const dashes = yapDashes({ x: 0, y: 0 }, { x: 0, y: 10 }, 4, 4);
    expect(dashes).toEqual([
      { x1: 0, y1: 0, x2: 0, y2: 4 },
      { x1: 0, y1: 8, x2: 0, y2: 10 },
    ]);
  });
});

describe('yapLaserBeam — the beam through the laser cells', () => {
  it('laser beams on D4 and D5', () => {
    const layout = yapLevelLayout(390, 844, D5);
    const top = yapCellRect(layout, { x: 6, y: 7 });
    const bottom = yapCellRect(layout, { x: 6, y: 8 });
    expect(yapLaserBeam(D5, layout, D5.lasers[0]?.cells ?? [])).toEqual({
      from: { x: top.x + top.w / 2, y: top.y },
      to: { x: bottom.x + bottom.w / 2, y: bottom.y + bottom.h },
      axis: 'v',
    });
    // D4's one cell is a gap in a vertical wall: walls above and below it
    const d4 = yapLevelLayout(390, 844, D4);
    const gap = yapCellRect(d4, { x: 4, y: 6 });
    expect(yapLaserBeam(D4, d4, D4.lasers[0]?.cells ?? [])).toEqual({
      from: { x: gap.x + gap.w / 2, y: gap.y },
      to: { x: gap.x + gap.w / 2, y: gap.y + gap.h },
      axis: 'v',
    });
  });

  it('crosses a one-cell gap in a horizontal wall from side to side', () => {
    const layout = yapLevelLayout(390, 844, H4);
    // (6,3) has walls left (5,3) and right (7,3)
    const r = yapCellRect(layout, { x: 6, y: 3 });
    expect(yapLaserBeam(H4, layout, [{ x: 6, y: 3 }])).toEqual({
      from: { x: r.x, y: r.y + r.h / 2 },
      to: { x: r.x + r.w, y: r.y + r.h / 2 },
      axis: 'h',
    });
  });
});

describe('yapDoorSide — where the exit door opens', () => {
  it('the T1 door opens on the east wall', () => {
    expect(yapDoorSide(T1, { x: 6, y: 6 })).toBe('E');
  });

  it('falls back to the south side in the open', () => {
    expect(yapDoorSide(T1, { x: 3, y: 5 })).toBe('S');
  });
});

describe('yapCameraAnchor — cameras on their wall cell', () => {
  it('border cameras sit on the frame, inside the sheet', () => {
    const layout = yapLevelLayout(390, 844, T5);
    const t5 = yapCameraAnchor(layout, { x: 0, y: 6 }, 'E');
    // flush with the board's outer edge, straddling the thin frame
    expect(t5.box.x).toBe(layout.originX);
    expect(t5.box.x + t5.box.w).toBeGreaterThan(layout.originX + layout.frame);
    expect(t5.lens.x).toBeGreaterThan(t5.centre.x);
    const h4l = yapLevelLayout(390, 844, H4);
    const h4 = yapCameraAnchor(h4l, { x: 7, y: 3 }, 'W');
    expect(h4.box.x + h4.box.w).toBe(h4l.originX + h4l.boardWidth);
    expect(h4.lens.x).toBeLessThan(h4.centre.x);
  });

  it('keeps every border camera and its lens on the board at phone widths', () => {
    const cameras = LEVELS.flatMap(({ id, level: lvl }) =>
      lvl.cameras
        .filter(
          (c) =>
            c.at.x === 0 || c.at.y === 0 || c.at.x === lvl.width - 1 || c.at.y === lvl.height - 1,
        )
        .map((c) => ({ id, lvl, at: c.at, dirs: c.dirs })),
    );
    expect(cameras).toHaveLength(11);
    for (const [width, height] of [
      [360, 640],
      [375, 812],
      [390, 844],
      [412, 915],
    ] as const) {
      for (const { id, lvl, at, dirs } of cameras) {
        const layout = yapLevelLayout(width, height, lvl);
        for (const facing of ['N', 'E', 'S', 'W'] as const) {
          const { box, lens } = yapCameraAnchor(layout, at, facing);
          const where = `${id} at ${width} facing ${facing}`;
          expect(box.x, where).toBeGreaterThanOrEqual(layout.originX);
          expect(box.y, where).toBeGreaterThanOrEqual(layout.originY);
          expect(box.x + box.w, where).toBeLessThanOrEqual(layout.originX + layout.boardWidth);
          expect(box.y + box.h, where).toBeLessThanOrEqual(layout.originY + layout.boardHeight);
          // the lens dot, radius 0.09 cell, stays inside its box
          const r = layout.cell * 0.09;
          expect(lens.x - r, where).toBeGreaterThanOrEqual(box.x - 1e-9);
          expect(lens.x + r, where).toBeLessThanOrEqual(box.x + box.w + 1e-9);
          expect(lens.y - r, where).toBeGreaterThanOrEqual(box.y - 1e-9);
          expect(lens.y + r, where).toBeLessThanOrEqual(box.y + box.h + 1e-9);
        }
        void dirs;
      }
    }
  });

  it('an interior camera sits at its cell centre', () => {
    const layout = yapLevelLayout(390, 844, D5);
    const r = yapCellRect(layout, { x: 4, y: 5 });
    const anchor = yapCameraAnchor(layout, { x: 4, y: 5 }, 'S');
    expect(anchor.centre).toEqual({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    expect(anchor.lens.y).toBeGreaterThan(anchor.centre.y);
  });
});

describe('yapWalkedSteps — the part of the route walked at a tick', () => {
  it('the walked steps skip the pauses', () => {
    expect(yapWalkedSteps(['E', 'wait', 'E', 'S'], 0)).toBe(0);
    expect(yapWalkedSteps(['E', 'wait', 'E', 'S'], 2)).toBe(1);
    expect(yapWalkedSteps(['E', 'wait', 'E', 'S'], 3)).toBe(2);
    expect(yapWalkedSteps(['E', 'wait', 'E', 'S'], 99)).toBe(3);
  });
});

describe('route and laser constants', () => {
  it('route and laser differ by width', () => {
    expect(YAP_ROUTE_WIDTH).toBe(5.5);
    expect(YAP_LASER_WIDTH).toBe(2.5);
    expect(YAP_ROUTE_WIDTH).toBeGreaterThanOrEqual(2 * YAP_LASER_WIDTH);
  });
});
