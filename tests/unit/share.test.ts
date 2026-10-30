// Tests for story E2 — the Share button (src/app/share.ts, wired from the Win
// screen through src/game/win.ts). Gate 1 spec, "Sharing and challenges":
//   - the exact share text in EN and FR ("What gets sent");
//   - the link https://<domain>/c/<day>#<payload> with the E1 payload;
//   - the gesture: the native share sheet on mobile, the text copied with a
//     "Copied" message on desktop or when the share sheet fails;
//   - the three variants compared by E5 (text with the link inside, text and
//     link as separate fields, plus an image of the map);
//   - the funnel: share_tapped { context, day } and share_result { method,
//     outcome, variant }, through track() only, never a URL with its fragment.
// Everything runs in node with injected navigator / clipboard / tracker fakes.
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapLevel } from '../../src/core/level';
import { run, type YapPlan } from '../../src/core/sim';
import { YapI18n } from '../../src/app/i18n';
import { YAP_DOMAIN } from '../../src/app/config';
import { YapPayload, type YapPayloadData } from '../../src/app/payload';
import { YapStorage } from '../../src/app/storage';
import type { YapEventProps } from '../../src/app/analytics';
import {
  YAP_DEFAULT_SHARE_VARIANT,
  YAP_SHARE_ID_KEY,
  YAP_SHARE_VARIANT_KEY,
  YAP_SHARE_VARIANTS,
  yapBuildShareContent,
  yapLoadShareId,
  yapParseShareVariant,
  yapPrefersNativeShare,
  yapPrepareShareImage,
  yapPreparedShareImage,
  yapResolveShareDay,
  yapResolveShareVariant,
  yapShare,
  yapShareData,
  yapShareIdHex,
  yapShareImagePath,
  yapShareLink,
  yapShareStars,
  type YapShareContent,
  type YapShareNavigator,
  type YapShareRequest,
  type YapShareTrack,
} from '../../src/app/share';
import { YapAttemptLog, YapWinScreen } from '../../src/game/win';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const en = new YapI18n('en', null);
const fr = new YapI18n('fr', null);

/** The spec example: day 3, 4 tries (guard, guard, camera, win), 41 ticks, 2 stars. */
const SPEC_PAYLOAD: YapPayloadData = {
  day: 3,
  attempts: 4,
  ticks: 41,
  stars: 2,
  hints: 0,
  causes: ['guard', 'guard', 'camera'],
  shareId: 0xdeadbeef,
  plan: ['E', 'E', 'S', 'wait', 'S'],
  nickname: '',
};
const SPEC_SUMMARY = { attempts: 4, ticks: 41, stars: 2, emojiLine: '👁️👁️📷✅' };
const SPEC_LINK = `https://${YAP_DOMAIN}/c/3#${YapPayload.encode(SPEC_PAYLOAD)}`;

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

function abortError(): Error {
  const err = new Error('share cancelled');
  err.name = 'AbortError';
  return err;
}

/** Records every share event the module emits. */
function recorder(): { events: [string, Record<string, unknown>][]; track: YapShareTrack } {
  const events: [string, Record<string, unknown>][] = [];
  const track: YapShareTrack = (event, props) => {
    events.push([event, { ...(props as unknown as Record<string, unknown>) }]);
  };
  return { events, track };
}

interface YapFakeNav extends YapShareNavigator {
  shared: ShareData[];
  copied: string[];
}

/**
 * A fake navigator. `share` resolves, rejects with AbortError ('cancel'),
 * rejects with another error ('error'), or is absent (null). The clipboard
 * resolves ('ok'), rejects ('reject') or is absent (null).
 */
function fakeNav(options: {
  ua?: string;
  share?: 'ok' | 'cancel' | 'error' | null;
  canShareFiles?: boolean;
  noCanShare?: boolean;
  clipboard?: 'ok' | 'reject' | null;
}): YapFakeNav {
  const shared: ShareData[] = [];
  const copied: string[] = [];
  const mode = options.share === undefined ? 'ok' : options.share;
  const clip = options.clipboard === undefined ? 'ok' : options.clipboard;
  const nav: YapFakeNav = {
    shared,
    copied,
    userAgent: options.ua ?? MOBILE_UA,
    maxTouchPoints: 5,
  };
  if (mode !== null) {
    nav.share = (data: ShareData): Promise<void> => {
      shared.push(data);
      if (mode === 'cancel') return Promise.reject(abortError());
      if (mode === 'error') return Promise.reject(new Error('share failed'));
      return Promise.resolve();
    };
    if (options.noCanShare !== true) {
      nav.canShare = (data?: ShareData): boolean =>
        data?.files === undefined || options.canShareFiles === true;
    }
  }
  if (clip !== null) {
    Object.assign(nav, {
      clipboard: {
        writeText: (text: string): Promise<void> => {
          if (clip === 'reject') return Promise.reject(new Error('not allowed'));
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
  }
  return nav;
}

function content(i18n = en): YapShareContent {
  return yapBuildShareContent(SPEC_SUMMARY, SPEC_PAYLOAD, i18n);
}

function request(overrides: Partial<YapShareRequest> = {}): YapShareRequest {
  return { context: 'win', day: 3, content: content(), variant: 'text', image: null, ...overrides };
}

const PNG = new File([new Uint8Array([137, 80, 78, 71])], 'perfect-crime-3.png', {
  type: 'image/png',
});

// ---------------------------------------------------------------------------
// The share text — exact EN / FR against the spec example
// ---------------------------------------------------------------------------

describe('share text (Gate 1 spec, "What gets sent")', () => {
  it('builds the exact EN text of the spec example, the link inside', () => {
    expect(content(en).text).toBe(
      `Daily Heist #3 🕵️ cracked in 4 tries\n👁️👁️📷✅ · 41 ticks ⭐⭐\nYour turn: ${SPEC_LINK}`,
    );
  });

  it('builds the exact FR text of the spec example, the link inside', () => {
    expect(content(fr).text).toBe(
      `Casse du jour n°3 🕵️ réussi en 4 essais\n👁️👁️📷✅ · 41 ticks ⭐⭐\nÀ toi : ${SPEC_LINK}`,
    );
  });

  it('keeps a link-free body for the text-and-link-as-separate-fields variant', () => {
    const c = content(en);
    expect(c.body).toBe(
      'Daily Heist #3 🕵️ cracked in 4 tries\n👁️👁️📷✅ · 41 ticks ⭐⭐\nYour turn:',
    );
    expect(c.body).not.toContain('https://');
    expect(c.link).toBe(SPEC_LINK);
    expect(content(fr).body.endsWith('À toi :')).toBe(true);
  });

  it('says "1 try" / "1 essai" for a first-try win', () => {
    const summary = { ...SPEC_SUMMARY, attempts: 1, emojiLine: '✅' };
    const payload = { ...SPEC_PAYLOAD, attempts: 1, causes: [] };
    expect(yapBuildShareContent(summary, payload, en).text).toContain('cracked in 1 try\n');
    expect(yapBuildShareContent(summary, payload, fr).text).toContain('réussi en 1 essai\n');
  });

  it('writes one ⭐ per star', () => {
    expect(yapShareStars(1)).toBe('⭐');
    expect(yapShareStars(2)).toBe('⭐⭐');
    expect(yapShareStars(3)).toBe('⭐⭐⭐');
  });

  it('carries the hint bulbs and the collapsed line of the Win screen as is', () => {
    const summary = { ...SPEC_SUMMARY, emojiLine: '👁️👁️📷📷🔴…✅ 9💡' };
    expect(yapBuildShareContent(summary, SPEC_PAYLOAD, en).text).toContain(
      '\n👁️👁️📷📷🔴…✅ 9💡 · 41 ticks ⭐⭐\n',
    );
  });

  it('a tutorial win (no daily heist) shares an invitation to the game, without payload', () => {
    const summary = { attempts: 2, ticks: 9, stars: 3, emojiLine: '👁️✅' };
    const c = yapBuildShareContent(summary, null, en);
    expect(c.link).toBe(`https://${YAP_DOMAIN}/`);
    expect(c.text).toBe(
      `Perfect Crime 🕵️ tutorial cleared in 2 tries\n👁️✅ · 9 ticks ⭐⭐⭐\nYour turn: https://${YAP_DOMAIN}/`,
    );
    expect(c.text).not.toContain('#');
    expect(yapBuildShareContent(summary, null, fr).text.split('\n')[0]).toBe(
      'Perfect Crime 🕵️ tutoriel réussi en 2 essais',
    );
  });
});

// ---------------------------------------------------------------------------
// The link — https://<domain>/c/<day>#<payload>
// ---------------------------------------------------------------------------

describe('share link (Gate 1 spec, "The link")', () => {
  it('is https://<domain>/c/<day>#<payload> with the E1 payload', () => {
    const link = yapShareLink(SPEC_PAYLOAD);
    expect(link).toBe(SPEC_LINK);
    expect(link.startsWith(`https://${YAP_DOMAIN}/c/3#`)).toBe(true);
  });

  it('decodes back to the shared result', () => {
    const fragment = yapShareLink(SPEC_PAYLOAD).split('#')[1] ?? '';
    expect(YapPayload.decode(fragment)).toEqual(SPEC_PAYLOAD);
  });

  it('stays under 200 characters with a full 64-step plan and a nickname', () => {
    const plan: YapPlan = Array.from({ length: 64 }, () => 'wait' as const);
    const link = yapShareLink({ ...SPEC_PAYLOAD, plan, nickname: 'Alexandrine' });
    expect(link.length).toBeLessThan(200);
  });

  it('points a tutorial share (no payload) at the root page', () => {
    expect(yapShareLink(null)).toBe(`https://${YAP_DOMAIN}/`);
  });
});

// ---------------------------------------------------------------------------
// The three variants (E5 compares them on real phones)
// ---------------------------------------------------------------------------

describe('share variants', () => {
  it('lists the three variants, text with the link inside by default', () => {
    expect(YAP_SHARE_VARIANTS).toEqual(['text', 'fields', 'image']);
    expect(YAP_DEFAULT_SHARE_VARIANT).toBe('text');
  });

  it('text: one text field with the link inside', () => {
    expect(yapShareData(content(), 'text', null)).toEqual({ text: content().text });
  });

  it('fields: the text and the link as separate fields', () => {
    expect(yapShareData(content(), 'fields', null)).toEqual({
      text: content().body,
      url: SPEC_LINK,
    });
  });

  it('image: the text with the link plus the map image when canShare({ files }) allows', () => {
    const data = yapShareData(content(), 'image', PNG, () => true);
    expect(data).toEqual({ text: content().text, files: [PNG] });
  });

  it('image: falls back to the text when files cannot be shared or the image is missing', () => {
    expect(yapShareData(content(), 'image', PNG, () => false)).toEqual({ text: content().text });
    expect(yapShareData(content(), 'image', PNG)).toEqual({ text: content().text });
    expect(yapShareData(content(), 'image', null, () => true)).toEqual({ text: content().text });
  });

  it('parses ?share=text|fields|image and ignores anything else', () => {
    expect(yapParseShareVariant('?share=fields')).toBe('fields');
    expect(yapParseShareVariant('share=image')).toBe('image');
    expect(yapParseShareVariant('?share=text&flag=ghost:0')).toBe('text');
    expect(yapParseShareVariant('?share=video')).toBeNull();
    expect(yapParseShareVariant('')).toBeNull();
  });

  it('remembers the variant forced through the URL, without a rebuild', () => {
    const storage = new YapStorage(null);
    expect(yapResolveShareVariant(storage, '')).toBe('text');
    expect(yapResolveShareVariant(storage, '?share=image')).toBe('image');
    expect(storage.get(YAP_SHARE_VARIANT_KEY)).toBe('image');
    expect(yapResolveShareVariant(storage, '')).toBe('image'); // remembered
    expect(yapResolveShareVariant(storage, '?share=text')).toBe('text'); // reset
    expect(yapResolveShareVariant(storage, '')).toBe('text');
  });

  it('ignores a corrupted stored variant', () => {
    const storage = new YapStorage(null);
    storage.set(YAP_SHARE_VARIANT_KEY, 'bogus');
    expect(yapResolveShareVariant(storage, '')).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// The gesture — native share sheet, clipboard fallback, funnel events
// ---------------------------------------------------------------------------

describe('share gesture (Gate 1 spec, "The gesture")', () => {
  it('mobile: opens the share sheet synchronously, before any await', async () => {
    const nav = fakeNav({});
    const { track } = recorder();
    const pending = yapShare(request(), { navigator: nav, track });
    // Called within the same call stack as the tap (transient user activation).
    expect(nav.shared).toHaveLength(1);
    expect(nav.shared[0]).toEqual({ text: content().text });
    await pending;
  });

  it('mobile: share completed -> share_tapped then share_result native/completed', async () => {
    const nav = fakeNav({});
    const { events, track } = recorder();
    const report = await yapShare(request(), { navigator: nav, track });
    expect(report).toEqual({ method: 'native', outcome: 'completed', variant: 'text' });
    expect(events).toEqual([
      ['share_tapped', { context: 'win', day: 3 }],
      ['share_result', { method: 'native', outcome: 'completed', variant: 'text' }],
    ]);
    expect(nav.copied).toEqual([]);
  });

  it('mobile: an AbortError means the player cancelled — nothing is copied', async () => {
    const nav = fakeNav({ share: 'cancel' });
    const { events, track } = recorder();
    const report = await yapShare(request({ variant: 'fields' }), { navigator: nav, track });
    expect(report).toEqual({ method: 'native', outcome: 'cancelled', variant: 'fields' });
    expect(events[1]).toEqual([
      'share_result',
      { method: 'native', outcome: 'cancelled', variant: 'fields' },
    ]);
    expect(nav.copied).toEqual([]);
  });

  it('mobile: a failing share sheet falls back to copying the text', async () => {
    const nav = fakeNav({ share: 'error' });
    const { events, track } = recorder();
    const report = await yapShare(request(), { navigator: nav, track });
    expect(report).toEqual({ method: 'clipboard', outcome: 'completed', variant: 'text' });
    expect(nav.copied).toEqual([content().text]);
    expect(events.map(([name]) => name)).toEqual(['share_tapped', 'share_result']);
  });

  it('a share sheet that throws synchronously also falls back to the clipboard', async () => {
    const nav = fakeNav({});
    nav.share = (): Promise<void> => {
      throw new TypeError('bad data');
    };
    const report = await yapShare(request(), { navigator: nav, track: recorder().track });
    expect(report.method).toBe('clipboard');
    expect(nav.copied).toEqual([content().text]);
  });

  it('copies the full text (link inside) whatever the variant', async () => {
    const nav = fakeNav({ share: null });
    await yapShare(request({ variant: 'fields' }), { navigator: nav, track: recorder().track });
    expect(nav.copied).toEqual([content().text]);
  });

  it('desktop: copies the text directly, without opening any share sheet', async () => {
    const nav = fakeNav({ ua: DESKTOP_UA });
    nav.maxTouchPoints = 0;
    const { events, track } = recorder();
    const pending = yapShare(request(), { navigator: nav, track });
    expect(nav.copied).toEqual([content().text]); // writeText called synchronously too
    const report = await pending;
    expect(nav.shared).toEqual([]);
    expect(report).toEqual({ method: 'clipboard', outcome: 'completed', variant: 'text' });
    expect(events[1]?.[1]).toEqual({ method: 'clipboard', outcome: 'completed', variant: 'text' });
  });

  it('no share API at all: copies the text', async () => {
    const nav = fakeNav({ share: null });
    const report = await yapShare(request(), { navigator: nav, track: recorder().track });
    expect(report.method).toBe('clipboard');
    expect(report.outcome).toBe('completed');
  });

  it('clipboard refused: the last-resort copy takes over', async () => {
    const nav = fakeNav({ share: null, clipboard: 'reject' });
    const legacy: string[] = [];
    const report = await yapShare(request(), {
      navigator: nav,
      track: recorder().track,
      legacyCopy: (text) => {
        legacy.push(text);
        return true;
      },
    });
    expect(legacy).toEqual([content().text]);
    expect(report).toEqual({ method: 'clipboard', outcome: 'completed', variant: 'text' });
  });

  it('no clipboard API: the last-resort copy takes over', async () => {
    const nav = fakeNav({ share: null, clipboard: null });
    const report = await yapShare(request(), {
      navigator: nav,
      track: recorder().track,
      legacyCopy: () => true,
    });
    expect(report.outcome).toBe('completed');
  });

  it('everything fails: share_result clipboard/error', async () => {
    const nav = fakeNav({ share: 'error', clipboard: 'reject' });
    const { events, track } = recorder();
    const report = await yapShare(request(), {
      navigator: nav,
      track,
      legacyCopy: () => false,
    });
    expect(report).toEqual({ method: 'clipboard', outcome: 'error', variant: 'text' });
    expect(events[1]).toEqual([
      'share_result',
      { method: 'clipboard', outcome: 'error', variant: 'text' },
    ]);
  });

  it('image variant: sends the map file when the platform can share files', async () => {
    const nav = fakeNav({ canShareFiles: true });
    const report = await yapShare(request({ variant: 'image', image: PNG }), {
      navigator: nav,
      track: recorder().track,
    });
    expect(nav.shared[0]).toEqual({ text: content().text, files: [PNG] });
    expect(report.variant).toBe('image');
  });

  it('image variant: text only when the platform cannot share files', async () => {
    const nav = fakeNav({ canShareFiles: false });
    await yapShare(request({ variant: 'image', image: PNG }), {
      navigator: nav,
      track: recorder().track,
    });
    expect(nav.shared[0]).toEqual({ text: content().text });
  });

  it('a share sheet without canShare still gets the text (no files)', async () => {
    const nav = fakeNav({ noCanShare: true });
    await yapShare(request({ variant: 'image', image: PNG }), {
      navigator: nav,
      track: recorder().track,
    });
    expect(nav.shared[0]).toEqual({ text: content().text });
  });

  it('the share sheet is preferred on phones and iPads, not on desktops', () => {
    expect(yapPrefersNativeShare(fakeNav({}))).toBe(true);
    const desktop = fakeNav({ ua: DESKTOP_UA });
    desktop.maxTouchPoints = 0;
    expect(yapPrefersNativeShare(desktop)).toBe(false);
    // iPadOS Safari reports a desktop user agent but has touch points.
    expect(yapPrefersNativeShare(fakeNav({ ua: DESKTOP_UA }))).toBe(true);
    expect(yapPrefersNativeShare(fakeNav({ share: null }))).toBe(false);
    expect(yapPrefersNativeShare(undefined)).toBe(false);
  });

  it('a tutorial share reports day 0 (not a daily heist)', async () => {
    const { events, track } = recorder();
    await yapShare(request({ day: 0 }), { navigator: fakeNav({}), track });
    expect(events[0]).toEqual(['share_tapped', { context: 'win', day: 0 }]);
  });

  it('never tracks a URL, a fragment or the share text', async () => {
    for (const nav of [
      fakeNav({}),
      fakeNav({ share: 'cancel' }),
      fakeNav({ share: 'error' }),
      fakeNav({ share: null, clipboard: 'reject' }),
    ]) {
      const { events, track } = recorder();
      await yapShare(request({ variant: 'fields' }), {
        navigator: nav,
        track,
        legacyCopy: () => false,
      });
      for (const [, props] of events) {
        for (const value of Object.values(props)) {
          expect(String(value)).not.toMatch(/https?:|#|🕵️/);
        }
      }
    }
  });

  it('only emits the typed props of the spec event table', async () => {
    const { events, track } = recorder();
    await yapShare(request(), { navigator: fakeNav({}), track });
    const tapped = events[0]?.[1] as unknown as YapEventProps<'share_tapped'>;
    const result = events[1]?.[1] as unknown as YapEventProps<'share_result'>;
    expect(Object.keys(tapped).sort()).toEqual(['context', 'day']);
    expect(Object.keys(result).sort()).toEqual(['method', 'outcome', 'variant']);
  });
});

// ---------------------------------------------------------------------------
// Share ID, day, map image
// ---------------------------------------------------------------------------

describe('share ID (anonymous, 32 random bits)', () => {
  it('is created once, persisted as 8 hex digits, then stable', () => {
    const storage = new YapStorage(null);
    const id = yapLoadShareId(storage, () => 0x0a0b0c0d);
    expect(id).toBe(0x0a0b0c0d);
    expect(storage.get(YAP_SHARE_ID_KEY)).toBe('0a0b0c0d');
    expect(yapLoadShareId(storage, () => 42)).toBe(0x0a0b0c0d);
  });

  it('replaces a corrupted stored ID', () => {
    const storage = new YapStorage(null);
    storage.set(YAP_SHARE_ID_KEY, 'not-hex');
    expect(yapLoadShareId(storage, () => 7)).toBe(7);
    expect(yapShareIdHex(7)).toBe('00000007');
    expect(yapShareIdHex(0xffffffff)).toBe('ffffffff');
  });
});

describe('share day', () => {
  const now = new Date(2025, 10, 5, 12, 0, 0); // local day 3 of the test week

  it('a tutorial level has no daily heist: no day', () => {
    expect(yapResolveShareDay('tutorial', undefined, now)).toBeNull();
    expect(yapResolveShareDay('normal', { mode: 'tutorial', day: 3 }, now)).toBeNull();
  });

  it('uses the day passed in the scene data when there is one', () => {
    expect(yapResolveShareDay('normal', { day: 5 }, now)).toBe(5);
    expect(yapResolveShareDay('signature', { mode: 'archive', day: 1 }, now)).toBe(1);
  });

  it('falls back to the local daily heist for a daily level without a day', () => {
    expect(yapResolveShareDay('normal', undefined, now)).toBe(3);
    expect(yapResolveShareDay('normal', { day: 'x' }, now)).toBe(3);
    expect(yapResolveShareDay('normal', { day: 0 }, now)).toBe(3);
  });
});

describe('share image (spoiler-free map)', () => {
  it('uses the OG map preview of the day, without any path', () => {
    expect(yapShareImagePath(3)).toBe('/icons/og-c-3.png');
    expect(yapShareImagePath(null)).toBe('/icons/og-default.png');
  });

  it('is fetched ahead of the tap, then available synchronously', async () => {
    expect(yapPreparedShareImage(4)).toBeNull();
    const fetched: string[] = [];
    const fetchFn = (url: string): Promise<Response> => {
      fetched.push(url);
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }),
      );
    };
    const file = await yapPrepareShareImage(4, fetchFn);
    expect(fetched).toEqual(['/icons/og-c-4.png']);
    expect(file?.type).toBe('image/png');
    expect(file?.name).toBe('perfect-crime-4.png');
    expect(yapPreparedShareImage(4)).toBe(file);
    await yapPrepareShareImage(4, fetchFn); // cached: no second download
    expect(fetched).toHaveLength(1);
  });

  it('a missing image resolves to null (text fallback)', async () => {
    const file = await yapPrepareShareImage(200, () =>
      Promise.resolve(new Response(null, { status: 404 })),
    );
    expect(file).toBeNull();
    const failed = await yapPrepareShareImage(201, () => Promise.reject(new Error('offline')));
    expect(failed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Win screen integration (src/game/win.ts)
// ---------------------------------------------------------------------------

describe('YapWinScreen share payload (E1 payload of the win)', () => {
  const OPEN_MAP = [
    '########',
    '#S.....#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#..L..E#',
    '########',
  ];
  function lvl(par: number): YapLevel {
    return parseLevel(
      [
        'name: Test',
        'type: normal',
        'moment: ""',
        'maxPauses: 3',
        `par: ${par}`,
        'map: |',
        ...OPEN_MAP.map((row) => `  ${row}`),
      ].join('\n'),
    );
  }
  const WIN_PLAN: YapPlan = ['E', 'E', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'E', 'E', 'E'];

  it('carries day, attempts, ticks, stars, hints, causes, share ID and plan', () => {
    const level = lvl(12); // 14 ticks vs par 12 -> 2 stars
    const log = new YapAttemptLog();
    for (const cause of ['guard', 'guard', 'camera'] as const) {
      log.yapPressPlay();
      log.yapRegisterFailure(cause);
    }
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = new YapWinScreen(level, run(level, WIN_PLAN).outcome, log, 1);
    const data = win.yapPayloadData(3, WIN_PLAN, 0xdeadbeef);
    expect(data).toEqual({
      day: 3,
      attempts: 4,
      ticks: 14,
      stars: 2,
      hints: 1,
      causes: ['guard', 'guard', 'camera'],
      shareId: 0xdeadbeef,
      plan: WIN_PLAN,
      nickname: '',
    });
    expect(YapPayload.decode(YapPayload.encode(data))).toEqual(data);
  });

  it('keeps only the first 8 failure causes and clamps the counters to the payload bytes', () => {
    const level = lvl(14);
    const log = new YapAttemptLog();
    for (let i = 0; i < 300; i += 1) {
      log.yapPressPlay();
      log.yapRegisterFailure(i % 2 === 0 ? 'laser' : 'guard');
    }
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = new YapWinScreen(level, run(level, WIN_PLAN).outcome, log, 5);
    const data = win.yapPayloadData(7, WIN_PLAN, 1);
    expect(data.causes).toHaveLength(8);
    expect(data.causes[0]).toBe('laser');
    expect(data.attempts).toBe(255);
    expect(data.hints).toBe(3);
    expect(() => YapPayload.encode(data)).not.toThrow();
  });

  it('the Win screen summary builds the spec text', () => {
    const level = lvl(14);
    const log = new YapAttemptLog();
    log.yapPressPlay();
    log.yapRegisterWin();
    const win = new YapWinScreen(level, run(level, WIN_PLAN).outcome, log);
    const payload = win.yapPayloadData(2, WIN_PLAN, 9);
    const text = yapBuildShareContent(win.yapSharePayload(), payload, en).text;
    expect(text.split('\n').slice(0, 2)).toEqual([
      'Daily Heist #2 🕵️ cracked in 1 try',
      '✅ · 14 ticks ⭐⭐⭐',
    ]);
  });
});
