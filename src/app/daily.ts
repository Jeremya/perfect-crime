// Daily logic (story D1): which heist is "today", the countdown to the next
// one, and the streak. Day = number of LOCAL calendar days between the test
// start date (YAP_TEST_START_DATE in config.ts) and today, plus 1, clamped to
// 1–7. Before the start: tutorial and countdown. After day 7: archive and an
// end message. The streak only grows on a win of the daily heist on the same
// day; a day without a win resets it.
//
// Day arithmetic never divides elapsed milliseconds by 24 h: it builds both
// dates from their LOCAL calendar components through Date.UTC, so a 23 h or
// 25 h daylight-saving day cannot shift the day index. The countdown to the
// next heist uses the local Date constructor, which absorbs DST the same way.
// The streak is persisted under `yapcorp:streak` through YapStorage (A2).
import { YAP_TEST_START_DATE } from './config';
import { YapStorage } from './storage';

/** Streak storage key, relative — YapStorage adds the `yapcorp:` prefix. */
export const YAP_STREAK_KEY = 'streak';

/** The test week lasts 7 days: 7 daily heists, one per test day. */
export const YAP_WEEK_DAYS = 7;

const MS_PER_DAY = 86_400_000;
const ISO_DATE_RE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

/** Where `now` stands relative to the test week. */
export type YapDailyPhase = 'before' | 'week' | 'after';

/** Today's heist. */
export interface YapDailyInfo {
  phase: YapDailyPhase;
  /** Local day of the test week, 1-based, clamped to 1..7. */
  day: number;
  /** Unclamped day index: 0 or less before the start, above 7 after the last day. */
  rawDay: number;
  /** Milliseconds until the next heist starts; 0 when there is none (day 7 and after). */
  msUntilNextHeist: number;
}

/** Persisted streak (spec's pc1:streak: current, best, last day won). */
export interface YapStreak {
  current: number;
  best: number;
  /** Local day index of the last win, 0 when the daily heist was never won. */
  lastDayWon: number;
}

/** Parse an ISO yyyy-mm-dd date into calendar components, rejecting invalid dates. */
export function parseYapDate(iso: string): { year: number; month: number; day: number } {
  const groups = ISO_DATE_RE.exec(iso)?.groups;
  const year = groups?.year;
  const month = groups?.month;
  const day = groups?.day;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`YapDaily: invalid ISO date "${iso}" (expected yyyy-mm-dd)`);
  }
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  // Reject impossible dates (2025-02-30, month 13…) instead of letting
  // Date.UTC roll them over into the next month.
  const rolled = new Date(Date.UTC(y, m - 1, d));
  if (
    rolled.getUTCFullYear() !== y ||
    rolled.getUTCMonth() !== m - 1 ||
    rolled.getUTCDate() !== d
  ) {
    throw new Error(`YapDaily: invalid ISO date "${iso}"`);
  }
  return { year: y, month: m, day: d };
}

/**
 * Local calendar date of `date` as a day count since the epoch: Date.UTC of
 * the LOCAL year/month/day. Calendar days, not 24 h slices — DST-proof.
 */
export function yapLocalDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

/** Day count of the test start date, from its ISO yyyy-mm-dd form. */
export function yapStartDayNumber(startDate: string): number {
  const { year, month, day } = parseYapDate(startDate);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Raw day index: local calendar days between the start date and `now`, plus 1. */
export function yapRawDay(now: Date, startDate: string = YAP_TEST_START_DATE): number {
  return yapLocalDayNumber(now) - yapStartDayNumber(startDate) + 1;
}

/** Phase of the test week for a raw day index. */
export function yapPhase(rawDay: number): YapDailyPhase {
  if (rawDay < 1) return 'before';
  if (rawDay > YAP_WEEK_DAYS) return 'after';
  return 'week';
}

/** Next local midnight after `now` (the local constructor absorbs 23 h / 25 h DST days). */
export function yapNextMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

/**
 * Instant at which the next heist starts: the start date at local midnight
 * before the week, the next local midnight during days 1–6, and null on day 7
 * and after (the week is over: archive and end message, no next heist).
 */
export function yapNextHeistAt(now: Date, startDate: string = YAP_TEST_START_DATE): Date | null {
  const rawDay = yapRawDay(now, startDate);
  if (rawDay >= YAP_WEEK_DAYS) return null;
  if (rawDay < 1) {
    const { year, month, day } = parseYapDate(startDate);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return yapNextMidnight(now);
}

/** Milliseconds until the next heist starts; 0 when there is none. */
export function yapMsUntilNextHeist(now: Date, startDate: string = YAP_TEST_START_DATE): number {
  const next = yapNextHeistAt(now, startDate);
  if (next === null) return 0;
  return Math.max(0, next.getTime() - now.getTime());
}

/** Today's heist: phase, clamped day and countdown to the next one. */
export function yapDailyInfo(now: Date, startDate: string = YAP_TEST_START_DATE): YapDailyInfo {
  const rawDay = yapRawDay(now, startDate);
  return {
    phase: yapPhase(rawDay),
    day: Math.min(YAP_WEEK_DAYS, Math.max(1, rawDay)),
    rawDay,
    msUntilNextHeist: yapMsUntilNextHeist(now, startDate),
  };
}

const YAP_NO_STREAK: YapStreak = { current: 0, best: 0, lastDayWon: 0 };

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Read the persisted streak, sanitizing missing or corrupted values. */
export function loadYapStreak(storage: YapStorage): YapStreak {
  const raw: unknown = storage.getJson<unknown>(YAP_STREAK_KEY, null);
  if (raw === null || typeof raw !== 'object') return { ...YAP_NO_STREAK };
  const record = raw as Record<string, unknown>;
  return {
    current: nonNegativeInt(record.current),
    best: nonNegativeInt(record.best),
    lastDayWon: nonNegativeInt(record.lastDayWon),
  };
}

/**
 * Effective streak on the local day of `now`: it stays alive when the last win
 * was today or yesterday, and a day without a win resets it to 0. Outside the
 * test week (before the start, after day 7) there is no active streak.
 */
export function yapEffectiveStreak(
  stored: YapStreak,
  now: Date,
  startDate: string = YAP_TEST_START_DATE,
): YapStreak {
  const rawDay = yapRawDay(now, startDate);
  const alive =
    rawDay >= 1 &&
    rawDay <= YAP_WEEK_DAYS &&
    stored.lastDayWon >= 1 &&
    stored.lastDayWon >= rawDay - 1;
  return { ...stored, current: alive ? stored.current : 0 };
}

/**
 * Record a win on the daily heist of the local day of `now` and persist the
 * streak. Only wins during the test week count: before the start there is only
 * the tutorial, after day 7 only the archive — both leave the streak alone.
 * A win on a day already won does not grow the streak (same-day wins count
 * once); a win on the day after the last win grows it by one; any other win
 * restarts it at 1.
 */
export function recordYapWin(
  storage: YapStorage,
  now: Date,
  startDate: string = YAP_TEST_START_DATE,
): YapStreak {
  const rawDay = yapRawDay(now, startDate);
  const stored = loadYapStreak(storage);
  if (rawDay < 1 || rawDay > YAP_WEEK_DAYS) {
    return yapEffectiveStreak(stored, now, startDate);
  }
  let current: number;
  if (stored.lastDayWon >= rawDay) {
    current = stored.current; // same-day win (or clock skew): counts once
  } else if (stored.lastDayWon === rawDay - 1) {
    current = stored.current + 1; // consecutive day
  } else {
    current = 1; // first win of the week, or a day was skipped
  }
  const next: YapStreak = {
    current,
    best: Math.max(stored.best, current),
    lastDayWon: Math.max(stored.lastDayWon, rawDay),
  };
  storage.setJson(YAP_STREAK_KEY, next);
  return next;
}

/** Daily loop: today's heist, countdown and streak (story D1). */
export class YapDaily {
  constructor(
    private readonly storage: YapStorage,
    readonly startDate: string = YAP_TEST_START_DATE,
  ) {}

  /** Today's heist: phase, clamped day and countdown to the next one. */
  info(now: Date): YapDailyInfo {
    return yapDailyInfo(now, this.startDate);
  }

  /** Effective streak on the local day of `now` (a day without a win resets it). */
  streak(now: Date): YapStreak {
    return yapEffectiveStreak(loadYapStreak(this.storage), now, this.startDate);
  }

  /** Record a win on today's daily heist and persist the streak. */
  recordWin(now: Date): YapStreak {
    return recordYapWin(this.storage, now, this.startDate);
  }
}
