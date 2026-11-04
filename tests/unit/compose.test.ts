// Tests for the pure geometry of the screen compositions (plan style 4/6,
// spec §5 and §8): leader dots, ruler marks, day boxes, the weekday of a test
// day, a heist's facts, the telegram line, the stamp fit, the win actions and
// the first-launch hand. Phaser draws with these; the drawing is checked in
// screenshots.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { YapLevel } from '../../src/core/level';
import {
  yapDayBoxes,
  yapFitStamp,
  yapHandPose,
  yapHeistFacts,
  yapLeaderDots,
  yapRulerMarks,
  yapTelegram,
  yapWeekday,
  yapWinActions,
} from '../../src/game/compose';

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

describe('yapLeaderDots — the dotted leader of a row', () => {
  it('leader dots stay clear of both texts', () => {
    const dots = yapLeaderDots(100, 200);
    expect(dots.length).toBeGreaterThan(10);
    for (const x of dots) {
      expect(x).toBeGreaterThan(106);
      expect(x).toBeLessThan(194);
    }
    expect(yapLeaderDots(100, 110)).toEqual([]);
  });
});

describe('yapRulerMarks — the execution ruler', () => {
  it('ruler marks span the width, every 5th long', () => {
    const marks = yapRulerMarks(260, 26);
    expect(marks).toHaveLength(27);
    expect(marks[0]).toEqual({ x: 0, long: true });
    expect(marks[26]?.x).toBe(260);
    expect(marks.filter((m) => m.long).map((m) => marks.indexOf(m))).toEqual([
      0, 5, 10, 15, 20, 25,
    ]);
  });
});

describe('yapDayBoxes — the seven days of the streak', () => {
  it('day boxes fit 360 px', () => {
    const boxes = yapDayBoxes(32, 296);
    expect(boxes).toHaveLength(7);
    expect(boxes[0]?.x).toBe(32);
    const last = boxes[6];
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(32 + 296);
    for (const b of boxes) expect(b.width).toBeGreaterThanOrEqual(18);
    // a narrow row shrinks the boxes instead of overflowing
    const tight = yapDayBoxes(0, 140);
    const end = tight[6];
    expect((end?.x ?? 0) + (end?.width ?? 0)).toBeLessThanOrEqual(140);
  });
});

describe('yapWeekday — the weekday of a test day', () => {
  it('weekday of the test days', () => {
    expect(yapWeekday(1, '2025-11-03')).toBe(1); // Monday
    expect(yapWeekday(7, '2025-11-03')).toBe(0); // Sunday
  });
});

describe('yapHeistFacts — what a heist holds', () => {
  it('heist facts', () => {
    expect(yapHeistFacts(level('tutorial/t1'))).toEqual([]);
    expect(yapHeistFacts(level('daily/d5'))).toEqual(['guard', 'camera', 'laser']);
    expect(yapHeistFacts(level('daily/d7'))).toEqual(['guard', 'camera']);
  });
});

describe('yapTelegram — the share line of the win report', () => {
  const measure = (s: string): number => [...s].length * 8;

  it('keeps a line that fits', () => {
    expect(yapTelegram('TO SHARE {line} · {ticks} ticks', '✅', 10, 400, measure)).toBe(
      'TO SHARE ✅ · 10 ticks',
    );
  });

  it('yapTelegram fits its width', () => {
    const line = '💥'.repeat(20);
    const out = yapTelegram('{line} · {ticks} ticks', line, 26, 120, measure);
    expect(measure(out)).toBeLessThanOrEqual(120);
    expect(out).toContain('…');
    expect(out).toContain('26 ticks');
    // never half an emoji: no lone surrogate left in the line
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false);
  });
});

describe('yapFitStamp — a stamp keeps its text inside', () => {
  it('scales down to 0.7 at most', () => {
    expect(yapFitStamp(80, 120)).toBe(1);
    expect(yapFitStamp(150, 120)).toBeCloseTo(0.8, 9);
    expect(yapFitStamp(400, 120)).toBe(0.7);
  });
});

describe('yapWinActions — the footer of the win report', () => {
  it('win actions put Share above the row', () => {
    expect(yapWinActions(844)).toEqual({ shareY: 742, rowY: 804, top: 716 });
  });
});

describe('yapHandPose — the first-launch hand', () => {
  it('hand pose loops', () => {
    expect(yapHandPose(0, 4)).toEqual({ index: 0, along: 0, visible: true });
    expect(yapHandPose(800, 4)).toEqual({ index: 2, along: 0, visible: true });
    expect(yapHandPose(1600, 4)).toEqual({ index: 3, along: 1, visible: true });
    expect(yapHandPose(2399, 4)).toEqual({ index: 3, along: 1, visible: true });
    expect(yapHandPose(2400, 4)).toEqual({ index: 0, along: 0, visible: true });
    expect(yapHandPose(500, 0).visible).toBe(false);
  });
});
