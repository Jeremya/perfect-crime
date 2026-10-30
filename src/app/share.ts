// Story E2 — the Share button: share sheet, three variants, copy fallback and
// measured funnel (Gate 1 spec, "Sharing and challenges").
//
// What gets sent: a readable, spoiler-free result plus the link
// https://<domain>/c/<day>#<payload> carrying the E1 payload (./payload.ts):
//
//   Daily Heist #3 🕵️ cracked in 4 tries
//   👁️👁️📷✅ · 41 ticks ⭐⭐
//   Your turn: https://<domain>/c/3#AQME…
//
// Every word comes from the FR/EN dictionaries (i18n `share.*`).
//
// The gesture: on mobile, navigator.share opens the share sheet; on desktop,
// or if the share sheet fails, the text is copied (navigator.clipboard, then a
// last-resort execCommand copy) and the scene shows "Copied". An AbortError
// means the player cancelled. Both APIs need transient user activation, so
// yapShare() calls them synchronously — no await before them — and the scene
// must call it from a pointerup handler (on touch screens pointerdown does
// not grant activation).
//
// Three variants, compared on real phones by E5: 'text' (one text field with
// the link inside, the default), 'fields' (text and link as separate fields),
// 'image' (text with the link, plus the spoiler-free map preview of the day,
// /icons/og-c-<day>.png, as a File when canShare({ files }) allows — else
// text only). The variant is picked without a rebuild through the URL,
// `?share=text|fields|image`, and remembered under `yapcorp:share-variant`
// (`?share=text` resets it). share_result reports the selected variant.
//
// A tutorial win has no daily heist to challenge on: it shares an invitation
// to the game (text + the root link, no payload) and reports day 0.
//
// Funnel (spec "Events"): share_tapped { context, day } on the tap and
// share_result { method, outcome, variant } at the end, only through track(),
// never with the link, its fragment or the shared text.
//
// Phaser-free and node-testable: navigator, clipboard, last-resort copy,
// tracker, storage and fetch are all injectable (tests/unit/share.test.ts).
import {
  track,
  yapDetectDevice,
  type YapEventProps,
  type YapShareContext,
  type YapShareMethod,
  type YapShareOutcome,
} from './analytics';
import { YAP_DOMAIN } from './config';
import { yapDailyInfo } from './daily';
import { yapI18n, type YapKey } from './i18n';
import { YAP_MAX_DAY, YapPayload, type YapPayloadData } from './payload';
import { YapStorage, yapStorage } from './storage';
import type { YapLevelType } from '../core/level';

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/** The three share variants compared by E5 on real phones. */
export type YapShareVariant = 'text' | 'fields' | 'image';
export const YAP_SHARE_VARIANTS: readonly YapShareVariant[] = ['text', 'fields', 'image'];
/** Default variant: the text with the link inside (E5 may change it). */
export const YAP_DEFAULT_SHARE_VARIANT: YapShareVariant = 'text';
/** Query parameter that picks the variant: `?share=fields`. */
export const YAP_SHARE_VARIANT_PARAM = 'share';
/** Remembered variant, relative — YapStorage adds the `yapcorp:` prefix. */
export const YAP_SHARE_VARIANT_KEY = 'share-variant';
/** Anonymous share ID (8 hex digits), relative to the `yapcorp:` prefix. */
export const YAP_SHARE_ID_KEY = 'share-id';

function isShareVariant(value: string | null): value is YapShareVariant {
  return value !== null && (YAP_SHARE_VARIANTS as readonly string[]).includes(value);
}

/** `?share=text|fields|image` (with or without '?'); null when absent/unknown. */
export function yapParseShareVariant(search: string): YapShareVariant | null {
  const value = new URLSearchParams(search).get(YAP_SHARE_VARIANT_PARAM);
  return isShareVariant(value) ? value : null;
}

function currentSearch(): string {
  try {
    return typeof location === 'undefined' ? '' : location.search;
  } catch {
    return '';
  }
}

/**
 * The variant to use: the URL wins and is remembered, then the remembered
 * choice, then the default. Never throws (YapStorage falls back to memory).
 */
export function yapResolveShareVariant(
  storage: YapStorage = yapStorage,
  search: string = currentSearch(),
): YapShareVariant {
  const fromUrl = yapParseShareVariant(search);
  if (fromUrl !== null) {
    storage.set(YAP_SHARE_VARIANT_KEY, fromUrl);
    return fromUrl;
  }
  const stored = storage.get(YAP_SHARE_VARIANT_KEY);
  return isShareVariant(stored) ? stored : YAP_DEFAULT_SHARE_VARIANT;
}

// ---------------------------------------------------------------------------
// Share ID and day
// ---------------------------------------------------------------------------

/** A share ID as the 8 lowercase hex digits used in storage and analytics. */
export function yapShareIdHex(id: number): string {
  return (id >>> 0).toString(16).padStart(8, '0');
}

/**
 * The anonymous share ID of this device (32 random bits), created on the
 * first share and persisted under `yapcorp:share-id`.
 */
export function yapLoadShareId(
  storage: YapStorage = yapStorage,
  create: () => number = () => YapPayload.randomShareId(),
): number {
  const raw = storage.get(YAP_SHARE_ID_KEY);
  if (raw !== null && /^[0-9a-f]{8}$/.test(raw)) return Number.parseInt(raw, 16);
  const id = create() >>> 0;
  storage.set(YAP_SHARE_ID_KEY, yapShareIdHex(id));
  return id;
}

/**
 * The daily heist a win is shared for, or null for a tutorial win (no daily
 * heist, no challenge link). `sceneData` is the level scene's start data: a
 * `mode: 'tutorial'` or a tutorial level means no day; an integer `day`
 * (1..255) is used as is; otherwise a daily level falls back to the local
 * daily heist of `now` (story D1).
 */
export function yapResolveShareDay(
  levelType: YapLevelType,
  sceneData: unknown,
  now: Date = new Date(),
): number | null {
  const data = (typeof sceneData === 'object' && sceneData !== null ? sceneData : {}) as Record<
    string,
    unknown
  >;
  if (levelType === 'tutorial' || data.mode === 'tutorial') return null;
  const day = data.day;
  if (typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= YAP_MAX_DAY) {
    return day;
  }
  return yapDailyInfo(now).day;
}

// ---------------------------------------------------------------------------
// Share text and link
// ---------------------------------------------------------------------------

/** What the Win screen hands over (structurally YapWinSharePayload, C5). */
export interface YapShareSummary {
  readonly attempts: number;
  readonly ticks: number;
  readonly stars: number;
  readonly emojiLine: string;
}

/** The translator the text is built with (yapI18n in the app). */
export interface YapShareTranslator {
  t(key: YapKey, params?: Record<string, string | number>): string;
}

/** The share text in its two shapes, and the link. */
export interface YapShareContent {
  /** Full text, the link inside on the last line ('text' variant, clipboard). */
  readonly text: string;
  /** The same text without the link ('fields' variant: the link goes in `url`). */
  readonly body: string;
  readonly link: string;
}

/** One ⭐ per star (the spec's share line; the Win screen uses ★/☆). */
export function yapShareStars(stars: number): string {
  return '⭐'.repeat(Math.max(0, Math.min(3, stars)));
}

/** https://<domain>/c/<day>#<payload>, or the root page without payload. */
export function yapShareLink(payload: YapPayloadData | null, domain: string = YAP_DOMAIN): string {
  return payload === null ? `https://${domain}/` : YapPayload.link(domain, payload);
}

/**
 * The share text of a win: title line, score line, link line. `payload` null
 * means a tutorial win: an invitation to the game, linking the root page.
 */
export function yapBuildShareContent(
  summary: YapShareSummary,
  payload: YapPayloadData | null,
  i18n: YapShareTranslator = yapI18n,
  domain: string = YAP_DOMAIN,
): YapShareContent {
  const one = summary.attempts === 1;
  const title =
    payload === null
      ? i18n.t(one ? 'share.tutorialTitleOne' : 'share.tutorialTitle', {
          game: i18n.t('app.title'),
          attempts: summary.attempts,
        })
      : i18n.t(one ? 'share.titleOne' : 'share.title', {
          day: payload.day,
          attempts: summary.attempts,
        });
  const score = i18n.t('share.score', {
    emoji: summary.emojiLine,
    ticks: summary.ticks,
    stars: yapShareStars(summary.stars),
  });
  const link = yapShareLink(payload, domain);
  return {
    text: [title, score, i18n.t('share.yourTurn', { link })].join('\n'),
    body: [title, score, i18n.t('share.yourTurn', { link: '' }).trimEnd()].join('\n'),
    link,
  };
}

/**
 * The navigator.share() data of a variant. 'image' adds the map file only
 * when `canShare({ files })` says the platform accepts it; otherwise (or with
 * no image ready) it degrades to the 'text' data.
 */
export function yapShareData(
  content: YapShareContent,
  variant: YapShareVariant,
  image: File | null,
  canShare?: (data: ShareData) => boolean,
): ShareData {
  if (variant === 'fields') return { text: content.body, url: content.link };
  if (variant === 'image' && image !== null && canShare !== undefined) {
    const data: ShareData = { text: content.text, files: [image] };
    if (canShare(data)) return data;
  }
  return { text: content.text };
}

// ---------------------------------------------------------------------------
// Map image (spoiler-free OG preview, fetched ahead of the tap)
// ---------------------------------------------------------------------------

/** The OG preview of a day (tools/og.ts: og-c-<day>.png), or the root one. */
export function yapShareImagePath(day: number | null): string {
  return day === null ? '/icons/og-default.png' : `/icons/og-c-${day}.png`;
}

const yapImageFiles = new Map<string, File | null>();
const yapImageLoads = new Map<string, Promise<File | null>>();

/**
 * Downloads the map image of a day as a File, once. Called when the Win
 * screen opens with the 'image' variant: the File must be ready at the tap,
 * since nothing may be awaited before navigator.share(). Null on any failure.
 */
export function yapPrepareShareImage(
  day: number | null,
  fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<File | null> {
  const path = yapShareImagePath(day);
  const pending = yapImageLoads.get(path);
  if (pending !== undefined) return pending;
  const load = (async (): Promise<File | null> => {
    try {
      const response = await fetchFn(path);
      if (!response.ok) return null;
      const blob = await response.blob();
      const name = `perfect-crime-${day ?? 0}.png`;
      return new File([blob], name, { type: 'image/png' });
    } catch {
      return null;
    }
  })().then((file) => {
    yapImageFiles.set(path, file);
    return file;
  });
  yapImageLoads.set(path, load);
  return load;
}

/** The map image already downloaded for a day, or null (synchronous). */
export function yapPreparedShareImage(day: number | null): File | null {
  return yapImageFiles.get(yapShareImagePath(day)) ?? null;
}

// ---------------------------------------------------------------------------
// The share itself
// ---------------------------------------------------------------------------

/** The subset of Navigator the share relies on (injectable for tests). */
export interface YapShareNavigator {
  readonly userAgent?: string;
  maxTouchPoints?: number;
  share?(data: ShareData): Promise<void>;
  canShare?(data?: ShareData): boolean;
  readonly clipboard?: { writeText(text: string): Promise<void> };
}

/** The tracker of the two funnel events (track() in the app). */
export type YapShareTrack = <E extends 'share_tapped' | 'share_result'>(
  event: E,
  props: YapEventProps<E>,
) => void;

/** A synchronous last-resort copy; true when the text was copied. */
export type YapLegacyCopy = (text: string) => boolean;

export interface YapShareRequest {
  readonly context: YapShareContext;
  /** Day of the shared heist; 0 for a tutorial win (no daily heist). */
  readonly day: number;
  readonly content: YapShareContent;
  readonly variant: YapShareVariant;
  /** The map image of the 'image' variant, already downloaded (or null). */
  readonly image?: File | null;
}

export interface YapShareDeps {
  readonly navigator?: YapShareNavigator | undefined;
  readonly track?: YapShareTrack;
  readonly legacyCopy?: YapLegacyCopy;
}

/** How the share ended — also the share_result properties. */
export interface YapShareReport {
  readonly method: YapShareMethod;
  readonly outcome: YapShareOutcome;
  readonly variant: YapShareVariant;
}

/**
 * True when the share sheet should open: the API exists and the device is a
 * phone or a tablet (iPadOS reports a desktop user agent, but touch points).
 * On desktop the spec copies the text instead.
 */
export function yapPrefersNativeShare(nav: YapShareNavigator | undefined): boolean {
  if (nav === undefined || typeof nav.share !== 'function') return false;
  return yapDetectDevice(nav) === 'mobile' || (nav.maxTouchPoints ?? 0) > 1;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Last resort when navigator.clipboard is missing or refuses: a hidden
 * textarea and document.execCommand('copy'). False when that fails too.
 */
export function yapLegacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || document.body === null) return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Copies the text: clipboard API (called synchronously), then the last resort. */
function yapCopyText(
  text: string,
  nav: YapShareNavigator | undefined,
  legacyCopy: YapLegacyCopy,
): Promise<boolean> {
  const clipboard = nav?.clipboard;
  if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
    return Promise.resolve(legacyCopy(text));
  }
  let pending: Promise<void>;
  try {
    pending = clipboard.writeText(text);
  } catch {
    return Promise.resolve(legacyCopy(text));
  }
  return pending.then(
    () => true,
    () => legacyCopy(text),
  );
}

function defaultNavigator(): YapShareNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}

/**
 * One tap on Share. Tracks share_tapped, then — synchronously, within the
 * caller's user activation — opens the share sheet (mobile) or copies the
 * text (desktop, no share API, or a failing share sheet), and tracks
 * share_result when it ends. Never rejects.
 */
export function yapShare(
  request: YapShareRequest,
  deps: YapShareDeps = {},
): Promise<YapShareReport> {
  const nav = deps.navigator ?? defaultNavigator();
  const trackFn: YapShareTrack = deps.track ?? track;
  const legacyCopy = deps.legacyCopy ?? yapLegacyCopy;
  const { content, variant } = request;
  trackFn('share_tapped', { context: request.context, day: request.day });

  const finish = (method: YapShareMethod, outcome: YapShareOutcome): YapShareReport => {
    const report: YapShareReport = { method, outcome, variant };
    trackFn('share_result', { method, outcome, variant });
    return report;
  };
  const copy = (): Promise<YapShareReport> =>
    yapCopyText(content.text, nav, legacyCopy).then((ok) =>
      finish('clipboard', ok ? 'completed' : 'error'),
    );

  if (nav !== undefined && yapPrefersNativeShare(nav) && nav.share !== undefined) {
    const canShare =
      nav.canShare === undefined
        ? undefined
        : (data: ShareData): boolean => nav.canShare?.(data) === true;
    const data = yapShareData(content, variant, request.image ?? null, canShare);
    if (canShare === undefined || canShare(data)) {
      let pending: Promise<void>;
      try {
        pending = nav.share(data); // no await before this line: user activation
      } catch {
        return copy();
      }
      return pending.then(
        () => finish('native', 'completed'),
        (err: unknown) => (isAbortError(err) ? finish('native', 'cancelled') : copy()),
      );
    }
  }
  return copy();
}
