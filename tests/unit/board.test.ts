// Tests for the board geometry and the palette semantics (story C1).
//
// The visual pass added a board inset: the grid is a card with a 6 px gap to
// the page edge, a soft shadow and a 2 px frame. These tests pin the geometry
// (the board always fits between the bars, with its inset) and the contrast
// rules that make the exact-cell overlays readable — cell boundaries and the
// diamond are gameplay information, not decoration.
import { describe, expect, it } from 'vitest';
import {
  YAP_BOARD_INSET,
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapComputeLayout,
  yapFitRows,
} from '../../src/game/board';

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
    expect(contrast(YAP_PALETTE['path-light'], YAP_PALETTE['action-primary'])).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(YAP_PALETTE['action-primary'], YAP_PALETTE['action-primary-soft']),
    ).toBeGreaterThanOrEqual(4.5);
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
