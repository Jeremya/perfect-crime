// Tests for the board geometry and the palette semantics (story C1).
//
// The visual pass added a board inset: the grid is a card with a 6 px gap to
// the page edge, a soft shadow and a 2 px frame. These tests pin the geometry
// (the board always fits between the bars, with its inset) and the contrast
// rules that make the exact-cell overlays readable — cell boundaries and the
// diamond are gameplay information, not decoration.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { YapLevel } from '../../src/core/level';
import {
  YAP_BOARD_FRAME,
  YAP_BOARD_INSET,
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_CAMERA_CONE_ALPHA,
  YAP_CONE_LINE_WIDTH,
  YAP_GUARD_CONE_ALPHA,
  YAP_INK_SOFT_ALPHA,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapBoardFrame,
  yapCellAt,
  yapCellRect,
  yapComputeLayout,
  yapFitRows,
  yapLevelLayout,
} from '../../src/game/board';

/** Every shipped level, from the compiled levels/levels.json. */
const LEVELS: readonly { id: string; level: YapLevel }[] = (
  JSON.parse(readFileSync(new URL('../../levels/levels.json', import.meta.url), 'utf8')) as {
    levels: { id: string; level: YapLevel }[];
  }
).levels;
const T1 = LEVELS.find((entry) => entry.id === 'tutorial/t1')?.level as YapLevel;

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('yapComputeLayout — the board is a card inside the page', () => {
  for (const [width, height, label] of [
    [390, 844, '390 x 844'],
    [360, 640, '360 x 640'],
    [480, 853, '480 x 853'],
  ] as const) {
    describe(label, () => {
      const layout = yapComputeLayout(width, height, 8, 12);

      it('fits the grid between the bars, inset on every side', () => {
        expect(layout.originX).toBeGreaterThanOrEqual(YAP_BOARD_INSET);
        expect(layout.originX + layout.boardWidth).toBeLessThanOrEqual(width - YAP_BOARD_INSET);
        expect(layout.originY).toBeGreaterThanOrEqual(YAP_TOP_BAR_HEIGHT + YAP_BOARD_INSET);
        expect(layout.originY + layout.boardHeight).toBeLessThanOrEqual(
          height - YAP_BOTTOM_BAR_HEIGHT - YAP_BOARD_INSET,
        );
      });

      it('keeps square integer cells', () => {
        expect(Number.isInteger(layout.cell)).toBe(true);
        expect(layout.cell).toBeGreaterThan(0);
        expect(layout.boardWidth).toBe(layout.cell * 8);
        expect(layout.boardHeight).toBe(layout.cell * 12);
      });

      it('stays playable at phone cell sizes', () => {
        expect(layout.cell).toBeGreaterThanOrEqual(38);
      });
    });
  }
});

describe('the thin wall frame (plan style 3/6)', () => {
  it('every shipped level gets the thin frame', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
    for (const { id, level } of LEVELS) expect(yapBoardFrame(level), id).toBe(YAP_BOARD_FRAME);
    expect(YAP_BOARD_FRAME).toBe(10);
  });

  it('an open border falls back to uniform cells', () => {
    const open: YapLevel = { ...T1, map: ['###.####', ...T1.map.slice(1)] };
    expect(yapBoardFrame(open)).toBe(0);
    expect(yapLevelLayout(390, 844, open)).toEqual(yapComputeLayout(390, 844, 8, 12));
  });

  it('the interior grows at 390 × 844', () => {
    const layout = yapLevelLayout(390, 844, T1);
    expect(layout.frame).toBe(10);
    expect(layout.cell).toBe(59);
    expect(layout.boardWidth).toBe(374);
    expect(layout.boardHeight).toBe(610);
    expect(layout.originX).toBeGreaterThanOrEqual(YAP_BOARD_INSET);
    expect(layout.originX + layout.boardWidth).toBeLessThanOrEqual(390 - YAP_BOARD_INSET);
    expect(layout.originY).toBeGreaterThanOrEqual(YAP_TOP_BAR_HEIGHT + YAP_BOARD_INSET);
    expect(layout.originY + layout.boardHeight).toBeLessThanOrEqual(
      844 - YAP_BOTTOM_BAR_HEIGHT - YAP_BOARD_INSET,
    );
    expect(yapLevelLayout(360, 640, T1).cell).toBeGreaterThanOrEqual(44);
  });

  it('gives the border cells the frame and the interior the cell', () => {
    const layout = yapLevelLayout(390, 844, T1);
    expect(yapCellRect(layout, { x: 0, y: 0 })).toEqual({
      x: layout.originX,
      y: layout.originY,
      w: 10,
      h: 10,
    });
    expect(yapCellRect(layout, { x: 1, y: 1 })).toEqual({
      x: layout.originX + 10,
      y: layout.originY + 10,
      w: 59,
      h: 59,
    });
    expect(yapCellRect(layout, { x: 7, y: 11 })).toEqual({
      x: layout.originX + 10 + 6 * 59,
      y: layout.originY + 10 + 10 * 59,
      w: 10,
      h: 10,
    });
  });

  it('yapCellAt inverts yapCellRect', () => {
    for (const [width, height] of [
      [390, 844],
      [360, 640],
    ] as const) {
      const layout = yapLevelLayout(width, height, T1);
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const r = yapCellRect(layout, { x, y });
          for (const [px, py] of [
            [r.x, r.y],
            [r.x + r.w / 2, r.y + r.h / 2],
            [r.x + r.w - 0.01, r.y + r.h - 0.01],
          ] as const) {
            expect(yapCellAt(layout, px, py), `${x},${y} at ${px},${py}`).toEqual({ x, y });
          }
        }
      }
      expect(yapCellAt(layout, layout.originX - 0.01, layout.originY + 20)).toBeNull();
      expect(yapCellAt(layout, layout.originX + layout.boardWidth, layout.originY + 20)).toBeNull();
      expect(
        yapCellAt(layout, layout.originX + 20, layout.originY + layout.boardHeight),
      ).toBeNull();
    }
  });

  it('keeps the uniform layout inverse too', () => {
    const layout = yapComputeLayout(360, 640, 8, 12);
    expect(layout.frame).toBe(0);
    const r = yapCellRect(layout, { x: 3, y: 4 });
    expect(yapCellAt(layout, r.x + 1, r.y + 1)).toEqual({ x: 3, y: 4 });
  });
});

describe('palette — gameplay information is readable', () => {
  it('keeps cell boundaries at 3:1 or better against the floor', () => {
    expect(contrast(YAP_PALETTE['grid-line'], YAP_PALETTE.floor)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the diamond at 3:1 or better against the floor', () => {
    expect(contrast(YAP_PALETTE['objective-diamond'], YAP_PALETTE.floor)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the exit at 3:1 or better against the floor', () => {
    expect(contrast(YAP_PALETTE['objective-exit'], YAP_PALETTE.floor)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the primary action readable in both states', () => {
    expect(
      contrast(YAP_PALETTE['path-light'], YAP_PALETTE['action-primary']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(YAP_PALETTE['action-primary'], YAP_PALETTE['action-primary-soft']),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('plan style tokens — paper and ink', () => {
  it('ink text reads on paper', () => {
    expect(contrast(YAP_PALETTE.ink, YAP_PALETTE.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(YAP_PALETTE.ink, YAP_PALETTE['paper-page'])).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text reads on paper', () => {
    expect(contrast(YAP_PALETTE['ink-muted'], YAP_PALETTE.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(YAP_PALETTE['ink-muted'], YAP_PALETTE['paper-page'])).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('primary labels read in both states', () => {
    // enabled: a paper label on the ink fill; disabled: an ink label on ink at 28%
    expect(contrast(YAP_PALETTE.paper, YAP_PALETTE.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(YAP_PALETTE.ink, YAP_PALETTE['ink-disabled'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('plan style tokens — the board', () => {
  it('marks read on paper at 3:1', () => {
    for (const token of [
      'guard-cone-edge',
      'camera-cone',
      'marker',
      'stamp',
      'diamond-edge',
      'exit-door',
      'thief-token',
      'laser-off',
      'graphite',
    ] as const) {
      expect(contrast(YAP_PALETTE[token], YAP_PALETTE.paper), token).toBeGreaterThanOrEqual(3);
    }
  });

  it('the guard letter reads on its token', () => {
    expect(
      contrast(YAP_PALETTE['guard-token-ink'], YAP_PALETTE['guard-token']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('ink edges read on the hatching', () => {
    expect(contrast(YAP_PALETTE.ink, YAP_PALETTE['hatch-ground'])).toBeGreaterThanOrEqual(4.5);
  });

  it('pins the tints and the outline of the cones', () => {
    expect(YAP_INK_SOFT_ALPHA).toBe(0.16);
    expect(YAP_GUARD_CONE_ALPHA).toBe(0.24);
    expect(YAP_CAMERA_CONE_ALPHA).toBe(0.18);
    expect(YAP_CONE_LINE_WIDTH).toBe(1.5);
  });
});

describe('yapFitRows — the archive fits above the actions', () => {
  it('keeps full-height rows when there is room', () => {
    const m = yapFitRows(600, 7);
    expect(m.height).toBe(64);
    expect(m.gap).toBe(8);
    expect(m.total).toBe(7 * 64 + 6 * 8);
    expect(m.total).toBeLessThanOrEqual(600);
  });

  it('shrinks the rows on a 360 × 640 phone instead of overflowing', () => {
    // measured on a real phone: the archive list gets ~320 px there
    const m = yapFitRows(320, 7);
    expect(m.height).toBeGreaterThanOrEqual(44);
    expect(m.height).toBeLessThan(64);
    expect(m.total).toBeLessThanOrEqual(320);
  });

  it('never goes below the touch minimum while a fit exists', () => {
    expect(yapFitRows(1000, 3).height).toBe(64);
    expect(yapFitRows(140, 3).height).toBe(44);
  });

  it('handles an empty archive', () => {
    expect(yapFitRows(500, 0)).toEqual({ height: 0, gap: 0, total: 0 });
  });
});
