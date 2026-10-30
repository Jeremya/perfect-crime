// Story E4 — the inbox of received challenges, stored under `yapcorp:inbox`
// (the spec's storage table: "Received challenges: sender, day, payload").
//
// Opening a share link (https://<domain>/c/<day>#<payload>, E1) stores the
// decoded payload here, so the challenge card (src/game/challenge-scene.ts)
// can show the sender's result and compare it with the recipient's own.
//
// The acceptance criterion of the task lives in yapFriendPlanVisible: the
// friend's plan stays hidden until the recipient has won the linked heist or
// has taken the second hint (Gate 1 spec, "Arrival" step 4: "The friend's
// plan becomes visible after the recipient's win, or after the second hint").
// The recipient's progress is the per-day record of `yapcorp:days`
// (src/app/router.ts): a record exists once the heist is won, and its `hints`
// counts the hints taken on that heist.
//
// Pure and Phaser-free: everything is a function of the storage, so the whole
// contract is unit-tested in node (tests/unit/link-arrival.test.ts).
import { YAP_MAX_TICKS } from '../core/level';
import type { YapCause, YapMove, YapPlan } from '../core/sim';
import {
  YAP_MAX_CAUSES,
  YAP_MAX_DAY,
  YAP_MAX_NICKNAME_BYTES,
  YAP_MAX_SHARE_ID,
  type YapPayloadData,
} from './payload';
import type { YapStorage } from './storage';
import type { YapDayRecord } from './router';

/** Inbox storage key, relative — YapStorage adds the `yapcorp:` prefix. */
export const YAP_INBOX_KEY = 'inbox';
/** At most this many received challenges are kept (the oldest are dropped). */
export const YAP_MAX_INBOX_ENTRIES = 20;
/**
 * The second hint unlocks the friend's plan (Gate 1 spec, "Arrival" step 4).
 * Hints are counted from 1: taking the second hint means `hints >= 2`.
 */
export const YAP_SECOND_HINT = 2;

const YAP_CAUSES: readonly YapCause[] = ['guard', 'camera', 'laser'];
const YAP_MOVES: readonly YapMove[] = ['N', 'E', 'S', 'W', 'wait'];

/** One received challenge: the sender and what the link carried (E1 payload). */
export interface YapInboxEntry {
  /** The sender's anonymous share ID (32 bits). */
  readonly shareId: number;
  /** The sender's nickname, empty when anonymous ("A friend"). */
  readonly nickname: string;
  /** Day of the shared heist, 1..255. */
  readonly day: number;
  /** The sender's winning attempt (0 = not cleared yet). */
  readonly attempts: number;
  /** The sender's best ticks. */
  readonly ticks: number;
  readonly stars: number;
  readonly hints: number;
  readonly causes: readonly YapCause[];
  /** The sender's winning plan — hidden until yapFriendPlanVisible says so. */
  readonly plan: YapPlan;
}

/** The inbox entry of a decoded link payload. */
export function yapInboxEntryFromPayload(payload: YapPayloadData): YapInboxEntry {
  return {
    shareId: payload.shareId,
    nickname: payload.nickname ?? '',
    day: payload.day,
    attempts: payload.attempts,
    ticks: payload.ticks,
    stars: payload.stars,
    hints: payload.hints,
    causes: [...payload.causes],
    plan: [...payload.plan],
  };
}

function intInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/** Sanitizes one stored entry; null when corrupted. */
function sanitizeInboxEntry(raw: unknown): YapInboxEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const shareId = intInRange(record.shareId, 0, YAP_MAX_SHARE_ID);
  const day = intInRange(record.day, 1, YAP_MAX_DAY);
  const attempts = intInRange(record.attempts, 0, 255);
  const ticks = intInRange(record.ticks, 0, 255);
  const stars = intInRange(record.stars, 0, 3);
  const hints = intInRange(record.hints, 0, 3);
  if (shareId === null || day === null || attempts === null || ticks === null) return null;
  if (stars === null || hints === null) return null;
  const nickname = typeof record.nickname === 'string' ? record.nickname : '';
  if (new TextEncoder().encode(nickname).length > YAP_MAX_NICKNAME_BYTES) return null;
  const causes = Array.isArray(record.causes)
    ? (record.causes as unknown[]).filter((c): c is YapCause => YAP_CAUSES.includes(c as YapCause))
    : [];
  if (causes.length > YAP_MAX_CAUSES) return null;
  const plan = Array.isArray(record.plan)
    ? (record.plan as unknown[]).filter((m): m is YapMove => YAP_MOVES.includes(m as YapMove))
    : [];
  if (!Array.isArray(record.plan) || plan.length !== (record.plan as unknown[]).length) return null;
  if (plan.length > YAP_MAX_TICKS) return null;
  return { shareId, nickname, day, attempts, ticks, stars, hints, causes, plan };
}

/** Read the inbox, newest first, dropping corrupted entries. */
export function loadYapInbox(storage: YapStorage): YapInboxEntry[] {
  const raw: unknown = storage.getJson<unknown>(YAP_INBOX_KEY, null);
  if (!Array.isArray(raw)) return [];
  const out: YapInboxEntry[] = [];
  for (const item of raw) {
    const entry = sanitizeInboxEntry(item);
    if (entry !== null) out.push(entry);
  }
  return out;
}

/**
 * Store a received challenge (newest first). A re-shared link from the same
 * sender (same share ID) replaces its previous entry; the inbox is capped at
 * YAP_MAX_INBOX_ENTRIES. Returns the stored entry.
 */
export function yapStoreIncomingChallenge(
  storage: YapStorage,
  payload: YapPayloadData,
): YapInboxEntry {
  const entry = yapInboxEntryFromPayload(payload);
  const kept = loadYapInbox(storage).filter((e) => e.shareId !== entry.shareId);
  storage.setJson(YAP_INBOX_KEY, [entry, ...kept].slice(0, YAP_MAX_INBOX_ENTRIES));
  return entry;
}

/** The most recent received challenge for `day`, or null. */
export function yapFindInboxChallenge(storage: YapStorage, day: number): YapInboxEntry | null {
  return loadYapInbox(storage).find((e) => e.day === day) ?? null;
}

// ---------------------------------------------------------------------------
// The friend's plan visibility (acceptance criterion)
// ---------------------------------------------------------------------------

/** The recipient's progress on the linked heist. */
export interface YapRecipientProgress {
  /** True once the recipient has won the heist of that day. */
  readonly won: boolean;
  /** Hints taken on that heist (0..3). */
  readonly hints: number;
}

/** The recipient's progress from the stored per-day record (`yapcorp:days`). */
export function yapRecipientProgressFromRecord(record: YapDayRecord | null): YapRecipientProgress {
  return { won: record !== null, hints: record?.hints ?? 0 };
}

/**
 * The acceptance criterion of story E4: the friend's plan stays hidden until
 * the recipient has won the linked heist or has taken the second hint.
 */
export function yapFriendPlanVisible(
  _entry: YapInboxEntry,
  recipient: YapRecipientProgress,
): boolean {
  return recipient.won || recipient.hints >= YAP_SECOND_HINT;
}

// ---------------------------------------------------------------------------
// Score comparison (Gate 1 spec, "Arrival" step 4: attempts first, then ticks)
// ---------------------------------------------------------------------------

export type YapVerdict = 'better' | 'worse' | 'tied';

/** The recipient vs the sender, for the challenge_result event properties. */
export interface YapComparison {
  readonly verdict: YapVerdict;
  readonly beatSender: boolean;
  readonly deltaAttempts: number;
  readonly deltaTicks: number;
}

/**
 * Compare the recipient's day record with the sender's inbox entry: attempts
 * first, then ticks. Null when the recipient has no result for the day yet.
 */
export function yapCompareWithSender(
  entry: YapInboxEntry,
  record: YapDayRecord | null,
): YapComparison | null {
  if (record === null) return null;
  const deltaAttempts = record.winningAttempt - entry.attempts;
  const deltaTicks = record.bestTicks - entry.ticks;
  const verdict: YapVerdict =
    deltaAttempts < 0 || (deltaAttempts === 0 && deltaTicks < 0)
      ? 'better'
      : deltaAttempts > 0 || (deltaAttempts === 0 && deltaTicks > 0)
        ? 'worse'
        : 'tied';
  return {
    verdict,
    beatSender: verdict === 'better',
    deltaAttempts,
    deltaTicks,
  };
}
