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
// (src/core/solver.ts), and the board geometry from src/game/board.ts, so the
// pointer strokes land on the exact cells of the grid.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/share.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { YapCell, YapDir, YapLevel } from '../../src/core/level';
import { solveLevel, type YapSolveResult } from '../../src/core/solver';
import type { YapMove } from '../../src/core/sim';
import { yapCellCenter, yapComputeLayout, type YapBoardLayout, type YapPoint } from '../../src/game/board';

// ---------------------------------------------------------------------------
// Static server for dist/ (no playwright.config in this repo: the spec is
// self-contained and serves the build itself on an ephemeral port)
// ---------------------------------------------------------------------------

const DIST_DIR = fileURLToPath(new URL('../../dist/', import.meta.url));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

let server: Server | null = null;
let baseUrl = '';

async function yapServe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    // Static hosts serve /c/<day>/index.html for /c/<day> (Cloudflare Pages).
    else if (/^\/c\/\d+$/.test(pathname)) pathname = `${pathname}/index.html`;
    const filePath = normalize(join(DIST_DIR, pathname));
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

test.beforeAll(async () => {
  const created = createServer((req, res) => {
    void yapServe(req, res);
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  const address = created.address();
  if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  const closing = server;
  server = null;
  if (closing !== null) await new Promise<void>((resolve) => closing.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// The level that is played: tutorial T1 from the generated levels.json
// ---------------------------------------------------------------------------

interface YapLevelsJson {
  readonly levels: readonly { readonly id: string; readonly level: YapLevel }[];
}

const LEVELS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../levels/levels.json', import.meta.url)), 'utf8'),
) as unknown as YapLevelsJson;
const T1_ENTRY = LEVELS.levels.find((entry) => entry.id === 'tutorial/t1');
if (T1_ENTRY === undefined) throw new Error('tutorial/t1 missing from levels/levels.json');
const T1: YapLevel = T1_ENTRY.level;
const T1_SOLUTION: YapSolveResult = solveLevel(T1);

const DIR_VECTORS: Record<YapDir, YapCell> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** The cells of the winning plan, start cell first. */
function yapPlanCells(level: YapLevel, plan: readonly YapMove[]): YapCell[] {
  const cells: YapCell[] = [{ x: level.start.x, y: level.start.y }];
  let current = level.start;
  for (const move of plan) {
    if (move === 'wait') continue;
    const delta = DIR_VECTORS[move];
    current = { x: current.x + delta.x, y: current.y + delta.y };
    cells.push(current);
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Page helpers: geometry, the T1 win, and the Share tap
// ---------------------------------------------------------------------------

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
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

interface YapView {
  readonly box: { readonly x: number; readonly y: number };
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly layout: YapBoardLayout;
}

/** Canvas box + the board layout the scene computed for that size. */
async function yapView(page: Page): Promise<YapView> {
  const box = await page.locator('canvas').first().boundingBox();
  if (box === null) throw new Error('the app canvas never appeared');
  const viewWidth = Math.round(box.width);
  const viewHeight = Math.round(box.height);
  return {
    box,
    viewWidth,
    viewHeight,
    layout: yapComputeLayout(viewWidth, viewHeight, T1.width, T1.height),
  };
}

function yapToPage(view: YapView, point: YapPoint): { x: number; y: number } {
  return { x: view.box.x + point.x, y: view.box.y + point.y };
}

/** Open `path`, draw the winning plan on the board and press PLAY. */
async function yapWinTutorialT1(page: Page, path = '/'): Promise<YapView> {
  await page.goto(`${baseUrl}${path}`);
  await page.locator('canvas').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(500); // boot scene -> level scene build
  const view = await yapView(page);
  const cells = yapPlanCells(T1, T1_SOLUTION.plan);
  const points = cells.map((cell) => yapCellCenter(view.layout, cell));
  const first = points[0];
  if (first === undefined) throw new Error('empty plan');
  const start = yapToPage(view, first);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const at = yapToPage(view, point);
    await page.mouse.move(at.x, at.y);
  }
  await page.mouse.up();
  // PLAY: bottom bar, centred at (viewWidth/2 + 42, viewHeight - 30)
  const play = yapToPage(view, { x: view.viewWidth / 2 + 42, y: view.viewHeight - 30 });
  await page.mouse.click(play.x, play.y);
  return view;
}

/**
 * Tap the Win-screen Share button (centred at (viewWidth/2, viewHeight - 28))
 * until `done` reports the share ended. Before the Win screen the same point
 * is harmless (empty bottom bar, or PLAY while planning).
 */
async function yapTapShareUntil(
  page: Page,
  view: YapView,
  done: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const share = yapToPage(view, { x: view.viewWidth / 2, y: view.viewHeight - 28 });
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

  test('default variant: the share sheet gets the text with the link inside', async ({
    page,
  }) => {
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
    expect(data.text).toMatch(/^Perfect Crime 🕵️ tutorial cleared in 1 try\n✅ · \d+ ticks ⭐+\nYour turn:$/);
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
    // win) as soon as it opens; wait for that request before tapping Share.
    const imageRequested = page.waitForRequest(
      (req) => req.url().includes('/icons/og-default.png'),
      { timeout: 20_000 },
    );
    const view = await yapWinTutorialT1(page, '/?share=image');
    await imageRequested;
    await yapTapShareUntil(page, view, async () => (await yapShareCalls(page)).length > 0);
    const calls = await yapShareCalls(page);
    expect(calls).toHaveLength(1);
    const data = calls[0];
    if (data === undefined) throw new Error('no share call');
    expect(data.files).toEqual([{ name: 'perfect-crime-0.png', type: 'image/png' }]);
    expect(data.text).toContain('Your turn: https://yap-corp-perfect-crime.pages.dev/');
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
