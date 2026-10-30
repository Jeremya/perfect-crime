// Unit tests for story D2: the pure app flow (src/app/router.ts). First
// launch goes straight to tutorial T1 (no title screen), a known player lands
// on Home, the tutorial chains T1 → T2 → T3 → T4 → T5 and the end of the full
// tutorial lands on Home. Daily wins are recorded per day (winning attempt,
// best ticks, stars) for Home to display, and only a win on the heist of the
// same local day feeds the D1 streak. Storage is the in-memory YapStorage
// fallback, so nothing here touches a real localStorage.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YAP_CORP } from '../../src/app/brand';
import { YAP_PROFILE_KEY, loadYapProfile } from '../../src/app/config';
import { loadYapStreak } from '../../src/app/daily';
import { parseLevel } from '../../src/core/level';
import {
  YAP_APP_OPEN_RETURN_MS,
  YAP_DAYS_KEY,
  YAP_LEVELS_KEY,
  YAP_TUTORIAL_SEQUENCE,
  loadYapDays,
  loadYapTutorialProgress,
  recordYapDailyWin,
  recordYapTutorialCleared,
  yapBootRoute,
  yapCountdownParts,
  yapDailyRoute,
  yapFormatClock,
  yapHomeModel,
  yapIsFirstOpen,
  yapIsKnownPlayer,
  yapIsReturnToForeground,
  yapLevelById,
  yapRouteAfterWin,
  yapTutorialRoute,
  type YapDailyWin,
} from '../../src/app/router';
import { YapStorage } from '../../src/app/storage';

const START = '2025-11-03';
/** Local noon of a test-week day (day 1 = the start date). */
function weekDay(day: number, hour = 12): Date {
  return new Date(2025, 10, 2 + day, hour, 0, 0, 0);
}

function memory(): YapStorage {
  return new YapStorage(null);
}

const WIN: YapDailyWin = {
  attempts: 3,
  ticks: 20,
  stars: 2,
  hints: 0,
  causes: ['guard', 'laser'],
  par: 20,
  plan: ['E', 'E', 'S'],
};

describe('level catalog (levels/levels.json)', () => {
  it('holds the 5 tutorial levels and the 7 daily heists', () => {
    for (const id of YAP_TUTORIAL_SEQUENCE) expect(yapLevelById(id), id).not.toBeNull();
    for (let day = 1; day <= 7; day += 1) {
      expect(yapLevelById(yapDailyRoute(day).levelId), `day ${day}`).not.toBeNull();
    }
    expect(yapLevelById('daily/d8')).toBeNull();
    expect(yapLevelById('nope')).toBeNull();
  });

  it('serves exactly the level parsed from the .lvl source', () => {
    const source = readFileSync(new URL('../../levels/tutorial/t1.lvl', import.meta.url), 'utf8');
    expect(yapLevelById('tutorial/t1')).toEqual(parseLevel(source, 'levels/tutorial/t1.lvl'));
  });
});

describe('boot route', () => {
  it('first launch opens tutorial T1 directly (no title screen)', () => {
    expect(yapBootRoute(memory())).toEqual({
      kind: 'level',
      levelId: 'tutorial/t1',
      mode: 'tutorial',
      day: 0,
    });
  });

  it('an unfinished tutorial resumes at the first level not cleared yet', () => {
    const storage = memory();
    recordYapTutorialCleared(storage, 'tutorial/t1');
    recordYapTutorialCleared(storage, 'tutorial/t2');
    expect(yapIsKnownPlayer(storage)).toBe(false);
    expect(yapBootRoute(storage)).toMatchObject({ kind: 'level', levelId: 'tutorial/t3' });
  });

  it('a known player (full tutorial done) lands on Home', () => {
    const storage = memory();
    for (const id of YAP_TUTORIAL_SEQUENCE) recordYapTutorialCleared(storage, id);
    expect(yapIsKnownPlayer(storage)).toBe(true);
    expect(yapBootRoute(storage)).toEqual({ kind: 'home' });
  });

  it('a player with a recorded daily heist is known too', () => {
    const storage = memory();
    recordYapDailyWin(storage, 2, WIN, weekDay(2), START);
    expect(yapBootRoute(storage)).toEqual({ kind: 'home' });
  });

  it('survives corrupted progress (treated as a first launch)', () => {
    const storage = memory();
    storage.set(YAP_LEVELS_KEY, '{not json');
    storage.set(YAP_DAYS_KEY, '[1,2]');
    expect(yapBootRoute(storage)).toMatchObject({ levelId: 'tutorial/t1' });
  });
});

describe('tutorial chaining', () => {
  it('chains T1 → T2 → T3 → T4 → T5, then Home', () => {
    const visited: string[] = [];
    let route = yapTutorialRoute(loadYapTutorialProgress(memory()));
    for (;;) {
      visited.push(route.levelId);
      const next = yapRouteAfterWin(route);
      if (next.kind === 'home') break;
      route = next;
    }
    expect(visited).toEqual([...YAP_TUTORIAL_SEQUENCE]);
  });

  it('a daily win goes back to Home', () => {
    expect(yapRouteAfterWin(yapDailyRoute(3))).toEqual({ kind: 'home' });
  });

  it('marks the tutorial done only once T1…T5 are all cleared', () => {
    const storage = memory();
    for (const id of YAP_TUTORIAL_SEQUENCE.slice(0, 4)) {
      expect(recordYapTutorialCleared(storage, id).done).toBe(false);
    }
    expect(recordYapTutorialCleared(storage, 'tutorial/t5').done).toBe(true);
    expect(loadYapTutorialProgress(storage)).toEqual({
      cleared: [...YAP_TUTORIAL_SEQUENCE],
      done: true,
    });
  });

  it('persists progress under the yapcorp: prefix and ignores unknown ids', () => {
    const backend = new Map<string, string>();
    const storage = new YapStorage({
      getItem: (k) => backend.get(k) ?? null,
      setItem: (k, v) => void backend.set(k, v),
      removeItem: (k) => void backend.delete(k),
    });
    recordYapTutorialCleared(storage, 'tutorial/t1');
    recordYapTutorialCleared(storage, 'tutorial/t1');
    recordYapTutorialCleared(storage, 'daily/d1');
    expect(JSON.parse(backend.get(`${YAP_CORP.storagePrefix}levels`) ?? 'null')).toEqual({
      cleared: ['tutorial/t1'],
      done: false,
    });
  });

  it('the Home Tutorial button resumes the tutorial, or replays T1 once done', () => {
    const storage = memory();
    recordYapTutorialCleared(storage, 'tutorial/t1');
    expect(yapTutorialRoute(loadYapTutorialProgress(storage)).levelId).toBe('tutorial/t2');
    for (const id of YAP_TUTORIAL_SEQUENCE) recordYapTutorialCleared(storage, id);
    expect(yapTutorialRoute(loadYapTutorialProgress(storage)).levelId).toBe('tutorial/t1');
  });
});

describe('daily progress', () => {
  it('records the first win of the day (winning attempt, ticks, stars)', () => {
    const storage = memory();
    const result = recordYapDailyWin(storage, 3, WIN, weekDay(3), START);
    expect(result.firstWin).toBe(true);
    expect(result.record).toEqual({
      winningAttempt: 3,
      bestTicks: 20,
      stars: 2,
      hints: 0,
      causes: ['guard', 'laser'],
      par: 20,
      plan: ['E', 'E', 'S'],
    });
    expect(loadYapDays(storage).get(3)).toEqual(result.record);
  });

  it('keeps the winning plan and its par in the day record (E2 Home share)', () => {
    const storage = memory();
    recordYapDailyWin(storage, 3, WIN, weekDay(3), START);
    const first = loadYapDays(storage).get(3);
    expect(first?.plan).toEqual(['E', 'E', 'S']);
    expect(first?.par).toBe(20);
    // a better replay replaces the plan, a worse one keeps it
    recordYapDailyWin(
      storage,
      3,
      { attempts: 4, ticks: 18, stars: 3, hints: 0, causes: [], par: 18, plan: ['S', 'S'] },
      weekDay(3),
      START,
    );
    expect(loadYapDays(storage).get(3)?.plan).toEqual(['S', 'S']);
    recordYapDailyWin(
      storage,
      3,
      { attempts: 5, ticks: 25, stars: 1, hints: 0, causes: [], par: 25, plan: ['W'] },
      weekDay(3),
      START,
    );
    expect(loadYapDays(storage).get(3)?.bestTicks).toBe(18);
    expect(loadYapDays(storage).get(3)?.plan).toEqual(['S', 'S']);
  });

  it('a replay improves ticks and stars, never the winning attempt', () => {
    const storage = memory();
    recordYapDailyWin(storage, 3, WIN, weekDay(3), START);
    const replay = recordYapDailyWin(
      storage,
      3,
      { attempts: 1, ticks: 18, stars: 3, hints: 0, causes: [] },
      weekDay(3),
      START,
    );
    expect(replay.firstWin).toBe(false);
    expect(replay.record).toMatchObject({ winningAttempt: 3, bestTicks: 18, stars: 3 });
    const worse = recordYapDailyWin(
      storage,
      3,
      { attempts: 1, ticks: 30, stars: 1, hints: 0, causes: [] },
      weekDay(3),
      START,
    );
    expect(worse.record).toMatchObject({ winningAttempt: 3, bestTicks: 18, stars: 3 });
  });

  it('feeds the streak only for a win on the heist of the same local day', () => {
    const storage = memory();
    expect(recordYapDailyWin(storage, 1, WIN, weekDay(1), START).streak).toBe(1);
    expect(recordYapDailyWin(storage, 2, WIN, weekDay(2), START).streak).toBe(2);
    // day 3's heist finished after midnight (day 4): recorded, streak untouched
    const late = recordYapDailyWin(storage, 3, WIN, weekDay(4, 0), START);
    expect(late.streak).toBeNull();
    expect(loadYapDays(storage).get(3)).toBeDefined();
    expect(loadYapStreak(storage)).toMatchObject({ current: 2, lastDayWon: 2 });
  });

  it('drops corrupted day records', () => {
    const storage = memory();
    storage.setJson(YAP_DAYS_KEY, {
      '2': { winningAttempt: 2, bestTicks: 19, stars: 3, hints: 0, causes: ['camera'] },
      '3': { winningAttempt: 'x' },
      '9': { winningAttempt: 1, bestTicks: 10, stars: 3, hints: 0, causes: [] },
    });
    const days = loadYapDays(storage);
    expect([...days.keys()]).toEqual([2]);
  });
});

describe('Home model', () => {
  it('during the week: heist number, to do, streak, countdown, Play', () => {
    const model = yapHomeModel(memory(), weekDay(3), START);
    expect(model.phase).toBe('week');
    expect(model.day).toBe(3);
    expect(model.record).toBeNull();
    expect(model.streak).toBe(0);
    expect(model.msUntilNextHeist).toBe(12 * 3_600_000);
    expect(model.play).toEqual({ kind: 'level', levelId: 'daily/d3', mode: 'daily', day: 3 });
    expect(model.canShare).toBe(false);
  });

  it('once cleared: attempts and stars, the live streak, and Share', () => {
    const storage = memory();
    recordYapDailyWin(storage, 2, WIN, weekDay(2), START);
    recordYapDailyWin(storage, 3, WIN, weekDay(3), START);
    const model = yapHomeModel(storage, weekDay(3, 18), START);
    expect(model.record).toMatchObject({ winningAttempt: 3, stars: 2 });
    expect(model.streak).toBe(2);
    expect(model.canShare).toBe(true);
    expect(model.play?.levelId).toBe('daily/d3');
  });

  it('a skipped day resets the displayed streak', () => {
    const storage = memory();
    recordYapDailyWin(storage, 1, WIN, weekDay(1), START);
    expect(yapHomeModel(storage, weekDay(3), START).streak).toBe(0);
  });

  it('before the week: no heist to play, countdown to the start, tutorial', () => {
    const model = yapHomeModel(memory(), new Date(2025, 10, 2, 12), START);
    expect(model.phase).toBe('before');
    expect(model.play).toBeNull();
    expect(model.canShare).toBe(false);
    expect(model.msUntilNextHeist).toBe(12 * 3_600_000);
    expect(model.tutorial.levelId).toBe('tutorial/t1');
  });

  it('after the week: no heist, no countdown, best streak kept', () => {
    const storage = memory();
    recordYapDailyWin(storage, 6, WIN, weekDay(6), START);
    recordYapDailyWin(storage, 7, WIN, weekDay(7), START);
    const model = yapHomeModel(storage, weekDay(9), START);
    expect(model.phase).toBe('after');
    expect(model.play).toBeNull();
    expect(model.canShare).toBe(false);
    expect(model.msUntilNextHeist).toBe(0);
    expect(model.streak).toBe(0);
    expect(model.bestStreak).toBe(2);
  });

  it('day 7 has no next heist', () => {
    expect(yapHomeModel(memory(), weekDay(7), START).msUntilNextHeist).toBe(0);
  });
});

describe('countdown formatting', () => {
  it('splits milliseconds into days and a zero-padded clock', () => {
    const parts = yapCountdownParts(((26 * 60 + 5) * 60 + 9) * 1000 + 400);
    expect(parts).toEqual({ days: 1, hours: 2, minutes: 5, seconds: 10 });
    expect(yapFormatClock(parts)).toBe('02:05:10');
    expect(yapCountdownParts(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(yapCountdownParts(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('app_open', () => {
  it('is a first open until the profile exists', () => {
    const storage = memory();
    expect(yapIsFirstOpen(storage)).toBe(true);
    loadYapProfile(storage);
    expect(storage.get(YAP_PROFILE_KEY)).not.toBeNull();
    expect(yapIsFirstOpen(storage)).toBe(false);
  });

  it('counts a return to the foreground after 30 min in the background', () => {
    expect(YAP_APP_OPEN_RETURN_MS).toBe(30 * 60_000);
    expect(yapIsReturnToForeground(1_000, 1_000 + 30 * 60_000)).toBe(true);
    expect(yapIsReturnToForeground(1_000, 1_000 + 30 * 60_000 - 1)).toBe(false);
    expect(yapIsReturnToForeground(null, 99 * 60_000)).toBe(false);
  });
});
