// App flow (story D2): which screen and which level to open, given the stored
// progress. Pure and Phaser-free so the whole flow is unit-tested in node
// (tests/unit/router.test.ts); src/game/home-scene.ts only executes the routes.
//
// Gate 1 spec: there is no title screen — the first launch opens tutorial T1
// directly; a known player lands on Home; the tutorial teaches through five
// short levels chained T1 → T2 → T3 → T4 → T5, and completing the full
// tutorial lands on Home. A player who quits mid-tutorial resumes at the first
// level not cleared yet ("tutorial done" is what makes a player known, as in
// the spec's profile). The express tutorial for link arrivals (T1, T2, T4) is
// story E4's and reuses these routes (see YAP_EXPRESS_TUTORIAL_SEQUENCE below).
// Link arrivals (story E4) are read from the URL: /c/<day>#<payload> — the
// path carries the day, the fragment the E1 payload; the decoded payload is
// stored in the inbox (src/app/inbox.ts, `yapcorp:inbox`) and the fragment is
// stripped from the address bar at launch.
//
// Progress lives under the `yapcorp:` prefix through YapStorage (A2):
//   - `yapcorp:levels` — tutorial progress: cleared level ids + done marker;
//   - `yapcorp:days`   — per test day: winning attempt, best ticks, stars,
//     hints and failure causes, for Home to display (E2 will add the plan).
// The streak itself stays D1's (`yapcorp:streak`, src/app/daily.ts): only a
// win on the heist of the same local day feeds it.
import type { YapLevel } from '../core/level';
import type { YapCause } from '../core/sim';
import { yapStoreIncomingChallenge } from './inbox';
import { YapPayload } from './payload';
import type { YapLevelMode } from './analytics';
import {
  YAP_WEEK_DAYS,
  loadYapStreak,
  recordYapWin,
  yapDailyInfo,
  yapEffectiveStreak,
  yapRawDay,
  type YapDailyPhase,
} from './daily';
import { YAP_PROFILE_KEY, YAP_TEST_START_DATE } from './config';
import type { YapStorage } from './storage';

/** Tutorial progress key, relative — YapStorage adds the `yapcorp:` prefix. */
export const YAP_LEVELS_KEY = 'levels';
/** Per-day results key, relative — YapStorage adds the `yapcorp:` prefix. */
export const YAP_DAYS_KEY = 'days';

/** The full tutorial, in play order (Gate 1 spec, "Tutorial"). */
export const YAP_TUTORIAL_SEQUENCE: readonly string[] = [
  'tutorial/t1',
  'tutorial/t2',
  'tutorial/t3',
  'tutorial/t4',
  'tutorial/t5',
];

// ---------------------------------------------------------------------------
// Level catalog: the generated levels/levels.json (B4), bundled by Vite's
// JSON import — already validated at build time, so nothing is re-parsed.
// ---------------------------------------------------------------------------

interface YapCompiledLevelsJson {
  readonly levels: readonly { readonly id: string; readonly level: YapLevel }[];
}

const yapLevelsModules = import.meta.glob<YapCompiledLevelsJson>('../../levels/levels.json', {
  eager: true,
  import: 'default',
});
const yapCatalog = new Map<string, YapLevel>();
for (const bundle of Object.values(yapLevelsModules)) {
  for (const entry of bundle.levels) yapCatalog.set(entry.id, entry.level);
}

/** A compiled level by id ('tutorial/t1', 'daily/d3'…), or null when unknown. */
export function yapLevelById(id: string): YapLevel | null {
  return yapCatalog.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Open a level: its catalog id, the analytics mode and the heist day (0 = none). */
export interface YapLevelRoute {
  readonly kind: 'level';
  readonly levelId: string;
  readonly mode: YapLevelMode;
  readonly day: number;
  /**
   * E4: set on the express-tutorial levels of a link arrival — the day of the
   * linked heist the chain ends on (yapRouteAfterWin chains T1 → T2 → T4 →
   * that heist).
   */
  readonly expressDay?: number;
  /**
   * E4: set on the route of a link arrival — the sender's anonymous share ID,
   * key of the inbox entry (src/app/inbox.ts) the challenge card reads. The
   * app shell starts the challenge scene (yap-challenge) for such a route.
   */
  readonly challengeShareId?: number;
}
/** Open the Home screen. */
export interface YapHomeRoute {
  readonly kind: 'home';
}
export type YapRoute = YapLevelRoute | YapHomeRoute;

const YAP_HOME: YapHomeRoute = { kind: 'home' };

/** A tutorial level (no heist day). */
export function yapTutorialLevelRoute(levelId: string): YapLevelRoute {
  return { kind: 'level', levelId, mode: 'tutorial', day: 0 };
}

/** The daily heist of test day `day` (1..7). */
export function yapDailyRoute(day: number): YapLevelRoute {
  return { kind: 'level', levelId: `daily/d${day}`, mode: 'daily', day };
}

// ---------------------------------------------------------------------------
// Tutorial progress (`yapcorp:levels`)
// ---------------------------------------------------------------------------

export interface YapTutorialProgress {
  /** Cleared tutorial level ids, in tutorial order. */
  readonly cleared: readonly string[];
  /** The full tutorial was completed once: the player is known. */
  readonly done: boolean;
}

/** Read the tutorial progress, sanitizing missing or corrupted values. */
export function loadYapTutorialProgress(storage: YapStorage): YapTutorialProgress {
  const raw: unknown = storage.getJson<unknown>(YAP_LEVELS_KEY, null);
  if (raw === null || typeof raw !== 'object') return { cleared: [], done: false };
  const record = raw as Record<string, unknown>;
  const stored = Array.isArray(record.cleared) ? (record.cleared as unknown[]) : [];
  const cleared = YAP_TUTORIAL_SEQUENCE.filter((id) => stored.includes(id));
  const done = record.done === true || cleared.length === YAP_TUTORIAL_SEQUENCE.length;
  return { cleared, done };
}

/** Record a cleared tutorial level; the tutorial is done once T1…T5 are all cleared. */
export function recordYapTutorialCleared(
  storage: YapStorage,
  levelId: string,
): YapTutorialProgress {
  const progress = loadYapTutorialProgress(storage);
  if (!YAP_TUTORIAL_SEQUENCE.includes(levelId)) return progress;
  const cleared = YAP_TUTORIAL_SEQUENCE.filter(
    (id) => id === levelId || progress.cleared.includes(id),
  );
  const next: YapTutorialProgress = {
    cleared,
    done: progress.done || cleared.length === YAP_TUTORIAL_SEQUENCE.length,
  };
  storage.setJson(YAP_LEVELS_KEY, next);
  return next;
}

/**
 * Where the tutorial (re)starts: the first level not cleared yet, or T1 to
 * replay it once done. Used at boot and by the Home Tutorial button.
 */
export function yapTutorialRoute(progress: YapTutorialProgress): YapLevelRoute {
  const first = YAP_TUTORIAL_SEQUENCE[0] ?? 'tutorial/t1';
  const next = progress.done
    ? first
    : (YAP_TUTORIAL_SEQUENCE.find((id) => !progress.cleared.includes(id)) ?? first);
  return yapTutorialLevelRoute(next);
}

// ---------------------------------------------------------------------------
// Daily results (`yapcorp:days`)
// ---------------------------------------------------------------------------

/** What Home shows for a cleared day (spec's per-day record, minus the plan). */
export interface YapDayRecord {
  /** The daily score: number of the winning attempt (never improved by replays). */
  readonly winningAttempt: number;
  /** Best ticks over the wins of that day (replays improve it). */
  readonly bestTicks: number;
  /** Best stars over the wins of that day (replays improve it). */
  readonly stars: number;
  readonly hints: number;
  /** Causes of the failures before the first win. */
  readonly causes: readonly YapCause[];
}

/** One win on a daily heist, as the level scene reports it. */
export interface YapDailyWin {
  readonly attempts: number;
  readonly ticks: number;
  readonly stars: number;
  readonly hints: number;
  readonly causes: readonly YapCause[];
}

export interface YapDailyWinResult {
  readonly record: YapDayRecord;
  /** True on the first win of that day (the record did not exist). */
  readonly firstWin: boolean;
  /** The streak after the win, or null when the win does not count (not the same day). */
  readonly streak: number | null;
}

const YAP_CAUSES: readonly YapCause[] = ['guard', 'camera', 'laser'];

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function sanitizeDayRecord(raw: unknown): YapDayRecord | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const winningAttempt = positiveInt(record.winningAttempt);
  const bestTicks = positiveInt(record.bestTicks);
  const stars = positiveInt(record.stars);
  const hints = nonNegativeInt(record.hints);
  if (winningAttempt === null || bestTicks === null || stars === null || hints === null) {
    return null;
  }
  const causes = Array.isArray(record.causes)
    ? (record.causes as unknown[]).filter((c): c is YapCause => YAP_CAUSES.includes(c as YapCause))
    : [];
  return { winningAttempt, bestTicks, stars: Math.min(3, stars), hints, causes };
}

/** Read the per-day results (days 1..7), dropping corrupted entries. */
export function loadYapDays(storage: YapStorage): ReadonlyMap<number, YapDayRecord> {
  const raw: unknown = storage.getJson<unknown>(YAP_DAYS_KEY, null);
  const days = new Map<number, YapDayRecord>();
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return days;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 1 || day > YAP_WEEK_DAYS) continue;
    const record = sanitizeDayRecord(value);
    if (record !== null) days.set(day, record);
  }
  return days;
}

/**
 * Record a win on the daily heist of test day `day`. The first win sets the
 * daily score (winning attempt); replays improve ticks and stars, never the
 * attempt. The D1 streak only grows when the heist won is the one of the
 * local day of `now` (a heist finished after midnight is recorded but does
 * not count).
 */
export function recordYapDailyWin(
  storage: YapStorage,
  day: number,
  win: YapDailyWin,
  now: Date,
  startDate: string = YAP_TEST_START_DATE,
): YapDailyWinResult {
  const days = loadYapDays(storage);
  const previous = days.get(day) ?? null;
  const record: YapDayRecord =
    previous === null
      ? {
          winningAttempt: win.attempts,
          bestTicks: win.ticks,
          stars: win.stars,
          hints: win.hints,
          causes: [...win.causes],
        }
      : {
          ...previous,
          bestTicks: Math.min(previous.bestTicks, win.ticks),
          stars: Math.max(previous.stars, win.stars),
        };
  const out: Record<string, YapDayRecord> = {};
  for (const [d, r] of days) out[String(d)] = r;
  out[String(day)] = record;
  storage.setJson(YAP_DAYS_KEY, out);
  const sameDay = yapRawDay(now, startDate) === day;
  const streak = sameDay ? recordYapWin(storage, now, startDate).current : null;
  return { record, firstWin: previous === null, streak };
}

// ---------------------------------------------------------------------------
// Flow decisions
// ---------------------------------------------------------------------------

/** Known player: finished the full tutorial once, or has a daily result. */
export function yapIsKnownPlayer(storage: YapStorage): boolean {
  return loadYapTutorialProgress(storage).done || loadYapDays(storage).size > 0;
}

/**
 * Launch: Home for a known player, otherwise straight into the tutorial (T1
 * first). E4: when the URL carries a share-link fragment, the arrival route
 * wins — the challenge card for a readable payload, the linked heist for an
 * unreadable one — and the fragment is stripped from the address bar. `link`
 * defaults to the current URL's link context (null in node, where the boot
 * behavior is unchanged).
 */
export function yapBootRoute(storage: YapStorage, link?: YapLinkContext | null): YapRoute {
  const arrival = link === undefined ? yapReadLinkFromLocation() : link;
  if (arrival !== null) {
    yapStripLinkFragment();
    const route = yapLinkArrivalRoute(storage, arrival);
    if (route !== null) return route;
  }
  if (yapIsKnownPlayer(storage)) return YAP_HOME;
  return yapTutorialRoute(loadYapTutorialProgress(storage));
}

/**
 * After a win, when the player leaves the Win screen: the next tutorial
 * level while the tutorial chain runs, Home after its last level and after
 * any daily heist. E4: while an express-tutorial chain runs (a link arrival
 * by a player who has never played), the chain goes T1 → T2 → T4 and then
 * opens the linked heist.
 */
export function yapRouteAfterWin(route: YapLevelRoute): YapRoute {
  if (route.expressDay !== undefined) {
    const index = YAP_EXPRESS_TUTORIAL_SEQUENCE.indexOf(route.levelId);
    const next = index >= 0 ? YAP_EXPRESS_TUTORIAL_SEQUENCE[index + 1] : undefined;
    if (next !== undefined) return yapExpressTutorialLevelRoute(next, route.expressDay);
    return yapChallengeHeistRoute(route.expressDay) ?? YAP_HOME;
  }
  if (route.mode !== 'tutorial') return YAP_HOME;
  const index = YAP_TUTORIAL_SEQUENCE.indexOf(route.levelId);
  const next = index >= 0 ? YAP_TUTORIAL_SEQUENCE[index + 1] : undefined;
  return next === undefined ? YAP_HOME : yapTutorialLevelRoute(next);
}

// ---------------------------------------------------------------------------
// Link arrivals (story E4): /c/<day>#<payload>
// ---------------------------------------------------------------------------

/** What a share link looks like at launch: the /c/<day> path and the fragment. */
export interface YapLinkContext {
  /** Day carried by the /c/<day> path (null on any other path). */
  readonly pathDay: number | null;
  /** The raw fragment, without the leading '#'. */
  readonly fragment: string;
}

const YAP_LINK_PATH_RE = /^\/c\/(\d{1,3})\/?$/;

/**
 * Read the link context of the current URL. `loc` defaults to the real
 * `location` (absent in node, where this returns null); pass null to force
 * "no link". The fragment is the E1 payload; it is never sent to the server.
 */
export function yapReadLinkFromLocation(
  loc?: { readonly pathname: string; readonly hash: string } | null,
): YapLinkContext | null {
  let source = loc;
  if (source === undefined) {
    try {
      source = typeof location === 'undefined' ? null : location;
    } catch {
      source = null;
    }
  }
  if (source === null) return null;
  const fragment = source.hash.startsWith('#') ? source.hash.slice(1) : source.hash;
  if (fragment === '') return null;
  const match = YAP_LINK_PATH_RE.exec(source.pathname);
  const pathDay = match !== null ? Number.parseInt(match[1] ?? '0', 10) : null;
  return { pathDay: pathDay !== null && pathDay >= 1 && pathDay <= 255 ? pathDay : null, fragment };
}

/**
 * Remove the fragment from the address bar (history.replaceState), so no tool
 * can capture the payload afterwards (Gate 1 spec, "Link payload (v1)").
 * `historyLike`/`loc` default to the real browser objects and are injectable
 * for tests; a no-op outside the browser.
 */
export function yapStripLinkFragment(
  historyLike?: {
    replaceState(data: unknown, title: string, url?: string | null): void;
  },
  loc?: { readonly pathname: string; readonly search: string },
): void {
  let historyRef = historyLike;
  let locRef = loc;
  if (historyRef === undefined || locRef === undefined) {
    try {
      if (historyRef === undefined && typeof history !== 'undefined') historyRef = history;
      if (locRef === undefined && typeof location !== 'undefined') locRef = location;
    } catch {
      // No DOM (node tests): nothing to strip.
    }
  }
  if (historyRef === undefined || locRef === undefined) return;
  try {
    historyRef.replaceState(null, '', `${locRef.pathname}${locRef.search}`);
  } catch {
    // A sandboxed frame can refuse replaceState: the payload stays local anyway.
  }
}

/**
 * The route of a link arrival with a readable payload: the linked heist,
 * marked with the sender's share ID (`challengeShareId`) so the app shell can
 * open the challenge card (yap-challenge, src/game/challenge-scene.ts) for it.
 * The heist itself is a mode 'daily' route on purpose: a win on it is recorded
 * under `yapcorp:days`, which is what unlocks the friend's plan
 * (yapFriendPlanVisible). Home when no heist exists for that day (outside 1..7).
 */
export function yapChallengeCardRoute(day: number, shareId: number): YapRoute {
  const heist = yapChallengeHeistRoute(day);
  if (heist === null) return YAP_HOME;
  return { ...heist, challengeShareId: shareId };
}

/**
 * The linked heist, opened with the same rules as the daily heist of its own
 * day (Gate 1 spec, "The link"): a level route in mode 'daily' so that a win
 * is recorded under `yapcorp:days` — which is what unlocks the friend's plan
 * (yapFriendPlanVisible). Null when no heist exists for that day (outside 1..7).
 */
export function yapChallengeHeistRoute(day: number): YapLevelRoute | null {
  const levelId = `daily/d${day}`;
  return yapLevelById(levelId) !== null ? { kind: 'level', levelId, mode: 'daily', day } : null;
}

/**
 * The route of a link arrival. A readable payload is stored in the inbox and
 * opens the challenge card route (the linked heist marked with the sender's
 * share ID); an unreadable payload simply opens the daily heist of the link's
 * day, without a challenge card (Gate 1 spec, "The link"). Returns null when
 * there is nothing to open (caller falls back to the boot route).
 */
export function yapLinkArrivalRoute(storage: YapStorage, link: YapLinkContext): YapRoute | null {
  const payload = YapPayload.decode(link.fragment);
  if (payload === null) {
    return link.pathDay !== null ? yapChallengeHeistRoute(link.pathDay) : null;
  }
  yapStoreIncomingChallenge(storage, payload);
  return yapChallengeCardRoute(payload.day, payload.shareId);
}

// ---------------------------------------------------------------------------
// Express tutorial (story E4): T1, T2, T4 for a player who has never played
// ---------------------------------------------------------------------------

/** The three-level express tutorial offered to new players arriving from a link. */
export const YAP_EXPRESS_TUTORIAL_SEQUENCE: readonly string[] = [
  'tutorial/t1',
  'tutorial/t2',
  'tutorial/t4',
];

/** One express-tutorial level, chained to the linked heist of `day`. */
export function yapExpressTutorialLevelRoute(levelId: string, day: number): YapLevelRoute {
  return { kind: 'level', levelId, mode: 'tutorial', day: 0, expressDay: day };
}

/**
 * Where a link arrival sends a player who has never played: the first express
 * level not cleared yet (T1 → T2 → T4), then the linked heist. Once the
 * express tutorial is done, straight to the linked heist.
 */
export function yapExpressTutorialRoute(progress: YapTutorialProgress, day: number): YapRoute {
  const next = YAP_EXPRESS_TUTORIAL_SEQUENCE.find((id) => !progress.cleared.includes(id));
  if (next === undefined) return yapChallengeHeistRoute(day) ?? YAP_HOME;
  return yapExpressTutorialLevelRoute(next, day);
}

// ---------------------------------------------------------------------------
// app_open (Gate 1 spec, "Events": launch, or return to the foreground after
// 30 min)
// ---------------------------------------------------------------------------

/** Background time after which coming back counts as a new app_open. */
export const YAP_APP_OPEN_RETURN_MS = 30 * 60_000;

/**
 * First open of the app on this device: the A2 profile (anonId, flags) does
 * not exist yet. Read it before anything creates it (the first track() does).
 */
export function yapIsFirstOpen(storage: YapStorage): boolean {
  return storage.get(YAP_PROFILE_KEY) === null;
}

/** True when the page comes back after at least 30 min in the background. */
export function yapIsReturnToForeground(hiddenAtMs: number | null, nowMs: number): boolean {
  return hiddenAtMs !== null && nowMs - hiddenAtMs >= YAP_APP_OPEN_RETURN_MS;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/** Everything the Home screen shows, for the local day of `now`. */
export interface YapHomeModel {
  readonly phase: YapDailyPhase;
  /** Test day, clamped to 1..7 (the heist number during the week). */
  readonly day: number;
  /** Today's result once cleared (during the week only), else null. */
  readonly record: YapDayRecord | null;
  /** Live streak (a day without a win resets it; 0 outside the week). */
  readonly streak: number;
  readonly bestStreak: number;
  /** Countdown to the next heist (to the first one before the week); 0 when none. */
  readonly msUntilNextHeist: number;
  /** Today's heist, or null before / after the week (spec: tutorial, archive). */
  readonly play: YapLevelRoute | null;
  /** Share is offered once today's heist is cleared. */
  readonly canShare: boolean;
  /** Where the Tutorial button leads. */
  readonly tutorial: YapLevelRoute;
}

export function yapHomeModel(
  storage: YapStorage,
  now: Date,
  startDate: string = YAP_TEST_START_DATE,
): YapHomeModel {
  const info = yapDailyInfo(now, startDate);
  const inWeek = info.phase === 'week';
  const record = inWeek ? (loadYapDays(storage).get(info.day) ?? null) : null;
  const streak = yapEffectiveStreak(loadYapStreak(storage), now, startDate);
  return {
    phase: info.phase,
    day: info.day,
    record,
    streak: streak.current,
    bestStreak: streak.best,
    msUntilNextHeist: info.msUntilNextHeist,
    play: inWeek ? yapDailyRoute(info.day) : null,
    canShare: record !== null,
    tutorial: yapTutorialRoute(loadYapTutorialProgress(storage)),
  };
}

/** A countdown split for display (seconds rounded up: never 00:00:00 too early). */
export interface YapCountdownParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

export function yapCountdownParts(ms: number): YapCountdownParts {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** The hh:mm:ss clock of a countdown (days are shown separately). */
export function yapFormatClock(parts: YapCountdownParts): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}
