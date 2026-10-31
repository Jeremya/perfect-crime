// Tests for story C1, visual pass 3 — crisp HiDPI rendering, on the BUILT app
// (Playwright, Chromium).
//
// The canvas backing store is the CSS size times the device pixel ratio
// (capped at 3) while every scene keeps laying out in CSS pixels
// (src/game/hidpi.ts); the unit guards (tests/unit/hidpi-guard.test.ts) keep
// those conversions in one module. This spec drives the real bundle on
// emulated phones and checks what the guards cannot:
//   - the backing store at 390×844 @3, 393×852 @2.75, 360×640 @2 and on a
//     DPR 1 desktop, with the canvas at the frame's corner (no centring);
//   - a stroke and PLAY at 3x, up to the Win screen;
//   - the failure replay (board camera zoomed by the failure zoom times the
//     ratio, UI camera by the ratio alone) and the tap back to the plan at 3x,
//     also across resizes, one of them in the middle of the replay;
//   - a page frame resized without a window resize: the canvas follows it,
//     the plan is drawn once for it, and PLAY is under the finger again;
//   - a tap on the consent banner, an overlay scene with a camera of its own.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/hidpi.spec.ts
import {
  expect,
  test,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import type { YapCell } from '../../src/core/level';
import { solveLevel } from '../../src/core/solver';
import {
  YAP_MOBILE_UA,
  yapCanvasView,
  yapCatalogLevel,
  yapDraw,
  yapPageErrors,
  yapPlanCells,
  yapPressPlay,
  yapSeedStorage,
  yapStartDistServer,
  yapTap,
  yapWaitPhase,
  type YapDistServer,
} from './support';

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

const T1 = yapCatalogLevel('tutorial/t1');
const T2 = yapCatalogLevel('tutorial/t2');

/**
 * A route on T2 that walks into the static guard's cone: down the left wall,
 * then east along row 6, whose cells (2,6) to (4,6) the guard at (3,4) sees
 * facing south, towards the diamond (3,8) and the exit (5,10) it never reaches.
 */
const T2_CAUGHT: readonly YapCell[] = [
  { x: 1, y: 1 },
  { x: 1, y: 2 },
  { x: 1, y: 3 },
  { x: 1, y: 4 },
  { x: 1, y: 5 },
  { x: 1, y: 6 },
  { x: 2, y: 6 },
  { x: 3, y: 6 },
  { x: 3, y: 7 },
  { x: 3, y: 8 },
  { x: 4, y: 8 },
  { x: 5, y: 8 },
  { x: 5, y: 9 },
  { x: 5, y: 10 },
];

/** Consent answered up front (refused: zero analytics, no banner). */
const CONSENT_REFUSED = { 'yapcorp:consent': 'refused' } as const;
/** T1 cleared, tutorial not done: the app boots on T2. */
const T1_CLEARED = { 'yapcorp:levels': '{"cleared":["tutorial/t1"],"done":false}' } as const;

/** A phone context: mobile UA, touch, a CSS viewport and a device pixel ratio. */
function yapPhone(width: number, height: number, deviceScaleFactor: number): BrowserContextOptions {
  return {
    viewport: { width, height },
    deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: YAP_MOBILE_UA,
    locale: 'en-US',
  };
}

/** The canvas backing store (device pixels) and its CSS size. */
async function yapCanvasSizes(
  page: Page,
): Promise<{ width: number; height: number; clientWidth: number; clientHeight: number }> {
  return page
    .locator('canvas')
    .first()
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      };
    });
}

/** One tap in the middle of the canvas. */
async function yapTapCentre(page: Page): Promise<void> {
  const view = await yapCanvasView(page);
  await yapTap(page, { x: view.width / 2, y: view.height / 2 });
}

/** The page frame #game that holds the canvas: its top-left corner and CSS size. */
async function yapFrameBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#game').boundingBox();
  if (box === null) throw new Error('the #game frame never appeared');
  return box;
}

/**
 * Counts the planning headers the level scene draws, through its e2e hook:
 * each build of the planning chrome (top bar and action bar) sets
 * `window.__yapPhase` to 'planning', once, and nothing else does while the
 * plan is only looked at. Read the count with yapPlanningHeaders. Installed
 * before any page script, like yapSeedStorage.
 */
async function yapCountPlanningHeaders(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    let phase: unknown;
    let headers = 0;
    Object.defineProperty(window, '__yapPhase', {
      configurable: true,
      get: () => phase,
      set: (value: unknown) => {
        phase = value;
        if (value === 'planning') headers += 1;
      },
    });
    Object.defineProperty(window, '__yapPlanningHeaders', {
      configurable: true,
      get: () => headers,
    });
  });
}

async function yapPlanningHeaders(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __yapPlanningHeaders: number }).__yapPlanningHeaders,
  );
}

test('backs the canvas with device pixels', async ({ browser }) => {
  const cases: readonly {
    readonly name: string;
    readonly options: BrowserContextOptions;
    readonly expected: { width: number; height: number; clientWidth: number; clientHeight: number };
  }[] = [
    {
      name: 'phone 390×844 @3',
      options: yapPhone(390, 844, 3),
      expected: { width: 1170, height: 2532, clientWidth: 390, clientHeight: 844 },
    },
    {
      // a fractional ratio: 393 × 2.75 = 1080.75, rounded to 1081 device px
      name: 'phone 393×852 @2.75',
      options: yapPhone(393, 852, 2.75),
      expected: { width: 1081, height: 2343, clientWidth: 393, clientHeight: 852 },
    },
    {
      name: 'phone 360×640 @2',
      options: yapPhone(360, 640, 2),
      expected: { width: 720, height: 1280, clientWidth: 360, clientHeight: 640 },
    },
    {
      // the page frame caps the game at 480 CSS px wide on desktop
      name: 'desktop 1280×800 @1',
      options: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US' },
      expected: { width: 480, height: 800, clientWidth: 480, clientHeight: 800 },
    },
  ];
  for (const { name, options, expected } of cases) {
    const context = await browser.newContext(options);
    try {
      await yapSeedStorage(context, CONSENT_REFUSED);
      const page = await context.newPage();
      const errors = yapPageErrors(page);
      await page.goto(`${baseUrl}/`);
      await yapWaitPhase(page, 'planning');
      expect(await yapCanvasSizes(page), name).toEqual(expected);
      // no Phaser centring: the canvas sits at the frame's corner, also when
      // the rounded backing store makes it a fraction of a CSS px wider
      const canvas = await yapCanvasView(page);
      const frame = await yapFrameBox(page);
      expect({ x: canvas.x, y: canvas.y }, name).toEqual({ x: frame.x, y: frame.y });
      expect(errors, name).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test.describe('on a 390×844 phone at 3x', () => {
  test.use(yapPhone(390, 844, 3));

  test('draws a winning route at 3x', async ({ context, page }) => {
    const errors = yapPageErrors(page);
    await yapSeedStorage(context, CONSENT_REFUSED);
    await page.goto(`${baseUrl}/`);
    await yapWaitPhase(page, 'planning');
    await yapDraw(page, T1, yapPlanCells(T1, solveLevel(T1).plan));
    await yapPressPlay(page);
    await yapWaitPhase(page, 'win', 30_000);
    expect(errors).toEqual([]);
  });

  test('replays a failure and returns to the plan at 3x', async ({ context, page }) => {
    const errors = yapPageErrors(page);
    await yapSeedStorage(context, { ...CONSENT_REFUSED, ...T1_CLEARED });
    await page.goto(`${baseUrl}/`);
    await yapWaitPhase(page, 'planning');
    await yapDraw(page, T2, T2_CAUGHT);
    await yapPressPlay(page);
    await yapWaitPhase(page, 'failure');
    // one tap anywhere goes back to the intact plan...
    await yapTapCentre(page);
    await yapWaitPhase(page, 'planning');
    // ... whose PLAY is under the finger again once the zoom is undone
    await yapPressPlay(page);
    await yapWaitPhase(page, 'failure');
    expect(errors).toEqual([]);
  });

  test('follows a resize, also during the failure replay', async ({ context, page }) => {
    const errors = yapPageErrors(page);
    await yapSeedStorage(context, { ...CONSENT_REFUSED, ...T1_CLEARED });
    await page.goto(`${baseUrl}/`);
    await yapWaitPhase(page, 'planning');

    await page.setViewportSize({ width: 360, height: 640 });
    await expect
      .poll(() => yapCanvasSizes(page))
      .toEqual({
        width: 1080,
        height: 1920,
        clientWidth: 360,
        clientHeight: 640,
      });

    // the route is drawn on the resized layout, then the replay is resized
    await yapDraw(page, T2, T2_CAUGHT);
    await yapPressPlay(page);
    await yapWaitPhase(page, 'failure');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => yapCanvasSizes(page))
      .toEqual({
        width: 1170,
        height: 2532,
        clientWidth: 390,
        clientHeight: 844,
      });

    await yapTapCentre(page);
    await yapWaitPhase(page, 'planning');
    await yapPressPlay(page);
    await yapWaitPhase(page, 'failure');
    expect(errors).toEqual([]);
  });

  test('follows a frame size change without a window resize', async ({ context, page }) => {
    const errors = yapPageErrors(page);
    await yapSeedStorage(context, CONSENT_REFUSED);
    await yapCountPlanningHeaders(context);
    await page.goto(`${baseUrl}/`);
    await yapWaitPhase(page, 'planning');
    const headers = await yapPlanningHeaders(page);

    // the page shortens #game, the window keeps its size: no resize event
    await page.evaluate(() => {
      const frame = document.getElementById('game');
      if (frame === null) throw new Error('no #game frame');
      frame.style.height = '700px';
    });
    await expect
      .poll(() => yapCanvasSizes(page))
      .toEqual({
        width: 1170,
        height: 2100,
        clientWidth: 390,
        clientHeight: 700,
      });
    // the canvas ends where the frame ends: overflow: hidden clips no action bar
    const canvas = await yapCanvasView(page);
    const frame = await yapFrameBox(page);
    expect(canvas.y + canvas.height).toBe(frame.y + frame.height);

    // one new size, one planning header...
    expect(await yapPlanningHeaders(page)).toBe(headers + 1);
    // ... and none for Phaser's own refresh at the unchanged size, which its
    // window listener (here) and its parent poll emit as RESIZE in mode NONE
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    expect(await yapPlanningHeaders(page)).toBe(headers + 1);

    // PLAY is under the finger at its new place
    await yapWaitPhase(page, 'planning');
    await yapDraw(page, T1, yapPlanCells(T1, solveLevel(T1).plan));
    await yapPressPlay(page);
    await yapWaitPhase(page, 'win', 30_000);
    expect(errors).toEqual([]);
  });

  test('answers the consent banner at 3x', async ({ page }) => {
    // fresh storage: the first launch shows the banner over the top bar
    const errors = yapPageErrors(page);
    await page.goto(`${baseUrl}/`);
    await yapWaitPhase(page, 'planning');
    expect(await page.evaluate(() => localStorage.getItem('yapcorp:consent'))).toBeNull();
    // OK: YAP_BANNER_GAP (8) + YAP_ACCEPT_WIDTH (56) / 2 from the right edge,
    // vertically centred in the 64 px strip
    const view = await yapCanvasView(page);
    await yapTap(page, { x: view.width - 36, y: 32 });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('yapcorp:consent')))
      .toBe('granted');
    expect(errors).toEqual([]);
  });
});
