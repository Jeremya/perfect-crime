// Unit tests for story G1 — the analytics adapter (src/app/analytics.ts).
// One track() entry point, super properties resolved from the A2 config /
// storage modules (anonId, shareId, language, consent, …), the full event
// table of the Gate 1 spec emitted with its properties through a mock
// transport, the PostHog EU capture API shape, and the guarantee that no URL
// is ever sent with its fragment.
import { describe, expect, it } from 'vitest';
import { YAP_CORP } from '../../src/app/brand';
import { YAP_PROFILE_KEY, YAP_PROFILE_SCHEMA } from '../../src/app/config';
import { YapStorage, type YapStorageBackend } from '../../src/app/storage';
import {
  YAP_ANALYTICS_EVENTS,
  YAP_POSTHOG_API_KEY,
  YAP_POSTHOG_EU_HOST,
  YapAnalytics,
  YapPostHogTransport,
  configureYapAnalytics,
  track,
  yapUrlWithoutFragment,
  type YapAnalyticsEvent,
  type YapAnalyticsOptions,
  type YapAnalyticsTransport,
  type YapCapturedEvent,
} from '../../src/app/analytics';

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

/** Mock transport: records every captured event instead of sending it. */
class MockTransport implements YapAnalyticsTransport {
  readonly sent: YapCapturedEvent[] = [];
  send(events: readonly YapCapturedEvent[]): void {
    this.sent.push(...events);
  }
}

function testStorage(profile?: Record<string, unknown>): YapStorage {
  const storage = new YapStorage(new FakeBackend());
  if (profile !== undefined) storage.setJson(YAP_PROFILE_KEY, profile);
  return storage;
}

/** Default options: deterministic clock, URL carrying a fragment, iPhone UA. */
function baseOptions(storage: YapStorage, transport: YapAnalyticsTransport): YapAnalyticsOptions {
  return {
    storage,
    transport,
    url: () => 'https://yap-corp-perfect-crime.pages.dev/c/3#eyJ2ZXJzaW9uIjoxLCJkYXkiOjN9',
    search: () => '?src=portal',
    navigatorLike: {
      language: 'fr-FR',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
    },
    now: () => new Date('2025-11-05T10:00:00.000Z'),
  };
}

/** The full event table of the Gate 1 spec, with the properties of each row. */
const SPEC_EVENT_PROPS: Record<YapAnalyticsEvent, Record<string, unknown>> = {
  app_open: { entry: 'link', is_first_open: true, link_day: 3, sender_share_id: 'a1b2c3d4' },
  consent_set: { granted: true },
  level_start: { level_id: 'd3', mode: 'daily', day: 3 },
  attempt_start: { level_id: 'd3', attempt: 2, plan_ticks: 41, pauses_used: 1 },
  attempt_fail: { level_id: 'd3', attempt: 2, cause: 'laser', tick: 17, ms_since_level_start: 42000 },
  attempt_win: {
    level_id: 'd3',
    attempt: 3,
    ticks: 38,
    par: 40,
    stars: 3,
    hints_used: 1,
    ms_since_level_start: 95000,
    first_win: true,
  },
  hint_used: { level_id: 'd3', hint_index: 0, attempt: 3 },
  share_tapped: { context: 'win', day: 3 },
  share_result: { method: 'native', outcome: 'completed', variant: 'text-link' },
  link_opened: { day: 3, sender_share_id: 'a1b2c3d4', is_new_player: true, is_self: false },
  challenge_cta: { action: 'play' },
  challenge_result: { day: 3, beat_sender: true, delta_attempts: -1, delta_ticks: 4 },
  friend_plan_viewed: { day: 3 },
  streak_day: { streak: 2 },
  heartbeat: { active_ms: 30000 },
  error: { message: 'boom', scene: 'yap-level' },
};

describe('event table (Gate 1 spec)', () => {
  it('lists exactly the 16 events of the spec table', () => {
    expect([...YAP_ANALYTICS_EVENTS].sort()).toEqual(Object.keys(SPEC_EVENT_PROPS).sort());
    expect(YAP_ANALYTICS_EVENTS).toHaveLength(16);
  });

  it('emits every event with its properties through the transport', () => {
    const transport = new MockTransport();
    const analytics = new YapAnalytics(baseOptions(testStorage(), transport));

    analytics.track('app_open', {
      entry: 'link',
      is_first_open: true,
      link_day: 3,
      sender_share_id: 'a1b2c3d4',
    });
    analytics.track('consent_set', { granted: true });
    analytics.track('level_start', { level_id: 'd3', mode: 'daily', day: 3 });
    analytics.track('attempt_start', { level_id: 'd3', attempt: 2, plan_ticks: 41, pauses_used: 1 });
    analytics.track('attempt_fail', {
      level_id: 'd3',
      attempt: 2,
      cause: 'laser',
      tick: 17,
      ms_since_level_start: 42000,
    });
    analytics.track('attempt_win', {
      level_id: 'd3',
      attempt: 3,
      ticks: 38,
      par: 40,
      stars: 3,
      hints_used: 1,
      ms_since_level_start: 95000,
      first_win: true,
    });
    analytics.track('hint_used', { level_id: 'd3', hint_index: 0, attempt: 3 });
    analytics.track('share_tapped', { context: 'win', day: 3 });
    analytics.track('share_result', { method: 'native', outcome: 'completed', variant: 'text-link' });
    analytics.track('link_opened', {
      day: 3,
      sender_share_id: 'a1b2c3d4',
      is_new_player: true,
      is_self: false,
    });
    analytics.track('challenge_cta', { action: 'play' });
    analytics.track('challenge_result', { day: 3, beat_sender: true, delta_attempts: -1, delta_ticks: 4 });
    analytics.track('friend_plan_viewed', { day: 3 });
    analytics.track('streak_day', { streak: 2 });
    analytics.track('heartbeat', { active_ms: 30000 });
    analytics.track('error', { message: 'boom', scene: 'yap-level' });

    expect(transport.sent.map((e) => e.event)).toEqual([...YAP_ANALYTICS_EVENTS]);
    for (const captured of transport.sent) {
      const expected = SPEC_EVENT_PROPS[captured.event];
      for (const [key, value] of Object.entries(expected)) {
        expect(captured.properties[key], `${captured.event}.${key}`).toEqual(value);
      }
    }
  });

  it('rejects unknown events and incomplete properties at the type level', () => {
    const analytics = new YapAnalytics(baseOptions(testStorage(), new MockTransport()));
    // @ts-expect-error attempt_win requires all of its properties
    analytics.track('attempt_win', { level_id: 'd3', attempt: 1 });
    // @ts-expect-error not an event of the spec table
    analytics.track('not_an_event', {});
    // @ts-expect-error cause must be one of guard | camera | laser
    analytics.track('attempt_fail', { level_id: 'd3', attempt: 1, cause: 'fall', tick: 3, ms_since_level_start: 1000 });
  });
});

describe('super properties (A2 config / storage, A3 i18n)', () => {
  it('attaches anonId, shareId, language, consent, version, build, device, src, internal, flags', () => {
    const anonId = '11111111-2222-4333-8444-555555555555';
    const storage = testStorage({
      schema: YAP_PROFILE_SCHEMA,
      anonId,
      internal: true,
      flags: { ghost: false },
      shareId: 'deadbeef',
      consent: true,
    });
    storage.set('lang', 'en');
    const transport = new MockTransport();
    const analytics = new YapAnalytics(baseOptions(storage, transport));

    analytics.track('heartbeat', { active_ms: 30000 });

    const captured = transport.sent[0];
    if (captured === undefined) throw new Error('no event captured');
    expect(captured.distinctId).toBe(anonId);
    expect(captured.timestamp).toBe('2025-11-05T10:00:00.000Z');
    const props = captured.properties;
    expect(props.anonId).toBe(anonId);
    expect(props.shareId).toBe('deadbeef');
    expect(props.consent).toBe(true);
    expect(props.language).toBe('en');
    expect(props.version).toBe(YAP_CORP.version);
    expect(props.build).toBe(YAP_CORP.version);
    expect(props.device).toBe('mobile');
    expect(props.src).toBe('portal');
    expect(props.internal).toBe(true);
    expect(props.flags).toEqual({ ghost: false });
  });

  it('falls back to a fresh anonId, detected language and desktop when nothing is stored', () => {
    const transport = new MockTransport();
    const analytics = new YapAnalytics({
      ...baseOptions(testStorage(), transport),
      search: () => '',
      navigatorLike: { language: 'en-US', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
    });

    analytics.track('app_open', { entry: 'direct', is_first_open: true });

    const props = transport.sent[0]?.properties ?? {};
    expect(String(props.anonId)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(props.shareId).toBeNull();
    expect(props.consent).toBe(false);
    expect(props.language).toBe('en');
    expect(props.device).toBe('desktop');
    expect(props.src).toBeNull();
    expect(props.internal).toBe(false);
    expect(props.flags).toEqual({ ghost: true });
  });
});

describe('no URL with its fragment', () => {
  it('strips the fragment from the current URL and derives host / pathname from it', () => {
    const transport = new MockTransport();
    const analytics = new YapAnalytics(baseOptions(testStorage(), transport));

    analytics.track('link_opened', {
      day: 3,
      sender_share_id: 'a1b2c3d4',
      is_new_player: false,
      is_self: false,
    });

    const props = transport.sent[0]?.properties ?? {};
    expect(props.$current_url).toBe('https://yap-corp-perfect-crime.pages.dev/c/3');
    expect(String(props.$current_url)).not.toContain('#');
    expect(props.$host).toBe('yap-corp-perfect-crime.pages.dev');
    expect(props.$pathname).toBe('/c/3');
  });

  it('strips the fragment from URL-like property values', () => {
    const transport = new MockTransport();
    const analytics = new YapAnalytics(baseOptions(testStorage(), transport));

    analytics.track('share_result', {
      method: 'clipboard',
      outcome: 'completed',
      variant: 'https://yap-corp-perfect-crime.pages.dev/c/1#secret-payload',
    });

    const props = transport.sent[0]?.properties ?? {};
    expect(props.variant).toBe('https://yap-corp-perfect-crime.pages.dev/c/1');
    for (const value of Object.values(props)) {
      if (typeof value === 'string') expect(value).not.toMatch(/^https?:\/\/.*#/);
    }
  });

  it('yapUrlWithoutFragment leaves fragment-free URLs untouched', () => {
    expect(yapUrlWithoutFragment('https://x.test/c/1')).toBe('https://x.test/c/1');
    expect(yapUrlWithoutFragment('https://x.test/c/1#abc')).toBe('https://x.test/c/1');
    expect(yapUrlWithoutFragment('https://x.test/#')).toBe('https://x.test/');
  });
});

describe('YapPostHogTransport (EU capture API)', () => {
  const captured: YapCapturedEvent = {
    event: 'app_open',
    distinctId: 'anon-1',
    timestamp: '2025-11-05T10:00:00.000Z',
    properties: { entry: 'direct', is_first_open: true },
  };

  it('posts a batch to the EU host with the api key, distinct_id and properties', async () => {
    expect(YAP_POSTHOG_EU_HOST).toBe('https://eu.i.posthog.com');
    expect(typeof YAP_POSTHOG_API_KEY).toBe('string');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true } as unknown as Response);
    }) as unknown as typeof fetch;
    const transport = new YapPostHogTransport({ apiKey: 'phc_test', fetchFn });

    expect(transport.host).toBe('https://eu.i.posthog.com');
    await transport.send([captured]);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call === undefined) throw new Error('no request recorded');
    expect(call.url).toBe('https://eu.i.posthog.com/batch/');
    expect(call.init.method).toBe('POST');
    const rawBody = call.init.body;
    if (typeof rawBody !== 'string') throw new Error('unexpected request body');
    const body = JSON.parse(rawBody) as {
      api_key: string;
      batch: Array<Record<string, unknown>>;
    };
    expect(body.api_key).toBe('phc_test');
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]).toEqual({
      event: 'app_open',
      distinct_id: 'anon-1',
      timestamp: '2025-11-05T10:00:00.000Z',
      properties: { entry: 'direct', is_first_open: true },
    });
  });

  it('swallows network failures and never rejects', async () => {
    const fetchFn = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const transport = new YapPostHogTransport({ fetchFn });
    await expect(transport.send([captured])).resolves.toBeUndefined();
  });

  it('does nothing without fetch or with an empty batch', async () => {
    const noFetch = new YapPostHogTransport({ fetchFn: undefined });
    await expect(noFetch.send([captured])).resolves.toBeUndefined();
    const fetchFn = (() => Promise.resolve({ ok: true } as unknown as Response)) as unknown as typeof fetch;
    const transport = new YapPostHogTransport({ fetchFn });
    await expect(transport.send([])).resolves.toBeUndefined();
  });
});

describe('track() single entry point', () => {
  it('delegates to the shared instance configured with a mock transport', () => {
    const transport = new MockTransport();
    configureYapAnalytics(baseOptions(testStorage(), transport));

    track('streak_day', { streak: 5 });

    expect(transport.sent).toHaveLength(1);
    const captured = transport.sent[0];
    if (captured === undefined) throw new Error('no event captured');
    expect(captured.event).toBe('streak_day');
    expect(captured.properties.streak).toBe(5);
    expect(typeof captured.distinctId).toBe('string');
  });

  it('never throws when the transport fails synchronously or rejects', async () => {
    const throwing: YapAnalyticsTransport = {
      send: () => {
        throw new Error('boom');
      },
    };
    const analytics = new YapAnalytics(baseOptions(testStorage(), throwing));
    expect(() => analytics.track('error', { message: 'x', scene: 'yap-boot' })).not.toThrow();

    const rejecting: YapAnalyticsTransport = { send: () => Promise.reject(new Error('net')) };
    const analytics2 = new YapAnalytics(baseOptions(testStorage(), rejecting));
    analytics2.track('heartbeat', { active_ms: 1000 });
    // Give the rejected promise a turn: an unhandled rejection would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
