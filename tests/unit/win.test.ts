// Tests for story C5 — the Win screen model (src/game/win.ts), pure and
// Phaser-free like YapFailureReplay (./failure.ts). Gate 1 spec, "Score,
// stars and attempts" and the Win screen: attempts (every PLAY press counts,
// even if stopped — but replaying after the win never changes attempts),
// ticks vs par, stars (3 at par, 2 up to par x 1.2 rounded down, 1 above),
// the emoji line that will go into the share, and the Share / Improve /
// Home actions (Share is a stub emitting an event until E2 wires it).
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapLevel } from '../../src/core/level';
import { run, type YapCause, type YapPlan, type YapSimOutcome } from '../../src/core/sim';
import { YapI18n } from '../../src/app/i18n';
import {
  YapAttemptLog,
  YapWinError,
  YapWinScreen,
  YAP_MAX_EMOJI_ATTEMPTS,
  YAP_STAR_THRESHOLD,
  yapAttemptEmoji,
  yapEmojiLineFor,
} from '../../src/game/win';

// ---------------------------------------------------------------------------
// Helpers — an open 8 x 12 level with a guaranteed win in 14 ticks
// ---------------------------------------------------------------------------

// 8 x 12, S=(1,1), L=(3,10), E=(6,10), no interior walls, no entities.
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

// E,E then S x 9 (onto the loot at (3,10)) then E,E,E (onto the exit): 14
// ticks, a win at tick 14.
const WIN_PLAN: YapPlan = [
  'E',
  'E',
  'S',
  'S',
  'S',
  'S',
  'S',
  'S',
  'S',
  'S',
  'S',
  'E',
  'E',
  'E',
];

// The same win with one pause on the start cell: 15 ticks.
const WIN_PLAN_15: YapPlan = ['wait', ...WIN_PLAN];

function wonOutcome(level: YapLevel, plan: YapPlan): YapSimOutcome {
  const { outcome } = run(level, plan);
  expect(outcome.kind).toBe('won');
  return outcome;
}

/** A win screen for `level` won by `plan`, with the attempts of `log`. */
function winScreen(level: YapLevel, plan: YapPlan, log: YapAttemptLog, hints = 0): YapWinScreen {
  return new YapWinScreen(level, wonOutcome(level, plan), log, hints);
}

// ---------------------------------------------------------------------------
// Stars: 3 at par, 2 up to par x 1.2 rounded down, 1 above (Gate 1 spec)
// ---------------------------------------------------------------------------

describe('YapWinScreen — stars', () => {
  it('computes 3 stars at par, 2 up to floor(par x 1.2), 1 above', () => {
    expect(YAP_STAR_THRESHOLD).toBe(1.2);
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterWin();
    // 14 ticks: par 14 -> 3 stars; par 12 -> floor(14.4)=14 -> 2 stars;
    // par 11 -> floor(13.2)=13 -> 1 star.
    expect(winScreen(lvl(14), WIN_PLAN, log).yapStars()).toBe(3);
    expect(winScreen(lvl(12), WIN_PLAN, log).yapStars()).toBe(2);
    expect(winScreen(lvl(11), WIN_PLAN, log).yapStars()).toBe(1);
  });

  it('the 2-star boundary is inclusive: ticks == floor(par x 1.2) is 2 stars', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterWin();
    // par 12, floor(12 x 1.2) = 14: 14 ticks -> 2 stars, 15 ticks -> 1 star.
    expect(winScreen(lvl(12), WIN_PLAN, log).yapStars()).toBe(2);
    expect(winScreen(lvl(12), WIN_PLAN_15, log).yapStars()).toBe(1);
    // par 10, floor(10 x 1.2) = 12: 14 ticks is above -> 1 star.
    expect(winScreen(lvl(10), WIN_PLAN, log).yapStars()).toBe(1);
  });

  it('exposes ticks (the winning plan duration) and par (the level par)', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = winScreen(lvl(12), WIN_PLAN, log);
    expect(win.yapTicks()).toBe(14); // pauses included: one step per tick
    expect(win.yapPar()).toBe(12);
    const win15 = winScreen(lvl(12), WIN_PLAN_15, log);
    expect(win15.yapTicks()).toBe(15);
  });

  it('renders the stars as filled/empty glyphs (shape, not color alone)', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterWin();
    expect(winScreen(lvl(14), WIN_PLAN, log).yapStarsText()).toBe('★★★');
    expect(winScreen(lvl(12), WIN_PLAN, log).yapStarsText()).toBe('★★☆');
    expect(winScreen(lvl(11), WIN_PLAN, log).yapStarsText()).toBe('★☆☆');
  });
});

// ---------------------------------------------------------------------------
// Attempts: every PLAY press counts, even if stopped — but never after a win
// ---------------------------------------------------------------------------

describe('YapAttemptLog — attempts', () => {
  it('counts every PLAY press, even a stopped one', () => {
    const log = new YapAttemptLog();
    expect(log.yapPressPlay()).toBe(1);
    expect(log.yapPressPlay()).toBe(2);
    expect(log.yapPressPlay()).toBe(3); // stopped: still counts (spec)
    expect(log.yapAttempts()).toBe(3);
    expect(log.yapIsWon()).toBe(false);
  });

  it('replaying after the win does not change attempts (acceptance criterion)', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterFailure('guard');
    log.yapPressPlay();
    log.yapRegisterWin();
    expect(log.yapAttempts()).toBe(2);
    expect(log.yapIsWon()).toBe(true);
    // Improve my score -> PLAY again: the attempt count stays at the winning one.
    expect(log.yapPressPlay()).toBe(2);
    expect(log.yapPressPlay()).toBe(2);
    expect(log.yapAttempts()).toBe(2);
  });

  it('records one failure cause per counted attempt, none after the win', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterFailure('camera');
    log.yapPressPlay();
    log.yapRegisterFailure('laser');
    log.yapPressPlay();
    log.yapRegisterWin();
    log.yapPressPlay();
    log.yapRegisterFailure('guard'); // a post-win replay is not an attempt
    expect(log.yapAttemptEntries()).toEqual(['camera', 'laser', 'won']);
  });
});

// ---------------------------------------------------------------------------
// The emoji line that will go into the share
// ---------------------------------------------------------------------------

describe('YapWinScreen — emoji line', () => {
  it('maps one emoji per attempt: guard, camera, laser, success', () => {
    expect(yapAttemptEmoji('guard')).toBe('👁️');
    expect(yapAttemptEmoji('camera')).toBe('📷');
    expect(yapAttemptEmoji('laser')).toBe('🔴');
    expect(yapAttemptEmoji('won')).toBe('✅');
    expect(YAP_MAX_EMOJI_ATTEMPTS).toBe(6);
  });

  it('is one emoji per attempt, ending on the success emoji', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterFailure('guard');
    log.yapPressPlay();
    log.yapRegisterFailure('camera');
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = winScreen(lvl(14), WIN_PLAN, log);
    expect(win.yapEmojiLine()).toBe('👁️📷✅');
  });

  it('beyond 6 attempts: the first 5, "…", then the success emoji and the total', () => {
    const log = new YapAttemptLog();
    const causes = ['guard', 'camera', 'laser', 'guard', 'camera', 'laser', 'guard'] as const;
    for (const cause of causes) {
      log.yapPressPlay();
      log.yapRegisterFailure(cause);
    }
    log.yapPressPlay();
    log.yapRegisterWin();
    expect(log.yapAttempts()).toBe(8);
    const win = winScreen(lvl(14), WIN_PLAN, log);
    expect(win.yapEmojiLine()).toBe('👁️📷🔴👁️📷…✅ 8');
  });

  it('keeps the full line at exactly 6 attempts (no ellipsis)', () => {
    const log = new YapAttemptLog();
    for (let i = 0; i < 5; i += 1) {
      log.yapPressPlay();
      log.yapRegisterFailure('guard');
    }
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = winScreen(lvl(14), WIN_PLAN, log);
    expect(win.yapEmojiLine()).toBe('👁️👁️👁️👁️👁️✅');
  });

  it('appends one light bulb per hint used', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterWin();
    expect(winScreen(lvl(14), WIN_PLAN, log, 0).yapEmojiLine()).toBe('✅');
    expect(winScreen(lvl(14), WIN_PLAN, log, 2).yapEmojiLine()).toBe('✅💡💡');
  });
});

// ---------------------------------------------------------------------------
// The share payload (Share is a stub emitting an event until E2 wires it)
// ---------------------------------------------------------------------------

describe('YapWinScreen — share payload', () => {
  it('carries attempts, ticks, par, stars and the emoji line', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterFailure('laser');
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = winScreen(lvl(12), WIN_PLAN, log, 1);
    expect(win.yapSharePayload()).toEqual({
      attempts: 2,
      ticks: 14,
      par: 12,
      stars: 2,
      emojiLine: '🔴✅💡',
    });
  });
});

// ---------------------------------------------------------------------------
// Contract guards and i18n
// ---------------------------------------------------------------------------

describe('YapWinScreen — contract and i18n', () => {
  it('rejects a non-won outcome (a failure is not a win)', () => {
    const level = lvl(14);
    const { outcome } = run(level, ['E', 'E', 'S']); // never reaches the exit
    expect(outcome.kind).toBe('running');
    const log = new YapAttemptLog();
    log.yapPressPlay();
    expect(() => new YapWinScreen(level, outcome, log)).toThrow(YapWinError);
  });

  it('the new winScreen i18n key resolves in both locales', () => {
    for (const locale of ['fr', 'en'] as const) {
      const i18n = new YapI18n(locale, null);
      const text = i18n.t('winScreen.sharePreview');
      expect(text.trim().length, `${locale}:winScreen.sharePreview`).toBeGreaterThan(0);
      expect(text).not.toContain('{');
    }
    // the pre-existing win.* keys used by the panel also resolve
    for (const locale of ['fr', 'en'] as const) {
      const i18n = new YapI18n(locale, null);
      for (const key of ['win.title', 'win.attempts', 'win.ticks', 'win.par', 'win.stars', 'win.share', 'win.improve', 'win.home'] as const) {
        expect(i18n.t(key).trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('yapEmojiLineFor — the share line from a stored record (E2 Home share)', () => {
  it('maps the failures, then the success emoji', () => {
    expect(yapEmojiLineFor(['guard', 'camera'], 3, 0)).toBe('👁️📷✅');
  });

  it('adds one bulb per hint', () => {
    expect(yapEmojiLineFor(['laser'], 2, 2)).toBe('🔴✅💡💡');
  });

  it('collapses a long run to the first five, "…", and the total', () => {
    const causes: YapCause[] = ['guard', 'guard', 'guard', 'guard', 'guard', 'guard', 'guard'];
    expect(yapEmojiLineFor(causes, 8, 1)).toBe('👁️👁️👁️👁️👁️…✅ 8💡');
  });

  it('matches the live Win screen line for the same attempts', () => {
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterFailure('guard');
    log.yapPressPlay();
    log.yapRegisterFailure('camera');
    log.yapPressPlay();
    log.yapRegisterWin();
    const screen = new YapWinScreen(lvl(12), { kind: 'won', tick: 12 }, log);
    expect(yapEmojiLineFor(['guard', 'camera'], 3, 0)).toBe(screen.yapEmojiLine());
  });
});
