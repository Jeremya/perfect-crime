// YapWinScreen — the pure, Phaser-free model of the Win screen (story C5).
// Like YapFailureReplay (./failure.ts), it holds no rendering and no rule:
// the winning tick comes from the sim outcome (resolveTick via YapExecution),
// and this module only describes what the Win screen must show.
//
// Gate 1 spec, "Score, stars and attempts" + the Win screen: "Attempts, ticks,
// par, stars, and the emoji line that will go into the share. Share (primary
// button), Improve my score, Home."
//   - Ticks: duration of the winning plan, pauses included (one per tick).
//   - Stars: 3 at par, 2 up to par x 1.2 rounded down, 1 above that.
//   - Attempts: every press of PLAY counts, even if stopped — but replaying
//     after the win improves ticks and stars, never attempts.
//   - Emoji line: one emoji per attempt (guard, camera, laser, success);
//     beyond 6 attempts the first 5, "…", then the success emoji and the
//     total; one light bulb per hint used.
//
// The whole contract is unit-tested in node (tests/unit/win.test.ts); the
// scene (./level-scene.ts) draws from the getters. Share (E2): the scene
// builds the share text from yapSharePayload() and the challenge link from
// yapPayloadData() (the E1 payload), then shares through src/app/share.ts.
import type { YapLevel } from '../core/level';
import type { YapCause, YapPlan, YapSimOutcome } from '../core/sim';
import { YAP_MAX_CAUSES, type YapPayloadData } from '../app/payload';

/** 2 stars up to par x 1.2 rounded down (Gate 1 spec, "Score, stars"). */
export const YAP_STAR_THRESHOLD = 1.2;
/** Beyond 6 attempts the emoji line collapses to the first 5 + "…" + total. */
export const YAP_MAX_EMOJI_ATTEMPTS = 6;

/** Win contract error (a non-won outcome is not a win screen). */
export class YapWinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapWinError';
  }
}

/** One entry of the emoji line per attempt: its cause, or the success. */
export type YapAttemptEntry = YapCause | 'won';

/** The emoji of one attempt in the share line (Gate 1 spec, "What gets sent"). */
export function yapAttemptEmoji(entry: YapAttemptEntry): string {
  switch (entry) {
    case 'guard':
      return '👁️';
    case 'camera':
      return '📷';
    case 'laser':
      return '🔴';
    case 'won':
      return '✅';
  }
}

/**
 * The attempt bookkeeping of one heist. Every press of PLAY counts as an
 * attempt, even if stopped — until the heist is won: replaying afterwards
 * improves ticks and stars, never attempts (Gate 1 spec). A stopped attempt
 * counts but has no cause, so it gets no emoji in the share line.
 */
export class YapAttemptLog {
  private yapCount = 0;
  private yapWon = false;
  private readonly yapCauses: YapCause[] = [];

  /** Registers one press of PLAY and returns the attempt number. */
  yapPressPlay(): number {
    if (!this.yapWon) this.yapCount += 1;
    return this.yapCount;
  }

  /** Records the cause of a failed attempt (ignored after the win). */
  yapRegisterFailure(cause: YapCause): void {
    if (!this.yapWon) this.yapCauses.push(cause);
  }

  /** Marks the heist as won: later PLAY presses no longer count. */
  yapRegisterWin(): void {
    this.yapWon = true;
  }

  /** The number of the winning attempt (the daily score, Gate 1 spec). */
  yapAttempts(): number {
    return this.yapCount;
  }

  yapIsWon(): boolean {
    return this.yapWon;
  }

  /** One entry per counted attempt that ended, the win last. */
  yapAttemptEntries(): readonly YapAttemptEntry[] {
    return [...this.yapCauses, 'won'];
  }
}

/** The share summary of the Win screen: what the share text shows (E2). */
export interface YapWinSharePayload {
  readonly attempts: number;
  readonly ticks: number;
  readonly par: number;
  readonly stars: number;
  readonly emojiLine: string;
}

/**
 * What the Win screen shows for one win: attempts, ticks vs par, stars, the
 * emoji line that will go into the share, and the share payload. Built from
 * the level (par), the sim outcome (winning tick) and the attempt log —
 * never re-simulated.
 */
export class YapWinScreen {
  private readonly yapLevel: YapLevel;
  private readonly yapOutcome: Extract<YapSimOutcome, { kind: 'won' }>;
  private readonly yapLog: YapAttemptLog;
  private readonly yapHintsUsed: number;

  constructor(level: YapLevel, outcome: YapSimOutcome, log: YapAttemptLog, hintsUsed = 0) {
    if (outcome.kind !== 'won') {
      throw new YapWinError(`YapWinScreen: a win screen needs a win, got ${outcome.kind}`);
    }
    this.yapLevel = level;
    this.yapOutcome = outcome;
    this.yapLog = log;
    this.yapHintsUsed = hintsUsed;
  }

  /** Ticks: the duration of the winning plan, pauses included. */
  yapTicks(): number {
    return this.yapOutcome.tick;
  }

  /** Par: the minimum number of ticks found by the solver (the level par). */
  yapPar(): number {
    return this.yapLevel.par;
  }

  /** Attempts: the number of the winning attempt. */
  yapAttempts(): number {
    return this.yapLog.yapAttempts();
  }

  /** Stars: 3 at par, 2 up to par x 1.2 rounded down, 1 above (spec). */
  yapStars(): number {
    const par = this.yapPar();
    const ticks = this.yapTicks();
    if (ticks <= par) return 3;
    if (ticks <= Math.floor(par * YAP_STAR_THRESHOLD)) return 2;
    return 1;
  }

  /** The stars as filled/empty glyphs: a shape cue, not color alone. */
  yapStarsText(): string {
    const stars = this.yapStars();
    return '★'.repeat(stars) + '☆'.repeat(3 - stars);
  }

  /**
   * The emoji line that will go into the share: one emoji per attempt,
   * ending on the success emoji; beyond 6 attempts the first 5, "…", then
   * the success emoji and the total; one 💡 per hint used (Gate 1 spec).
   */
  yapEmojiLine(): string {
    const entries = this.yapLog.yapAttemptEntries();
    const hints = '💡'.repeat(this.yapHintsUsed);
    if (entries.length <= YAP_MAX_EMOJI_ATTEMPTS) {
      return entries.map(yapAttemptEmoji).join('') + hints;
    }
    const first = entries.slice(0, 5).map(yapAttemptEmoji).join('');
    return `${first}…✅ ${this.yapLog.yapAttempts()}${hints}`;
  }

  /** The share summary: attempts, ticks, par, stars and the emoji line (E2). */
  yapSharePayload(): YapWinSharePayload {
    return {
      attempts: this.yapAttempts(),
      ticks: this.yapTicks(),
      par: this.yapPar(),
      stars: this.yapStars(),
      emojiLine: this.yapEmojiLine(),
    };
  }

  /**
   * The E1 link payload of this win (story E2): the day of the heist, the
   * winning attempt, ticks, stars, hints, the first 8 failure causes, the
   * anonymous share ID and the winning plan. Counters are clamped to their
   * payload fields (attempts one byte, hints two bits).
   */
  yapPayloadData(day: number, plan: YapPlan, shareId: number, nickname = ''): YapPayloadData {
    const causes = this.yapLog
      .yapAttemptEntries()
      .filter((entry): entry is YapCause => entry !== 'won')
      .slice(0, YAP_MAX_CAUSES);
    return {
      day,
      attempts: Math.min(255, this.yapAttempts()),
      ticks: this.yapTicks(),
      stars: this.yapStars(),
      hints: Math.min(3, this.yapHintsUsed),
      causes,
      shareId,
      plan: [...plan],
      nickname,
    };
  }
}
