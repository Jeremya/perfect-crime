// Unit tests for story D1: daily logic — which heist is "today" (local day
// from YAP_TEST_START_DATE, midnight rollover), countdown to the next heist,
// streak counting (only same-day wins count, a day without a win resets it)
// and the behaviour before / after the test week. Day arithmetic is done on
// local calendar dates (Date.UTC of the local y/m/d), so 23 h / 25 h
// daylight-saving days never shift the day index; the tests below set
// process.env.TZ to Europe/Paris and America/Chicago around the 2025 DST
// transitions to prove it.
import { afterEach, describe, expect, it } from 'vitest';
import { YAP_CORP } from '../../src/app/brand';
import { YAP_TEST_START_DATE } from '../../src/app/config';
import {
  YapDaily,
  YAP_STREAK_KEY,
  YAP_WEEK_DAYS,
  loadYapStreak,
  recordYapWin,
  yapDailyInfo,
  yapMsUntilNextHeist,
  yapRawDay,
} from '../../src/app/daily';
import { YapStorage, type YapStorageBackend } from '../../src/app/storage';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 25 h day (fall back) minus 500 ms. */
const H25_MINUS_500MS = 25 * HOUR - 500;
/** 23 h day (spring forward) minus 500 ms. */
const H23_MINUS_500MS = 23 * HOUR - 500;

/** In-memory backend that behaves like a healthy localStorage. */
class FakeBackend implements YapStorageBackend {
  readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

/** Local date-time in the timezone currently set through process.env.TZ. */
function at(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, second, ms);
}

const ORIGINAL_TZ = process.env.TZ;

/** Switch the process timezone (Node applies process.env.TZ at runtime on POSIX). */
function useTz(tz: string): void {
  process.env.TZ = tz;
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('day index and midnight rollover (Europe/Paris, test week 2025-11-03)', () => {
  it('starts the test week on a Monday: 2025-11-03 is day 1', () => {
    useTz('Europe/Paris');
    expect(at(2025, 11, 3).getDay()).toBe(1); // Monday
    expect(YAP_TEST_START_DATE).toBe('2025-11-03');
    expect(YAP_WEEK_DAYS).toBe(7);
  });

  it('is "before" the day before the start, even at 23:59:59.999', () => {
    useTz('Europe/Paris');
    const info = yapDailyInfo(at(2025, 11, 2, 23, 59, 59, 999));
    expect(info.phase).toBe('before');
    expect(info.rawDay).toBe(0);
    expect(info.day).toBe(1); // clamped to 1..7
    expect(info.msUntilNextHeist).toBe(1); // 1 ms until the first heist
  });

  it('rolls over to day 1 exactly at local midnight', () => {
    useTz('Europe/Paris');
    const info = yapDailyInfo(at(2025, 11, 3, 0, 0, 0, 0));
    expect(info.phase).toBe('week');
    expect(info.rawDay).toBe(1);
    expect(info.day).toBe(1);
    expect(info.msUntilNextHeist).toBe(DAY); // next heist: tomorrow midnight
  });

  it('counts one heist per local calendar day through the whole week', () => {
    useTz('Europe/Paris');
    expect(yapRawDay(at(2025, 11, 3, 12))).toBe(1);
    expect(yapRawDay(at(2025, 11, 4, 0))).toBe(2);
    expect(yapRawDay(at(2025, 11, 5, 23, 59, 59, 999))).toBe(3);
    expect(yapRawDay(at(2025, 11, 9, 12))).toBe(7);
    expect(yapDailyInfo(at(2025, 11, 9, 23, 59, 59, 999)).day).toBe(7);
  });

  it('is "after" the week from day 8 (2025-11-10 midnight), day clamped to 7', () => {
    useTz('Europe/Paris');
    const info = yapDailyInfo(at(2025, 11, 10, 0, 0, 0, 0));
    expect(info.phase).toBe('after');
    expect(info.rawDay).toBe(8);
    expect(info.day).toBe(7);
    expect(info.msUntilNextHeist).toBe(0); // no next heist after day 7
  });

  it('counts down to the first heist before the start', () => {
    useTz('Europe/Paris');
    expect(yapMsUntilNextHeist(at(2025, 11, 1, 0))).toBe(2 * DAY); // 48 h before 2025-11-03
    expect(yapMsUntilNextHeist(at(2025, 11, 2, 12))).toBe(12 * HOUR);
  });

  it('counts down to the next midnight during the week, and 0 on the last day', () => {
    useTz('Europe/Paris');
    expect(yapMsUntilNextHeist(at(2025, 11, 3, 12))).toBe(12 * HOUR);
    expect(yapMsUntilNextHeist(at(2025, 11, 8, 0))).toBe(DAY); // day 6 -> day 7
    expect(yapMsUntilNextHeist(at(2025, 11, 9, 12))).toBe(0); // day 7: no heist #8
  });
});

describe('daylight saving — Europe/Paris', () => {
  it('keeps the day index correct across the 25 h fall-back day (2025-10-26)', () => {
    useTz('Europe/Paris');
    // Week starting 2025-10-20 (Monday): 2025-10-26 is day 7, a 25 h day.
    expect(yapRawDay(at(2025, 10, 25, 23, 59, 59, 999), '2025-10-20')).toBe(6);
    expect(yapRawDay(at(2025, 10, 26, 0, 0, 0, 0), '2025-10-20')).toBe(7);
    expect(yapRawDay(at(2025, 10, 27, 0, 0, 0, 0), '2025-10-20')).toBe(8);
    expect(yapDailyInfo(at(2025, 10, 27, 0), '2025-10-20').phase).toBe('after');
    // One local calendar day apart, even though the day is 25 h long.
    expect(
      yapRawDay(at(2025, 10, 26, 12), '2025-10-20') - yapRawDay(at(2025, 10, 25, 12), '2025-10-20'),
    ).toBe(1);
  });

  it('counts down 25 h (not 24 h) to the next midnight on the fall-back day', () => {
    useTz('Europe/Paris');
    // Week starting Tuesday 2025-10-21: 2025-10-26 is day 6, a 25 h day.
    // 2025-10-26 00:00:00.500 local is still CEST; next midnight is CET: 25 h - 500 ms.
    expect(yapRawDay(at(2025, 10, 26, 0, 0, 0, 500), '2025-10-21')).toBe(6);
    expect(yapMsUntilNextHeist(at(2025, 10, 26, 0, 0, 0, 500), '2025-10-21')).toBe(H25_MINUS_500MS);
  });

  it('keeps the day index correct across the 23 h spring-forward day (2025-03-30)', () => {
    useTz('Europe/Paris');
    // Week starting 2025-03-24 (Monday): 2025-03-30 is day 7, a 23 h day.
    expect(yapRawDay(at(2025, 3, 29, 23, 59, 59, 999), '2025-03-24')).toBe(6);
    expect(yapRawDay(at(2025, 3, 30, 0, 0, 0, 0), '2025-03-24')).toBe(7);
    expect(yapRawDay(at(2025, 3, 31, 0, 0, 0, 0), '2025-03-24')).toBe(8);
    expect(
      yapRawDay(at(2025, 3, 30, 12), '2025-03-24') - yapRawDay(at(2025, 3, 29, 12), '2025-03-24'),
    ).toBe(1);
  });

  it('counts down 23 h (not 24 h) to the next midnight on the spring-forward day', () => {
    useTz('Europe/Paris');
    // Week starting Tuesday 2025-03-25: 2025-03-30 is day 6, a 23 h day.
    // 2025-03-30 00:00:00.500 local is CET; next midnight is CEST: 23 h - 500 ms.
    expect(yapRawDay(at(2025, 3, 30, 0, 0, 0, 500), '2025-03-25')).toBe(6);
    expect(yapMsUntilNextHeist(at(2025, 3, 30, 0, 0, 0, 500), '2025-03-25')).toBe(H23_MINUS_500MS);
  });

  it('counts down to the first heist across the fall-back day with the real start date', () => {
    useTz('Europe/Paris');
    // 2025-10-26 00:00:00.500 local is still CEST (UTC+2); the first heist,
    // 2025-11-03 00:00 CET (UTC+1), is 8 days + 1 h - 500 ms away — not 8 × 24 h.
    expect(yapRawDay(at(2025, 10, 26, 0, 0, 0, 500))).toBe(-7);
    expect(yapDailyInfo(at(2025, 10, 26, 0, 0, 0, 500)).phase).toBe('before');
    expect(yapMsUntilNextHeist(at(2025, 10, 26, 0, 0, 0, 500))).toBe(8 * DAY + HOUR - 500);
    expect(yapMsUntilNextHeist(at(2025, 10, 26, 12))).toBe(7 * DAY + 12 * HOUR);
  });
});

describe('daylight saving — America/Chicago', () => {
  it('keeps the day index correct across the 25 h fall-back day (2025-11-02, the day before the test week)', () => {
    useTz('America/Chicago');
    expect(yapRawDay(at(2025, 11, 2, 23, 59, 59, 999))).toBe(0);
    expect(yapDailyInfo(at(2025, 11, 2, 23, 59, 59, 999)).phase).toBe('before');
    expect(yapRawDay(at(2025, 11, 3, 0, 0, 0, 0))).toBe(1);
    expect(yapDailyInfo(at(2025, 11, 3, 0, 0, 0, 0)).phase).toBe('week');
    expect(yapRawDay(at(2025, 11, 3, 12)) - yapRawDay(at(2025, 11, 2, 12))).toBe(1);
  });

  it('counts down 25 h (not 24 h) to the first heist on the fall-back day', () => {
    useTz('America/Chicago');
    // 2025-11-02 00:00:00.500 local is still CDT; 2025-11-03 00:00 is CST: 25 h - 500 ms.
    expect(yapMsUntilNextHeist(at(2025, 11, 2, 0, 0, 0, 500))).toBe(H25_MINUS_500MS);
    expect(yapMsUntilNextHeist(at(2025, 11, 2, 12))).toBe(12 * HOUR);
    expect(yapMsUntilNextHeist(at(2025, 11, 3, 0))).toBe(DAY);
  });

  it('keeps the day index correct across the 23 h spring-forward day (2025-03-09)', () => {
    useTz('America/Chicago');
    // Week starting 2025-03-03 (Monday): 2025-03-09 is day 7, a 23 h day.
    expect(yapRawDay(at(2025, 3, 8, 23, 59, 59, 999), '2025-03-03')).toBe(6);
    expect(yapRawDay(at(2025, 3, 9, 0, 0, 0, 0), '2025-03-03')).toBe(7);
    expect(yapRawDay(at(2025, 3, 10, 0, 0, 0, 0), '2025-03-03')).toBe(8);
    // Week starting Tuesday 2025-03-04: 2025-03-09 is day 6, so the next heist
    // exists — 2025-03-09 00:00:00.500 CST to 2025-03-10 00:00 CDT is 23 h - 500 ms.
    expect(yapRawDay(at(2025, 3, 9, 0, 0, 0, 500), '2025-03-04')).toBe(6);
    expect(yapMsUntilNextHeist(at(2025, 3, 9, 0, 0, 0, 500), '2025-03-04')).toBe(H23_MINUS_500MS);
  });
});

describe('streak', () => {
  it('starts at zero and is stored under yapcorp:streak', () => {
    useTz('Europe/Paris');
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    const daily = new YapDaily(storage);
    expect(daily.streak(at(2025, 11, 3, 10))).toEqual({ current: 0, best: 0, lastDayWon: 0 });
    expect(storage.key(YAP_STREAK_KEY)).toBe(`${YAP_CORP.storagePrefix}streak`);
    expect(backend.entries.has(`${YAP_CORP.storagePrefix}streak`)).toBe(false);
  });

  it('grows by one on a win of a new consecutive day, and only once per day', () => {
    useTz('Europe/Paris');
    const storage = new YapStorage(new FakeBackend());
    const daily = new YapDaily(storage);
    expect(daily.recordWin(at(2025, 11, 3, 10))).toEqual({ current: 1, best: 1, lastDayWon: 1 });
    // Same-day win again: the streak does not grow twice.
    expect(daily.recordWin(at(2025, 11, 3, 22))).toEqual({ current: 1, best: 1, lastDayWon: 1 });
    // Next day: consecutive win.
    expect(daily.recordWin(at(2025, 11, 4, 0, 0, 0, 1))).toEqual({
      current: 2,
      best: 2,
      lastDayWon: 2,
    });
    expect(daily.recordWin(at(2025, 11, 4, 23))).toEqual({ current: 2, best: 2, lastDayWon: 2 });
    expect(daily.recordWin(at(2025, 11, 5, 9))).toEqual({ current: 3, best: 3, lastDayWon: 3 });
    // Persisted under the yapcorp: prefix.
    const backend = new FakeBackend();
    const storage2 = new YapStorage(backend);
    recordYapWin(storage2, at(2025, 11, 3, 10));
    expect(JSON.parse(backend.entries.get(`${YAP_CORP.storagePrefix}streak`) ?? '')).toEqual({
      current: 1,
      best: 1,
      lastDayWon: 1,
    });
  });

  it('resets when a day passes without a win', () => {
    useTz('Europe/Paris');
    const storage = new YapStorage(new FakeBackend());
    const daily = new YapDaily(storage);
    daily.recordWin(at(2025, 11, 3, 10)); // day 1
    daily.recordWin(at(2025, 11, 4, 10)); // day 2 -> streak 2
    // On day 3 the streak is still alive (won yesterday).
    expect(daily.streak(at(2025, 11, 5, 12))).toEqual({ current: 2, best: 2, lastDayWon: 2 });
    // On day 4, day 3 had no win: the streak is reset.
    expect(daily.streak(at(2025, 11, 6, 12))).toEqual({ current: 0, best: 2, lastDayWon: 2 });
    // A win on day 4 starts a new streak at 1; the best is kept.
    expect(daily.recordWin(at(2025, 11, 6, 12))).toEqual({ current: 1, best: 2, lastDayWon: 4 });
  });

  it('ignores wins before the test week (tutorial only) and after day 7 (archive)', () => {
    useTz('Europe/Paris');
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    const daily = new YapDaily(storage);
    // Before the start: no effect, nothing persisted.
    expect(daily.recordWin(at(2025, 11, 2, 12))).toEqual({ current: 0, best: 0, lastDayWon: 0 });
    expect(storage.get(YAP_STREAK_KEY)).toBeNull();
    // Win the last day, then "play" an archived day: the stored streak is untouched.
    expect(daily.recordWin(at(2025, 11, 9, 8))).toEqual({ current: 1, best: 1, lastDayWon: 7 });
    expect(daily.recordWin(at(2025, 11, 10, 8))).toEqual({ current: 0, best: 1, lastDayWon: 7 });
    expect(daily.streak(at(2025, 11, 10, 8))).toEqual({ current: 0, best: 1, lastDayWon: 7 });
    expect(JSON.parse(backend.entries.get(`${YAP_CORP.storagePrefix}streak`) ?? '')).toEqual({
      current: 1,
      best: 1,
      lastDayWon: 7,
    });
  });

  it('counts consecutive days correctly across a DST change (Europe/Paris, 25 h day)', () => {
    useTz('Europe/Paris');
    const storage = new YapStorage(new FakeBackend());
    const daily = new YapDaily(storage, '2025-10-20'); // 2025-10-26 is day 7, a 25 h day
    expect(daily.recordWin(at(2025, 10, 25, 12))).toEqual({ current: 1, best: 1, lastDayWon: 6 });
    // Day 7 is a new local day even though 2025-10-26 is 25 h long.
    expect(daily.recordWin(at(2025, 10, 26, 12))).toEqual({ current: 2, best: 2, lastDayWon: 7 });
  });

  it('counts consecutive days correctly across a DST change (America/Chicago, 25 h day)', () => {
    useTz('America/Chicago');
    const storage = new YapStorage(new FakeBackend());
    const daily = new YapDaily(storage, '2025-10-27'); // 2025-11-02 is day 7, a 25 h day
    expect(daily.recordWin(at(2025, 11, 1, 12))).toEqual({ current: 1, best: 1, lastDayWon: 6 });
    expect(daily.recordWin(at(2025, 11, 2, 12))).toEqual({ current: 2, best: 2, lastDayWon: 7 });
  });

  it('recovers from a corrupted stored streak', () => {
    useTz('Europe/Paris');
    const storage = new YapStorage(new FakeBackend());
    storage.set(YAP_STREAK_KEY, '{not json');
    expect(loadYapStreak(storage)).toEqual({ current: 0, best: 0, lastDayWon: 0 });
    storage.setJson(YAP_STREAK_KEY, { current: 'lots', best: -3, lastDayWon: 2.5 });
    expect(loadYapStreak(storage)).toEqual({ current: 0, best: 0, lastDayWon: 0 });
    storage.setJson(YAP_STREAK_KEY, { current: 4, best: 9, lastDayWon: 3 });
    expect(loadYapStreak(storage)).toEqual({ current: 4, best: 9, lastDayWon: 3 });
  });
});

describe('YapDaily class and input validation', () => {
  it('uses YAP_TEST_START_DATE by default and matches the pure functions', () => {
    useTz('Europe/Paris');
    const storage = new YapStorage(new FakeBackend());
    const daily = new YapDaily(storage);
    expect(daily.startDate).toBe(YAP_TEST_START_DATE);
    const now = at(2025, 11, 5, 15, 30);
    expect(daily.info(now)).toEqual(yapDailyInfo(now));
    expect(daily.info(now).day).toBe(3);
    daily.recordWin(now);
    expect(daily.streak(now)).toEqual({ current: 1, best: 1, lastDayWon: 3 });
  });

  it('rejects malformed start dates', () => {
    useTz('Europe/Paris');
    const now = at(2025, 11, 3, 12);
    expect(() => yapDailyInfo(now, 'not-a-date')).toThrow();
    expect(() => yapDailyInfo(now, '2025-13-01')).toThrow();
    expect(() => yapDailyInfo(now, '2025-02-30')).toThrow();
    expect(() => yapDailyInfo(now, '2025-11-3')).toThrow();
    expect(yapDailyInfo(now, '2025-11-03').day).toBe(1);
  });
});
