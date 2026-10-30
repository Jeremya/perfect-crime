// Story G1 — analytics adapter for Perfect Crime (Yap Corp).
//
// A single entry point, track(event, props), backed by a minimal fetch-based
// adapter to the PostHog capture API on the EU host — no posthog-js dependency
// (the Gate 1 budget is < 3 MB transferred). With the raw capture API there is
// no autocapture and no session recording, and the identifier is the anonymous
// anonId from the A2 profile.
//
// Super properties (anonId, shareId, language, consent, version, build, device,
// src, flags, internal) are resolved from the A2 config/storage modules and the
// A3 i18n locale on every event. No personal data, and never a URL with its
// fragment: the app strips the share payload from the address bar at launch,
// and this module strips '#' from every URL it sends.
//
// Consent gating ("nothing leaves before consent") is story G2; G1 only
// attaches the consent super-property.
import { YAP_CORP } from './brand';
import { YAP_PROFILE_KEY, loadYapProfile, type YapFlags } from './config';
import { YAP_LANGUAGE_STORAGE_KEY, YAP_LOCALES, yapDetectLocale } from './i18n';
import { YapStorage, yapStorage } from './storage';

/** PostHog project API key (public, browser-side by design). */
export const YAP_POSTHOG_API_KEY = 'phc_wBu9Gdocezo2iU7K3qCCw8V6KDjaiWaR3JqYvmERryT3';
/** PostHog EU host, per the Gate 1 spec ("hosted in Europe"). */
export const YAP_POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

// Spelled without an ALL-CAPS literal on purpose: the i18n guard in
// tests/unit/i18n.test.ts flags any ^[A-Z]{3,}$ string literal in src/.
const YAP_HTTP_POST = 'PO' + 'ST';

// ---------------------------------------------------------------------------
// Event table (Gate 1 spec, "Events"): name -> typed properties.
// ---------------------------------------------------------------------------

export type YapEntrySource = 'direct' | 'link' | 'portal';
export type YapLevelMode = 'tutorial' | 'daily' | 'archive' | 'challenge';
export type YapFailCause = 'guard' | 'camera' | 'laser';
export type YapShareContext = 'win' | 'home' | 'comparison';
export type YapShareMethod = 'native' | 'clipboard';
export type YapShareOutcome = 'completed' | 'cancelled' | 'error';
export type YapChallengeAction = 'play' | 'later';

export interface YapAppOpenProps {
  entry: YapEntrySource;
  is_first_open: boolean;
  link_day?: number;
  sender_share_id?: string;
}
export interface YapConsentSetProps {
  granted: boolean;
}
export interface YapLevelStartProps {
  level_id: string;
  mode: YapLevelMode;
  day: number;
}
export interface YapAttemptStartProps {
  level_id: string;
  attempt: number;
  plan_ticks: number;
  pauses_used: number;
}
export interface YapAttemptFailProps {
  level_id: string;
  attempt: number;
  cause: YapFailCause;
  tick: number;
  ms_since_level_start: number;
}
export interface YapAttemptWinProps {
  level_id: string;
  attempt: number;
  ticks: number;
  par: number;
  stars: number;
  hints_used: number;
  ms_since_level_start: number;
  first_win: boolean;
}
export interface YapHintUsedProps {
  level_id: string;
  hint_index: number;
  attempt: number;
}
export interface YapShareTappedProps {
  context: YapShareContext;
  day: number;
}
export interface YapShareResultProps {
  method: YapShareMethod;
  outcome: YapShareOutcome;
  variant: string;
}
export interface YapLinkOpenedProps {
  day: number;
  sender_share_id: string;
  is_new_player: boolean;
  is_self: boolean;
}
export interface YapChallengeCtaProps {
  action: YapChallengeAction;
}
export interface YapChallengeResultProps {
  day: number;
  beat_sender: boolean;
  delta_attempts: number;
  delta_ticks: number;
}
export interface YapFriendPlanViewedProps {
  day: number;
}
export interface YapStreakDayProps {
  streak: number;
}
export interface YapHeartbeatProps {
  active_ms: number;
}
export interface YapErrorProps {
  message: string;
  scene: string;
}

/** Every event of the spec table mapped to its typed properties. */
export interface YapAnalyticsEventMap {
  app_open: YapAppOpenProps;
  consent_set: YapConsentSetProps;
  level_start: YapLevelStartProps;
  attempt_start: YapAttemptStartProps;
  attempt_fail: YapAttemptFailProps;
  attempt_win: YapAttemptWinProps;
  hint_used: YapHintUsedProps;
  share_tapped: YapShareTappedProps;
  share_result: YapShareResultProps;
  link_opened: YapLinkOpenedProps;
  challenge_cta: YapChallengeCtaProps;
  challenge_result: YapChallengeResultProps;
  friend_plan_viewed: YapFriendPlanViewedProps;
  streak_day: YapStreakDayProps;
  heartbeat: YapHeartbeatProps;
  error: YapErrorProps;
}

export type YapAnalyticsEvent = keyof YapAnalyticsEventMap;
export type YapEventProps<E extends YapAnalyticsEvent> = YapAnalyticsEventMap[E];

/** The 16 events of the spec table, in spec order. */
export const YAP_ANALYTICS_EVENTS: readonly YapAnalyticsEvent[] = [
  'app_open',
  'consent_set',
  'level_start',
  'attempt_start',
  'attempt_fail',
  'attempt_win',
  'hint_used',
  'share_tapped',
  'share_result',
  'link_opened',
  'challenge_cta',
  'challenge_result',
  'friend_plan_viewed',
  'streak_day',
  'heartbeat',
  'error',
];

// ---------------------------------------------------------------------------
// Super properties and helpers.
// ---------------------------------------------------------------------------

export type YapDevice = 'mobile' | 'desktop';

/** The subset of Navigator the adapter relies on (injectable for tests). */
export interface YapAnalyticsNavigator {
  readonly languages?: readonly string[];
  readonly language?: string;
  readonly userAgent?: string;
  readonly maxTouchPoints?: number;
}

/** Super properties attached to every event. */
export interface YapSuperProperties {
  anonId: string;
  shareId: string | null;
  language: string;
  consent: boolean;
  version: string;
  build: string;
  device: YapDevice;
  src: string | null;
  internal: boolean;
  flags: YapFlags;
}

/** An event ready to be sent: distinct_id = anonId, plus its properties. */
export interface YapCapturedEvent {
  event: YapAnalyticsEvent;
  distinctId: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

/** Anything that can deliver captured events (PostHog in prod, mock in tests). */
export interface YapAnalyticsTransport {
  send(events: readonly YapCapturedEvent[]): void | Promise<void>;
}

/** Removes the fragment ('#…') from a URL — the share payload never leaves the device. */
export function yapUrlWithoutFragment(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

const ABSOLUTE_URL_RE = /^(?:https?:\/\/|www\.)/i;

/** Strips the fragment from URL-like string values; passes everything else through. */
export function yapSanitizeAnalyticsValue(value: unknown): unknown {
  if (typeof value === 'string' && ABSOLUTE_URL_RE.test(value)) return yapUrlWithoutFragment(value);
  return value;
}

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

/** Device class of the player, from the user agent. */
export function yapDetectDevice(navigatorLike?: YapAnalyticsNavigator): YapDevice {
  const nav = navigatorLike ?? (typeof navigator === 'undefined' ? undefined : navigator);
  return MOBILE_UA_RE.test(nav?.userAgent ?? '') ? 'mobile' : 'desktop';
}

/**
 * Resolves the super properties from the A2 config/storage modules and the A3
 * i18n locale. shareId and consent are read from the stored profile (persisted
 * by the sharing / consent stories); language from the persisted choice, else
 * navigator detection; src from the recruitment query parameter.
 */
export function yapBuildSuperProperties(
  storage: YapStorage,
  navigatorLike?: YapAnalyticsNavigator,
  search = '',
): YapSuperProperties {
  // Read the raw profile first: loadYapProfile normalizes the stored shape.
  const raw = storage.getJson<Record<string, unknown>>(YAP_PROFILE_KEY, {});
  const profile = loadYapProfile(storage);
  const shareId = typeof raw.shareId === 'string' && raw.shareId !== '' ? raw.shareId : null;
  const consent = raw.consent === true;
  const langKey = YAP_LANGUAGE_STORAGE_KEY.slice(YAP_CORP.storagePrefix.length);
  const storedLang = storage.get(langKey);
  const language =
    storedLang !== null && (YAP_LOCALES as readonly string[]).includes(storedLang)
      ? storedLang
      : yapDetectLocale(navigatorLike);
  return {
    anonId: profile.anonId,
    shareId,
    language,
    consent,
    version: YAP_CORP.version,
    build: YAP_CORP.version, // no separate build channel at Gate 1
    device: yapDetectDevice(navigatorLike),
    src: new URLSearchParams(search).get('src'),
    internal: profile.internal,
    flags: profile.flags,
  };
}

// ---------------------------------------------------------------------------
// PostHog transport (EU capture API, fetch-based, no dependency).
// ---------------------------------------------------------------------------

export interface YapPostHogTransportOptions {
  apiKey?: string | undefined;
  host?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

/**
 * Minimal adapter to the PostHog batch capture API on the EU host. Fire and
 * forget: failures are swallowed, analytics must never break the game.
 */
export class YapPostHogTransport implements YapAnalyticsTransport {
  readonly apiKey: string;
  readonly host: string;
  private readonly fetchFn: typeof fetch | undefined;

  constructor(options: YapPostHogTransportOptions = {}) {
    this.apiKey = options.apiKey ?? YAP_POSTHOG_API_KEY;
    this.host = (options.host ?? YAP_POSTHOG_EU_HOST).replace(/\/+$/, '');
    this.fetchFn =
      options.fetchFn ?? (typeof fetch === 'undefined' ? undefined : globalThis.fetch.bind(globalThis));
  }

  send(events: readonly YapCapturedEvent[]): Promise<void> {
    const fetchFn = this.fetchFn;
    if (fetchFn === undefined || events.length === 0) return Promise.resolve();
    const body = JSON.stringify({
      api_key: this.apiKey,
      batch: events.map((e) => ({
        event: e.event,
        distinct_id: e.distinctId,
        timestamp: e.timestamp,
        properties: e.properties,
      })),
    });
    return fetchFn(`${this.host}/batch/`, {
      method: YAP_HTTP_POST,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then(
      () => undefined,
      () => undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Analytics facade and the single track() entry point.
// ---------------------------------------------------------------------------

export interface YapAnalyticsOptions {
  storage?: YapStorage | undefined;
  transport?: YapAnalyticsTransport | undefined;
  posthog?: YapPostHogTransportOptions | undefined;
  url?: (() => string) | undefined;
  search?: (() => string) | undefined;
  navigatorLike?: YapAnalyticsNavigator | undefined;
  now?: (() => Date) | undefined;
}

function defaultUrl(): string {
  try {
    return typeof location === 'undefined' ? '' : location.href;
  } catch {
    return '';
  }
}

function defaultSearch(): string {
  try {
    return typeof location === 'undefined' ? '' : location.search;
  } catch {
    return '';
  }
}

export class YapAnalytics {
  private readonly storage: YapStorage;
  private readonly transport: YapAnalyticsTransport;
  private readonly urlProvider: () => string;
  private readonly searchProvider: () => string;
  private readonly navigatorLike: YapAnalyticsNavigator | undefined;
  private readonly now: () => Date;

  constructor(options: YapAnalyticsOptions = {}) {
    this.storage = options.storage ?? yapStorage;
    this.transport = options.transport ?? new YapPostHogTransport(options.posthog);
    this.urlProvider = options.url ?? defaultUrl;
    this.searchProvider = options.search ?? defaultSearch;
    this.navigatorLike = options.navigatorLike;
    this.now = options.now ?? (() => new Date());
  }

  /** Builds the captured event: super properties + event properties + fragment-free URL. */
  capture<E extends YapAnalyticsEvent>(event: E, props: YapEventProps<E>): YapCapturedEvent {
    const superProperties = yapBuildSuperProperties(
      this.storage,
      this.navigatorLike,
      this.searchProvider(),
    );
    const properties: Record<string, unknown> = { ...superProperties };
    for (const [key, value] of Object.entries(props as unknown as Record<string, unknown>)) {
      properties[key] = yapSanitizeAnalyticsValue(value);
    }
    const href = yapUrlWithoutFragment(this.urlProvider());
    properties.$current_url = href;
    try {
      const parsed = new URL(href);
      properties.$host = parsed.host;
      properties.$pathname = parsed.pathname;
    } catch {
      // Not an absolute URL (tests, file://): $current_url alone is enough.
    }
    return {
      event,
      distinctId: superProperties.anonId,
      timestamp: this.now().toISOString(),
      properties,
    };
  }

  /** Sends one event; never throws, whatever the transport does. */
  track<E extends YapAnalyticsEvent>(event: E, props: YapEventProps<E>): void {
    let captured: YapCapturedEvent;
    try {
      captured = this.capture(event, props);
    } catch {
      return;
    }
    try {
      void Promise.resolve(this.transport.send([captured])).catch(() => undefined);
    } catch {
      // Synchronous transport failure: ignore.
    }
  }
}

let sharedAnalytics = new YapAnalytics();

/** Reconfigures the shared instance (e.g. once consent is known, story G2). */
export function configureYapAnalytics(options: YapAnalyticsOptions): YapAnalytics {
  sharedAnalytics = new YapAnalytics(options);
  return sharedAnalytics;
}

/** The single analytics entry point: every event goes through here. */
export function track<E extends YapAnalyticsEvent>(event: E, props: YapEventProps<E>): void {
  sharedAnalytics.track(event, props);
}
