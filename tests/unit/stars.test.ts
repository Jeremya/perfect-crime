// Tests for task X1 — the pure star-threshold module (src/game/stars.ts) that
// feeds the planning top bar (docs/design/experience.md §4.3 "Planning top
// bar": show the current 3★/2★ thresholds while drawing). The rule itself is
// unchanged and stays in src/game/win.ts (YAP_STAR_THRESHOLD = 1.2): 3★ at
// par, 2★ up to floor(par * 1.2), 1★ above. This module only re-exposes it as
// displayable numbers; the last test pins it against YapWinScreen.yapStars so
// the displayed thresholds and the win rule can never drift apart.
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapLevel } from '../../src/core/level';
import { YapAttemptLog, YapWinScreen, YAP_STAR_THRESHOLD } from '../../src/game/win';
import { yapStarThresholds } from '../../src/game/stars';

// ---------------------------------------------------------------------------
// Helpers — an open 8 x 12 level (same fixture as win.test.ts) so a fabricated
// won outcome can drive YapWinScreen without running the sim
// ---------------------------------------------------------------------------

const OPEN_MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#..L..E#',
  '########',
];

function lvl(par: number): YapLevel {
  const src = [
    'name: Test',
    'type: tutorial',
    'moment: ""',
    'maxPauses: 3',
    `par: ${par}`,
    'map: |',
    ...OPEN_MAP.map((row) => `  ${row}`),
  ].join('\n');
  return parseLevel(src);
}

/** The stars the Win screen would award for a win in `ticks` ticks at `par`. */
function starsAt(par: number, ticks: number): number {
  const log = new YapAttemptLog();
  log.yapPressPlay();
  log.yapRegisterWin();
  return new YapWinScreen(lvl(par), { kind: 'won', tick: ticks }, log).yapStars();
}

describe('yapStarThresholds (X1)', () => {
  it('echoes par and derives twoStarMax = floor(par * YAP_STAR_THRESHOLD)', () => {
    expect(yapStarThresholds(22)).toEqual({ par: 22, twoStarMax: 26 });
    expect(yapStarThresholds(10)).toEqual({ par: 10, twoStarMax: 12 });
  });

  it('floors the 1.2 product, never rounds up', () => {
    expect(yapStarThresholds(11).twoStarMax).toBe(13); // 13.2 -> 13
    expect(yapStarThresholds(7).twoStarMax).toBe(8); // 8.4 -> 8
    expect(yapStarThresholds(1).twoStarMax).toBe(1); // 1.2 -> 1
  });

  it('always keeps par inside the 2★ window (3★ and 2★ overlap at par)', () => {
    for (const par of [1, 2, 3, 5, 13, 21, 22, 100]) {
      const thresholds = yapStarThresholds(par);
      expect(thresholds.par).toBe(par);
      expect(thresholds.twoStarMax).toBe(Math.floor(par * YAP_STAR_THRESHOLD));
      expect(thresholds.twoStarMax).toBeGreaterThanOrEqual(par);
    }
  });

  it('matches the win rule exactly: 3★ at par, 2★ up to twoStarMax, 1★ above', () => {
    const par = 14; // twoStarMax = floor(14 * 1.2) = floor(16.8) = 16
    const { twoStarMax } = yapStarThresholds(par);
    expect(twoStarMax).toBe(16);
    expect(starsAt(par, par)).toBe(3);
    expect(starsAt(par, twoStarMax)).toBe(2);
    expect(starsAt(par, twoStarMax + 1)).toBe(1);
  });
});
