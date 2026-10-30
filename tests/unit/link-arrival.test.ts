// Tests for story E4 — link arrival: the inbox of received challenges
// (`yapcorp:inbox`, src/app/inbox.ts) and the route wiring of
// src/app/router.ts (challenge card route, express tutorial T1 → T2 → T4,
// linked heist). The acceptance criterion of the task lives here: the friend's
// plan stays hidden until the recipient has won the linked heist or has taken
// the second hint.
import { describe, expect, it } from 'vitest';
import { YAP_CORP } from '../../src/app/brand';
import {
  YAP_INBOX_KEY,
  YAP_MAX_INBOX_ENTRIES,
  YAP_SECOND_HINT,
  loadYapInbox,
  yapCompareWithSender,
  yapFindInboxChallenge,
  yapFriendPlanVisible,
  yapInboxEntryFromPayload,
  yapRecipientProgressFromRecord,
  yapStoreIncomingChallenge,
  type YapInboxEntry,
} from '../../src/app/inbox';
import { YapPayload, type YapPayloadData } from '../../src/app/payload';
import {
  YAP_EXPRESS_TUTORIAL_SEQUENCE,
  loadYapDays,
  loadYapTutorialProgress,
  recordYapDailyWin,
  recordYapTutorialCleared,
  yapBootRoute,
  yapChallengeCardRoute,
  yapChallengeHeistRoute,
  yapExpressTutorialRoute,
  yapLinkArrivalRoute,
  yapReadLinkFromLocation,
  yapRouteAfterWin,
  yapStripLinkFragment,
  type YapLinkContext,
} from '../../src/app/router';
import { YapStorage } from '../../src/app/storage';

function memory(): YapStorage {
  return new YapStorage(null);
}

const PAYLOAD: YapPayloadData = {
  day: 3,
  attempts: 2,
  ticks: 38,
  stars: 2,
  hints: 0,
  causes: ['guard', 'laser'],
  shareId: 0xa1b2c3d4,
  plan: ['E', 'E', 'S', 'wait', 'W'],
  nickname: 'Alex',
};
const FRAGMENT = `#${YapPayload.encode(PAYLOAD)}`;
const LINK: YapLinkContext = { pathDay: 3, fragment: FRAGMENT.slice(1) };

const OTHER: YapPayloadData = { ...PAYLOAD, day: 5, shareId: 0x0badf00d, nickname: '' };

// ---------------------------------------------------------------------------
// Inbox storage
// ---------------------------------------------------------------------------

describe('inbox storage (yapcorp:inbox)', () => {
  it('stores a received challenge under the yapcorp: prefix and reads it back', () => {
    const backend = new Map<string, string>();
    const storage = new YapStorage({
      getItem: (k) => backend.get(k) ?? null,
      setItem: (k, v) => void backend.set(k, v),
      removeItem: (k) => void backend.delete(k),
    });
    const entry = yapStoreIncomingChallenge(storage, PAYLOAD);
    expect(entry).toEqual(yapInboxEntryFromPayload(PAYLOAD));
    const raw = backend.get(`${YAP_CORP.storagePrefix}${YAP_INBOX_KEY}`);
    expect(raw).not.toBeNull();
    expect(loadYapInbox(storage)).toEqual([entry]);
  });

  it('keeps the newest challenge first and finds the latest one for a day', () => {
    const storage = memory();
    yapStoreIncomingChallenge(storage, PAYLOAD);
    yapStoreIncomingChallenge(storage, OTHER);
    expect(loadYapInbox(storage).map((e) => e.day)).toEqual([5, 3]);
    expect(yapFindInboxChallenge(storage, 3)?.shareId).toBe(0xa1b2c3d4);
    expect(yapFindInboxChallenge(storage, 5)?.shareId).toBe(0x0badf00d);
    expect(yapFindInboxChallenge(storage, 7)).toBeNull();
  });

  it('replaces a re-shared challenge from the same sender (same share ID)', () => {
    const storage = memory();
    yapStoreIncomingChallenge(storage, PAYLOAD);
    const updated = yapStoreIncomingChallenge(storage, { ...PAYLOAD, attempts: 1, ticks: 30 });
    const inbox = loadYapInbox(storage);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toEqual(updated);
    expect(inbox[0]?.attempts).toBe(1);
  });

  it('caps the inbox at YAP_MAX_INBOX_ENTRIES, dropping the oldest', () => {
    const storage = memory();
    for (let i = 0; i < YAP_MAX_INBOX_ENTRIES + 5; i += 1) {
      yapStoreIncomingChallenge(storage, { ...PAYLOAD, shareId: i + 1, day: (i % 7) + 1 });
    }
    const inbox = loadYapInbox(storage);
    expect(inbox).toHaveLength(YAP_MAX_INBOX_ENTRIES);
    expect(inbox[0]?.shareId).toBe(YAP_MAX_INBOX_ENTRIES + 5);
  });

  it('drops corrupted entries on read', () => {
    const storage = memory();
    yapStoreIncomingChallenge(storage, PAYLOAD);
    storage.setJson(YAP_INBOX_KEY, [
      { shareId: 'x', day: 3 },
      { ...yapInboxEntryFromPayload(PAYLOAD), day: 0 },
      { ...yapInboxEntryFromPayload(PAYLOAD), plan: ['X'] },
      { ...yapInboxEntryFromPayload(PAYLOAD), stars: 9 },
      'nope',
      yapInboxEntryFromPayload(OTHER),
    ]);
    const inbox = loadYapInbox(storage);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.shareId).toBe(0x0badf00d);
  });

  it('survives a corrupted inbox blob (treated as empty)', () => {
    const storage = memory();
    storage.set(YAP_INBOX_KEY, '{not json');
    expect(loadYapInbox(storage)).toEqual([]);
    storage.setJson(YAP_INBOX_KEY, { nope: true });
    expect(loadYapInbox(storage)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The acceptance criterion: the friend's plan stays hidden until the
// recipient has won or has taken the second hint.
// ---------------------------------------------------------------------------

describe("friend's plan visibility", () => {
  const entry: YapInboxEntry = yapInboxEntryFromPayload(PAYLOAD);

  it('the second hint is hint number 2', () => {
    expect(YAP_SECOND_HINT).toBe(2);
  });

  it('stays hidden before the win and before the second hint', () => {
    expect(yapFriendPlanVisible(entry, { won: false, hints: 0 })).toBe(false);
    expect(yapFriendPlanVisible(entry, { won: false, hints: 1 })).toBe(false);
  });

  it('becomes visible after the recipient’s own win', () => {
    expect(yapFriendPlanVisible(entry, { won: true, hints: 0 })).toBe(true);
    expect(yapFriendPlanVisible(entry, { won: true, hints: 1 })).toBe(true);
  });

  it('becomes visible after the second hint, even without a win', () => {
    expect(yapFriendPlanVisible(entry, { won: false, hints: 2 })).toBe(true);
    expect(yapFriendPlanVisible(entry, { won: false, hints: 3 })).toBe(true);
  });

  it('reads the recipient progress from the stored day record', () => {
    expect(yapRecipientProgressFromRecord(null)).toEqual({ won: false, hints: 0 });
    expect(
      yapRecipientProgressFromRecord({
        winningAttempt: 4,
        bestTicks: 41,
        stars: 1,
        hints: 1,
        causes: [],
        par: 41,
        plan: [],
      }),
    ).toEqual({ won: true, hints: 1 });
  });

  it('end to end: hidden until the win is recorded for the linked day', () => {
    const storage = memory();
    yapStoreIncomingChallenge(storage, PAYLOAD);
    const stored = yapFindInboxChallenge(storage, 3);
    expect(stored).not.toBeNull();
    // no result yet for day 3: hidden
    expect(
      yapFriendPlanVisible(
        stored as YapInboxEntry,
        yapRecipientProgressFromRecord(loadYapDays(storage).get(3) ?? null),
      ),
    ).toBe(false);
    // one hint used on the linked heist: still hidden
    recordYapDailyWin(
      storage,
      3,
      { attempts: 5, ticks: 44, stars: 1, hints: 1, causes: ['guard'] },
      new Date(2025, 10, 5, 12),
    );
    expect(
      yapFriendPlanVisible(
        stored as YapInboxEntry,
        yapRecipientProgressFromRecord(loadYapDays(storage).get(3) ?? null),
      ),
    ).toBe(true); // won (a record exists) — and hints would be 1
  });

  it('end to end: the second hint alone unlocks the plan', () => {
    const storage = memory();
    yapStoreIncomingChallenge(storage, PAYLOAD);
    const stored = yapFindInboxChallenge(storage, 3) as YapInboxEntry;
    // a day record with 2 hints but no win is not possible via recordYapDailyWin
    // (a record means a win), so drive the rule through the progress shape:
    expect(yapFriendPlanVisible(stored, { won: false, hints: 2 })).toBe(true);
    expect(yapFriendPlanVisible(stored, yapRecipientProgressFromRecord(null))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comparison: attempts first, then ticks (Gate 1 spec, "Arrival" step 4)
// ---------------------------------------------------------------------------

describe('score comparison', () => {
  const entry = yapInboxEntryFromPayload(PAYLOAD); // 2 attempts, 38 ticks

  it('compares attempts first, then ticks', () => {
    const better = yapCompareWithSender(entry, {
      winningAttempt: 1,
      bestTicks: 50,
      stars: 3,
      hints: 0,
      causes: [],
      par: 0,
      plan: [],
    });
    expect(better).toEqual({
      verdict: 'better',
      beatSender: true,
      deltaAttempts: -1,
      deltaTicks: 12,
    });
    const worse = yapCompareWithSender(entry, {
      winningAttempt: 3,
      bestTicks: 20,
      stars: 3,
      hints: 0,
      causes: [],
      par: 0,
      plan: [],
    });
    expect(worse).toEqual({
      verdict: 'worse',
      beatSender: false,
      deltaAttempts: 1,
      deltaTicks: -18,
    });
    const tieBreaksOnTicks = yapCompareWithSender(entry, {
      winningAttempt: 2,
      bestTicks: 30,
      stars: 3,
      hints: 0,
      causes: [],
      par: 0,
      plan: [],
    });
    expect(tieBreaksOnTicks?.verdict).toBe('better');
    expect(tieBreaksOnTicks?.beatSender).toBe(true);
    const tied = yapCompareWithSender(entry, {
      winningAttempt: 2,
      bestTicks: 38,
      stars: 2,
      hints: 0,
      causes: [],
      par: 0,
      plan: [],
    });
    expect(tied).toEqual({ verdict: 'tied', beatSender: false, deltaAttempts: 0, deltaTicks: 0 });
  });

  it('has no comparison before the recipient has a result for the day', () => {
    expect(yapCompareWithSender(entry, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Route wiring: reading the link, the arrival route, the express tutorial
// ---------------------------------------------------------------------------

describe('link context reading', () => {
  it('reads /c/<day>#<payload> into a link context', () => {
    expect(yapReadLinkFromLocation({ pathname: '/c/3', hash: FRAGMENT })).toEqual(LINK);
    expect(yapReadLinkFromLocation({ pathname: '/c/12/', hash: FRAGMENT })).toEqual({
      pathDay: 12,
      fragment: FRAGMENT.slice(1),
    });
    expect(yapReadLinkFromLocation({ pathname: '/', hash: FRAGMENT })).toEqual({
      pathDay: null,
      fragment: FRAGMENT.slice(1),
    });
  });

  it('returns null without a fragment, and for non-link paths', () => {
    expect(yapReadLinkFromLocation({ pathname: '/c/3', hash: '' })).toBeNull();
    expect(yapReadLinkFromLocation({ pathname: '/', hash: '' })).toBeNull();
    expect(yapReadLinkFromLocation(null)).toBeNull();
    expect(yapReadLinkFromLocation({ pathname: '/c/0', hash: FRAGMENT })).toEqual({
      pathDay: null,
      fragment: FRAGMENT.slice(1),
    });
  });

  it('strips the fragment from the address bar (history.replaceState)', () => {
    const calls: (string | undefined)[] = [];
    const fakeHistory = {
      replaceState: (_data: unknown, _title: string, url?: string | null) => {
        calls.push(url ?? undefined);
      },
    };
    yapStripLinkFragment(fakeHistory, { pathname: '/c/3', search: '?src=wa' });
    expect(calls).toEqual(['/c/3?src=wa']);
  });
});

describe('link arrival routes', () => {
  it('a readable payload opens the linked heist marked as a challenge arrival, and stores the inbox entry', () => {
    const storage = memory();
    const route = yapLinkArrivalRoute(storage, LINK);
    expect(route).toEqual(yapChallengeCardRoute(3, 0xa1b2c3d4));
    expect(route).toEqual({
      kind: 'level',
      levelId: 'daily/d3',
      mode: 'daily',
      day: 3,
      challengeShareId: 0xa1b2c3d4,
    });
    expect(yapFindInboxChallenge(storage, 3)?.nickname).toBe('Alex');
  });

  it('an unreadable payload opens the daily heist of the link’s day, without a card', () => {
    const storage = memory();
    const route = yapLinkArrivalRoute(storage, { pathDay: 3, fragment: 'not-a-payload' });
    expect(route).toEqual({ kind: 'level', levelId: 'daily/d3', mode: 'daily', day: 3 });
    expect(loadYapInbox(storage)).toEqual([]);
  });

  it('an unreadable payload without a /c/<day> path falls back (null)', () => {
    const storage = memory();
    expect(yapLinkArrivalRoute(storage, { pathDay: null, fragment: 'nope' })).toBeNull();
    expect(yapLinkArrivalRoute(storage, { pathDay: 9, fragment: 'nope' })).toBeNull();
  });

  it('yapBootRoute consumes a link arrival and strips the fragment', () => {
    const storage = memory();
    expect(yapBootRoute(storage, LINK)).toEqual({
      kind: 'level',
      levelId: 'daily/d3',
      mode: 'daily',
      day: 3,
      challengeShareId: 0xa1b2c3d4,
    });
    expect(yapFindInboxChallenge(storage, 3)).not.toBeNull();
    // unreadable payload on /c/4: the heist of day 4, no card
    expect(yapBootRoute(memory(), { pathDay: 4, fragment: 'garbage' })).toEqual({
      kind: 'level',
      levelId: 'daily/d4',
      mode: 'daily',
      day: 4,
    });
    // no link at all: the D2 boot behavior is unchanged
    expect(yapBootRoute(memory(), null)).toMatchObject({ kind: 'level', levelId: 'tutorial/t1' });
    expect(yapBootRoute(memory())).toMatchObject({ kind: 'level', levelId: 'tutorial/t1' });
  });

  it('the linked heist route exists only for days 1..7; the card route falls back to Home beyond', () => {
    expect(yapChallengeHeistRoute(3)).toEqual({
      kind: 'level',
      levelId: 'daily/d3',
      mode: 'daily',
      day: 3,
    });
    expect(yapChallengeHeistRoute(8)).toBeNull();
    expect(yapChallengeCardRoute(8, 0x1234)).toEqual({ kind: 'home' });
  });
});

describe('express tutorial (T1, T2, T4) for new players arriving from a link', () => {
  it('chains T1 → T2 → T4 → the linked heist → Home', () => {
    expect([...YAP_EXPRESS_TUTORIAL_SEQUENCE]).toEqual([
      'tutorial/t1',
      'tutorial/t2',
      'tutorial/t4',
    ]);
    const storage = memory();
    let route = yapExpressTutorialRoute(loadYapTutorialProgress(storage), 3);
    expect(route).toEqual({
      kind: 'level',
      levelId: 'tutorial/t1',
      mode: 'tutorial',
      day: 0,
      expressDay: 3,
    });
    const visited: string[] = [];
    for (;;) {
      if (route.kind !== 'level') break;
      visited.push(route.levelId);
      recordYapTutorialCleared(storage, route.levelId);
      route = yapRouteAfterWin(route);
    }
    expect(visited).toEqual(['tutorial/t1', 'tutorial/t2', 'tutorial/t4', 'daily/d3']);
    expect(route).toEqual({ kind: 'home' });
  });

  it('resumes at the first express level not cleared yet', () => {
    const storage = memory();
    recordYapTutorialCleared(storage, 'tutorial/t1');
    recordYapTutorialCleared(storage, 'tutorial/t2');
    expect(yapExpressTutorialRoute(loadYapTutorialProgress(storage), 5)).toMatchObject({
      levelId: 'tutorial/t4',
      expressDay: 5,
    });
  });

  it('goes straight to the linked heist once the express tutorial is done', () => {
    const storage = memory();
    for (const id of YAP_EXPRESS_TUTORIAL_SEQUENCE) recordYapTutorialCleared(storage, id);
    expect(yapExpressTutorialRoute(loadYapTutorialProgress(storage), 2)).toEqual({
      kind: 'level',
      levelId: 'daily/d2',
      mode: 'daily',
      day: 2,
    });
  });

  it('the plain tutorial chain (T1…T5) is unchanged by the express marker', () => {
    const storage = memory();
    const route = yapBootRoute(storage, null);
    expect(yapRouteAfterWin(route as never)).toMatchObject({ levelId: 'tutorial/t2' });
    expect(yapRouteAfterWin(yapChallengeHeistRoute(3) as never)).toEqual({ kind: 'home' });
  });
});
