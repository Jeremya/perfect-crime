// Tests for story E5 — the share flow on the BUILT app (Playwright, Chromium).
//
// The unit tests (tests/unit/share.test.ts) cover src/app/share.ts with fakes;
// this spec drives the real bundle in dist/ end to end:
//   - the E3 challenge pages /c/<day> serve their OG preview (og-c-<day>.png)
//     so a pasted share link looks right in WhatsApp / Messages / Discord;
//   - on a phone (mobile UA + touch), winning tutorial T1 and tapping Share on
//     the Win screen opens the native share sheet (navigator.share stubbed in
//     the page) with the variant picked through ?share=text|fields|image;
//   - on desktop (no share API), the same tap copies the full text — link
//     included — to the clipboard instead.
//
// The plan that wins T1 comes from the same solver the game ships with
// (src/core/solver.ts). The dist/ server, the level catalog, the plan cells,
// the stroke and the PLAY tap are shared with the other specs (./support.ts),
// whose board geometry comes from src/game/board.ts so the strokes land on the
// exact cells of the grid; only the Share tap's geometry lives here.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/share.spec.ts
import { expect, test, type Page } from '@playwright/test';
import type { YapLevel } from '../../src/core/level';
import { solveLevel, type YapSolveResult } from '../../src/core/solver';
import { YAP_TEST_START_DATE } from '../../src/app/config';
import { YapPayload, type YapPayloadData } from '../../src/app/payload';
import { yapHomeActions } from '../../src/game/home-layout';
import { yapWinActions } from '../../src/game/compose';
import {
  YAP_MOBILE_UA as MOBILE_UA,
  yapCanvasView,
  yapCatalogLevel,
  yapDraw,
  yapPlanCells,
  yapPressPlay,
  yapStartDistServer,
  yapTap,
  yapWaitPhase,
  type YapCanvasView,
  type YapDistServer,
} from './support';

// ---------------------------------------------------------------------------
// Static server for dist/ (./support.ts): one per spec file, ephemeral port
// ---------------------------------------------------------------------------

let server: YapDistServer | null = null;
let baseUrl = '';

test.beforeAll(async () => {
  server = await yapStartDistServer();
  baseUrl = server.baseUrl;
});

test.afterAll(async () => {
  const closing = server;
  server = null;
  if (closing !== null) await closing.close();
});

// ---------------------------------------------------------------------------
// The level that is played: tutorial T1 from the generated levels.json
// ---------------------------------------------------------------------------

const T1: YapLevel = yapCatalogLevel('tutorial/t1');
const T1_SOLUTION: YapSolveResult = solveLevel(T1);

// ---------------------------------------------------------------------------
// Page helpers: the T1 win and the Share tap
// ---------------------------------------------------------------------------

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/** What the stubbed navigator.share received, serialized inside the page. */
interface YapShareCall {
  readonly text?: string | undefined;
  readonly url?: string | undefined;
  readonly files: readonly { readonly name: string; readonly type: string }[];
}

async function yapShareCalls(page: Page): Promise<YapShareCall[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __yapShareCalls?: ShareData[] };
    return (w.__yapShareCalls ?? []).map((data) => ({
      text: data.text,
      url: data.url,
      files: (data.files ?? []).map((file) => ({ name: file.name, type: file.type })),
    }));
  });
}

async function yapCopiedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __yapCopied?: string[] };
    return [...(w.__yapCopied ?? [])];
  });
}

/**
 * Open `path`, draw the winning plan on the board and press PLAY (the phase
 * wait, the stroke and the PLAY tap of ./support.ts). Returns the canvas the
 * Share tap aims at.
 */
async function yapWinTutorialT1(page: Page, path = '/'): Promise<YapCanvasView> {
  await page.goto(`${baseUrl}${path}`);
  await yapWaitPhase(page, 'planning');
  await yapDraw(page, T1, yapPlanCells(T1, T1_SOLUTION.plan));
  await yapPressPlay(page);
  return yapCanvasView(page);
}

/**
 * Tap the Win-screen Share button until `done` reports the share ended. Share
 * is the primary, full-width action of the win report, its centre line from
 * yapWinActions (src/game/compose.ts), the same layout the scene draws with.
 */
async function yapTapShareUntil(
  page: Page,
  view: YapCanvasView,
  done: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  // wait for the Win screen itself before tapping: the Share button only
  // exists there, and a tap during the playback does nothing
  await yapWaitPhase(page, 'win', timeoutMs);
  const share = { x: view.x + view.width / 2, y: view.y + yapWinActions(view.height).shareY };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return;
    await page.mouse.click(share.x, share.y);
    await page.waitForTimeout(400);
  }
  throw new Error('the share never happened (Win screen not reached?)');
}

// ---------------------------------------------------------------------------
// E3: the challenge pages a shared link points at
// ---------------------------------------------------------------------------

test.describe('E3 challenge pages (built app)', () => {
  test('a shared heist link /c/3 serves its OG preview and boots the app', async ({
    page,
    request,
  }) => {
    const response = await request.get(`${baseUrl}/c/3`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('property="og:title" content="Daily heist #3 · Perfect Crime"');
    expect(html).toContain(
      'property="og:image" content="https://yap-corp-perfect-crime.pages.dev/icons/og-c-3.png"',
    );
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain(
      'property="og:url" content="https://yap-corp-perfect-crime.pages.dev/c/3"',
    );
    // The preview image itself is served (what WhatsApp / Messages fetch).
    const image = await request.get(`${baseUrl}/icons/og-c-3.png`);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    // The root page carries the default preview.
    const root = await (await request.get(`${baseUrl}/`)).text();
    expect(root).toContain(
      'property="og:image" content="https://yap-corp-perfect-crime.pages.dev/icons/og-default.png"',
    );
    // And the challenge page still boots the game.
    await page.goto(`${baseUrl}/c/3`);
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// E2/E5: the share flow on a phone (native share sheet)
// ---------------------------------------------------------------------------

test.describe('share flow on a phone (mobile UA + touch)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    userAgent: MOBILE_UA,
    locale: 'en-US',
  });

  test.beforeEach(async ({ context }) => {
    // Answer the consent banner up front (refused: zero analytics, no banner).
    await context.addInitScript(() => {
      localStorage.setItem('yapcorp:consent', 'refused');
    });
    // Stub the share sheet: record what navigator.share receives.
    await context.addInitScript(() => {
      const w = window as unknown as { __yapShareCalls: ShareData[] };
      w.__yapShareCalls = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data: ShareData): Promise<void> => {
          w.__yapShareCalls.push(data);
          return Promise.resolve();
        },
      });
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (): boolean => true, // every target accepts files in this stub
      });
    });
  });

  test('default variant: the share sheet gets the text with the link inside', async ({ page }) => {
    const view = await yapWinTutorialT1(page);
    await yapTapShareUntil(page, view, async () => (await yapShareCalls(page)).length > 0);

    const calls = await yapShareCalls(page);
    expect(calls).toHaveLength(1);
    const data = calls[0];
    if (data === undefined) throw new Error('no share call');
    // 'text' variant: one text field, link on the last line, no url/files.
    expect(data.url).toBeUndefined();
    expect(data.files).toEqual([]);
    expect(data.text).toMatch(
      /^Perfect Crime 🕵️ tutorial cleared in 1 try\n✅ · \d+ ticks ⭐+\nYour turn: https:\/\/yap-corp-perfect-crime\.pages\.dev\/$/,
    );
    // No variant was forced: nothing was remembered, the default was used.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('yapcorp:share-variant')))
      .toBeNull();
  });

  test('?share=fields: the link goes in the separate url field', async ({ page }) => {
    const view = await yapWinTutorialT1(page, '/?share=fields');
    await yapTapShareUntil(page, view, async () => (await yapShareCalls(page)).length > 0);
    const calls = await yapShareCalls(page);
    expect(calls).toHaveLength(1);
    const data = calls[0];
    if (data === undefined) throw new Error('no share call');
    expect(data.url).toBe('https://yap-corp-perfect-crime.pages.dev/');
    expect(data.files).toEqual([]);
    // The body carries no link: it is the url field's job in this variant.
    expect(data.text).toMatch(
      /^Perfect Crime 🕵️ tutorial cleared in 1 try\n✅ · \d+ ticks ⭐+\nYour turn:$/,
    );
    expect(data.text).not.toContain('https://');
    // The URL choice is remembered under the yapcorp: prefix.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('yapcorp:share-variant')))
      .toBe('fields');
  });

  test('?share=image: the map preview is attached when the target accepts files', async ({
    page,
  }) => {
    // The Win screen fetches the OG preview (og-default.png for a tutorial
    // win) as soon as it opens. Waiting for the request is not enough: the
    // response still has to become a File, and an early tap legitimately
    // degrades to the text variant (yapPreparedShareImage() === null). So wait
    // for the response, then tap until a share call actually carries the file.
    const imageResponse = page.waitForResponse(
      (res) => res.url().includes('/icons/og-default.png'),
      { timeout: 20_000 },
    );
    const view = await yapWinTutorialT1(page, '/?share=image');
    await imageResponse;
    await yapTapShareUntil(page, view, async () =>
      (await yapShareCalls(page)).some((call) => call.files.length > 0),
    );
    const calls = await yapShareCalls(page);
    const data = calls.find((call) => call.files.length > 0);
    if (data === undefined) throw new Error('no share call with the map file');
    expect(data.files).toEqual([{ name: 'perfect-crime-0.png', type: 'image/png' }]);
    expect(data.text).toContain('Your turn: https://yap-corp-perfect-crime.pages.dev/');
  });
  test('Home Share opens the share sheet', async ({ context, page }) => {
    // noon local time on day 3 of the test week; the clock keeps running (a
    // fixed time would freeze the game loop and the fade-in of Home)
    const [year, month, date] = YAP_TEST_START_DATE.split('-').map(Number);
    await page.clock.setSystemTime(new Date(year ?? 0, (month ?? 1) - 1, (date ?? 1) + 2, 12));
    // a known player (tutorial done) who cleared today's heist, day 3
    await context.addInitScript(() => {
      localStorage.setItem(
        'yapcorp:levels',
        JSON.stringify({
          cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
          done: true,
        }),
      );
      localStorage.setItem(
        'yapcorp:days',
        JSON.stringify({
          '3': {
            winningAttempt: 2,
            bestTicks: 20,
            stars: 2,
            hints: 0,
            causes: [],
            par: 20,
            plan: [],
          },
        }),
      );
    });
    await page.goto(`${baseUrl}/`);
    const view = await yapCanvasView(page);
    // Home on day 3: Share, Archive (days 1 and 2) and Tutorial; Share first
    const share = yapHomeActions(view.width, view.height, 3).secondary[0];
    if (share === undefined) throw new Error('no secondary row');
    const point = {
      x: share.x + share.width / 2,
      y: yapHomeActions(view.width, view.height, 3).secondaryY,
    };
    // Home has no phase hook: tap until the share happens (a tap before the
    // screen is drawn does nothing), then make sure it happened once
    const deadline = Date.now() + 15_000;
    while ((await yapShareCalls(page)).length === 0 && Date.now() < deadline) {
      await yapTap(page, point);
      await page.waitForTimeout(400);
    }
    const calls = await yapShareCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('Daily Heist #3');
  });
});

// ---------------------------------------------------------------------------
// E6: the comparison after the linked heist, and the rematch
// ---------------------------------------------------------------------------

test.describe('E6: a taken challenge ends on the comparison', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    userAgent: MOBILE_UA,
    locale: 'en-US',
  });

  // Day 1: its optimal plan has no pause, so one stroke wins it.
  const D1: YapLevel = yapCatalogLevel('daily/d1');
  const D1_SOLUTION: YapSolveResult = solveLevel(D1);
  const ALEX: YapPayloadData = {
    day: 1,
    attempts: 3,
    ticks: D1_SOLUTION.par + 4,
    stars: 1,
    hints: 0,
    causes: ['guard', 'guard'],
    shareId: 0xa1b2c3d4,
    plan: [...D1_SOLUTION.plan],
    nickname: 'Alex',
  };

  async function yapScreen(page: Page): Promise<unknown> {
    return page.evaluate(() => (window as unknown as { __yapScreen?: unknown }).__yapScreen);
  }

  test('link, heist won, Win screen left: the comparison, then Share my result', async ({
    context,
    page,
  }) => {
    expect(D1_SOLUTION.plan).not.toContain('wait');
    await context.addInitScript(() => {
      localStorage.setItem('yapcorp:consent', 'refused');
      // a known player: straight to the heist, no express tutorial
      localStorage.setItem(
        'yapcorp:levels',
        JSON.stringify({
          cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
          done: true,
        }),
      );
      const w = window as unknown as { __yapShareCalls: ShareData[] };
      w.__yapShareCalls = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data: ShareData): Promise<void> => {
          w.__yapShareCalls.push(data);
          return Promise.resolve();
        },
      });
    });
    await page.goto(`${baseUrl}/c/1#${YapPayload.encode(ALEX)}`);
    const view = await yapCanvasView(page);
    const actions = yapHomeActions(view.width, view.height, 1);
    const primary = { x: actions.primary.x + actions.primary.width / 2, y: actions.primaryY };

    // the challenge card: no result yet, so the primary action takes the challenge
    await expect.poll(() => yapScreen(page)).toBe('challenge');
    await yapTap(page, primary);
    await yapWaitPhase(page, 'planning');

    // win the linked heist on the first attempt
    await yapDraw(page, D1, yapPlanCells(D1, D1_SOLUTION.plan));
    await yapPressPlay(page);
    await yapWaitPhase(page, 'win', 30_000);

    // leave the Win screen by its right-hand action: it leads to the comparison
    const leave = { x: view.width * 0.75, y: yapWinActions(view.height).rowY };
    await expect
      .poll(
        async () => {
          if ((await yapScreen(page)) === 'comparison') return true;
          await yapTap(page, leave);
          await page.waitForTimeout(400);
          return (await yapScreen(page)) === 'comparison';
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    expect(await yapShareCalls(page)).toHaveLength(0);

    // Share my result: the player's own link back, not the sender's
    await page.waitForTimeout(400);
    await yapTap(page, primary);
    await expect.poll(async () => (await yapShareCalls(page)).length).toBe(1);
    const text = (await yapShareCalls(page))[0]?.text ?? '';
    expect(text).toContain('Daily Heist #1');
    expect(text).toContain('cracked in 1 try');
    const fragment = /\/c\/1#(\S+)/.exec(text)?.[1] ?? '';
    const mine = YapPayload.decode(fragment);
    expect(mine).not.toBeNull();
    expect(mine?.attempts).toBe(1);
    expect(mine?.ticks).toBe(D1_SOLUTION.par);
    expect(mine?.shareId).not.toBe(ALEX.shareId);
    expect(mine?.plan).toEqual(D1_SOLUTION.plan);
  });
});

// ---------------------------------------------------------------------------
// E2/E5: desktop — no share API, the text is copied instead
// ---------------------------------------------------------------------------

test.describe('share flow on desktop (no share API)', () => {
  test.use({
    viewport: { width: 480, height: 800 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    userAgent: DESKTOP_UA,
    locale: 'en-US',
  });

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('yapcorp:consent', 'refused');
    });
    await context.addInitScript(() => {
      const w = window as unknown as { __yapCopied: string[] };
      w.__yapCopied = [];
      // Desktop: no navigator.share, a clipboard that records the copy.
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string): Promise<void> => {
            w.__yapCopied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
  });

  test('tapping Share copies the full text — link included — to the clipboard', async ({
    page,
  }) => {
    const view = await yapWinTutorialT1(page);
    await yapTapShareUntil(page, view, async () => (await yapCopiedTexts(page)).length > 0);

    // No native share on desktop: nothing went to a share sheet.
    expect(await yapShareCalls(page)).toEqual([]);
    const copied = await yapCopiedTexts(page);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatch(
      /^Perfect Crime 🕵️ tutorial cleared in 1 try\n✅ · \d+ ticks ⭐+\nYour turn: https:\/\/yap-corp-perfect-crime\.pages\.dev\/$/,
    );
  });
});
