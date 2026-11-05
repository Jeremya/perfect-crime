// E2E for story X9, the Observer: the real scene, a real browser. The logic is
// unit-tested in tests/unit/observe.test.ts; this checks that the scene wires
// it: the button, the frozen frame, what Close gives back, and the flags.
import { expect, test, type Page } from '@playwright/test';
import { solveLevel } from '../../src/core/solver';
import { yapCellRect, yapLevelLayout } from '../../src/game/board';
import { yapActionRow, yapPlanningSlots, YAP_ROW_FROM_BOTTOM } from '../../src/game/kit';
import {
  yapCanvasView,
  yapCatalogLevel,
  yapDraw,
  yapPlanCells,
  yapPressPlay,
  yapSeedStorage,
  yapStartDistServer,
  yapTap,
  yapWaitPhase,
  type YapDistServer,
} from './support';

const CONSENT_REFUSED = { 'yapcorp:consent': 'refused' } as const;
const T4 = yapCatalogLevel('tutorial/t4');
const T4_PLAN = solveLevel(T4).plan;
const T4_ROUTE = yapPlanCells(
  T4,
  T4_PLAN.filter((m) => m !== 'wait'),
);
/** T4 opens straight on the plan with T1 to T3 cleared. */
const AT_T4 = {
  ...CONSENT_REFUSED,
  'yapcorp:levels': '{"cleared":["tutorial/t1","tutorial/t2","tutorial/t3"],"done":false}',
};

let server: YapDistServer;

test.beforeAll(async () => {
  server = await yapStartDistServer();
});
test.afterAll(async () => {
  await server.close();
});

interface YapObserverShown {
  readonly tick: number;
  readonly max: number;
  readonly playing: boolean;
  readonly caption: string;
}
interface YapObserverWindow {
  __yapPhase?: string;
  __yapObserver?: YapObserverShown;
}

const yapShown = (page: Page): Promise<YapObserverShown | undefined> =>
  page.evaluate(() => (window as unknown as YapObserverWindow).__yapObserver);
const yapPhaseNow = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => (window as unknown as YapObserverWindow).__yapPhase);

/** Waits for the observation to show `tick`, each frame: a tick lasts 500 ms. */
async function yapWaitTick(page: Page, tick: number, timeout = 6_000): Promise<void> {
  await page.waitForFunction(
    (wanted) => (window as unknown as YapObserverWindow).__yapObserver?.tick === wanted,
    tick,
    { timeout, polling: 'raf' },
  );
}

/** Centre of a box of the bottom row. */
async function yapTapRow(page: Page, box: { x: number; width: number }): Promise<void> {
  const view = await yapCanvasView(page);
  await yapTap(page, { x: box.x + box.width / 2, y: view.height - YAP_ROW_FROM_BOTTOM });
}

/** The boxes of the row while an observation runs: −1, Pause, +1, Close. */
async function yapObserverRow(page: Page) {
  const view = await yapCanvasView(page);
  const [back, toggle, forward, close] = yapActionRow(view.width, [
    { width: 64 },
    {},
    { width: 64 },
    { width: 88 },
  ]);
  if (back === undefined || toggle === undefined || forward === undefined || close === undefined) {
    throw new Error('no observer row');
  }
  return { back, toggle, forward, close };
}

/** The Observer button on a finished route. */
async function yapObserveFinishedRoute(page: Page): Promise<void> {
  const view = await yapCanvasView(page);
  const row = yapPlanningSlots(view.width, {
    canPlay: true,
    hint: false,
    observer: true,
    preview: true,
  });
  if (row.observer === null) throw new Error('no Observer');
  await yapTapRow(page, row.observer);
  await yapWaitPhase(page, 'observer');
}

/** The row of an unfinished route, with Observer. */
async function yapObserveRound(page: Page): Promise<void> {
  const view = await yapCanvasView(page);
  const row = yapPlanningSlots(view.width, {
    canPlay: false,
    hint: false,
    observer: true,
    preview: false,
  });
  if (row.observer === null) throw new Error('no Observer box');
  await yapTapRow(page, row.observer);
}

test('T4 without its pause stops on the fatal cell, and −1 shows the tick before', async ({
  context,
  page,
}) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapDraw(page, T4, T4_ROUTE);
  await yapObserveFinishedRoute(page);

  // the walk runs to the detection, then holds it
  await yapWaitTick(page, 4);
  await page.waitForTimeout(1_100);
  const held = await yapShown(page);
  expect(held).toMatchObject({ tick: 4, max: 4, playing: false });
  expect(held?.caption).toContain('4');

  const { back, close } = await yapObserverRow(page);
  await yapTapRow(page, back);
  await yapWaitTick(page, 3, 2_000);

  await yapTapRow(page, close);
  await yapWaitPhase(page, 'planning');
});

test('Close keeps the route, and PLAY runs it', async ({ context, page }) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapDraw(page, T4, T4_ROUTE);
  await yapObserveFinishedRoute(page);
  const { close } = await yapObserverRow(page);
  await yapTapRow(page, close);
  await yapWaitPhase(page, 'planning');

  await yapPressPlay(page);
  await yapWaitPhase(page, 'execution');
});

test('a fatal marker comes back after Close', async ({ context, page }) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapDraw(page, T4, T4_ROUTE);
  await yapPressPlay(page);
  await yapWaitPhase(page, 'failure', 20_000);
  await page.waitForFunction(
    () => (window as unknown as { __yapStamp?: string | null }).__yapStamp === 'SPOTTED',
    undefined,
    { timeout: 20_000 },
  );
  const view = await yapCanvasView(page);
  await yapTap(page, { x: view.width / 2, y: view.height / 2 });
  await yapWaitPhase(page, 'planning');
  await page.waitForTimeout(500);
  const rect = yapCellRect(yapLevelLayout(view.width, view.height, T4), T4_ROUTE[4] ?? T4.start);
  const clip = { x: view.x + rect.x, y: view.y + rect.y, width: rect.w, height: rect.h };
  const before = await page.screenshot({ clip });

  await yapObserveFinishedRoute(page);
  const { close } = await yapObserverRow(page);
  await yapTapRow(page, close);
  await yapWaitPhase(page, 'planning');
  await page.waitForTimeout(500);
  expect((await page.screenshot({ clip })).equals(before)).toBe(true);
});

test('a press moved from Observer to Preview fires neither', async ({ context, page }) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapDraw(page, T4, T4_ROUTE);
  const view = await yapCanvasView(page);
  const row = yapPlanningSlots(view.width, {
    canPlay: true,
    hint: false,
    observer: true,
    preview: true,
  });
  if (row.observer === null || row.preview === null) throw new Error('no buttons');
  const y = view.y + view.height - YAP_ROW_FROM_BOTTOM;
  await page.mouse.move(view.x + row.observer.x + row.observer.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(view.x + row.preview.x + row.preview.width / 2, y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await yapPhaseNow(page)).toBe('planning');
});

test('a level where nothing moves has no Observer', async ({ context, page }) => {
  await yapSeedStorage(context, CONSENT_REFUSED);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapObserveRound(page);
  await page.waitForTimeout(400);
  expect(await yapPhaseNow(page)).toBe('planning');
});

test('Observer watches the round before any route, and it loops', async ({ context, page }) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapObserveRound(page);
  await yapWaitPhase(page, 'observer');
  expect((await yapShown(page))?.max).toBe(6);
  await yapWaitTick(page, 5);
  await yapWaitTick(page, 0, 2_000);
});

test('a resize keeps the frame of a paused observation', async ({ context, page }) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapObserveRound(page);
  await yapWaitPhase(page, 'observer');
  const { forward } = await yapObserverRow(page);
  await yapTapRow(page, forward);
  await page.waitForTimeout(200);
  const tick = (await yapShown(page))?.tick ?? -1;
  expect((await yapShown(page))?.playing).toBe(false);

  const size = page.viewportSize();
  if (size === null) throw new Error('no viewport');
  await page.setViewportSize({ width: size.width + 40, height: size.height - 40 });
  await page.waitForTimeout(500);
  expect(await yapPhaseNow(page)).toBe('observer');
  expect((await yapShown(page))?.tick).toBe(tick);

  const after = await yapObserverRow(page);
  await yapTapRow(page, after.forward);
  await yapWaitTick(page, (tick + 1) % 6, 2_000);
});

test('under reduced motion Observer opens paused, and Play runs it', async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await yapObserveRound(page);
  await yapWaitPhase(page, 'observer');
  await page.waitForTimeout(800);
  expect(await yapShown(page)).toMatchObject({ tick: 0, playing: false });
  const { toggle } = await yapObserverRow(page);
  await yapTapRow(page, toggle);
  await yapWaitTick(page, 1, 2_000);
});

test('?flag=observer:0 leaves the row without Observer', async ({ context, page }) => {
  await yapSeedStorage(context, AT_T4);
  await page.goto(`${server.baseUrl}/?flag=observer:0`);
  await yapWaitPhase(page, 'planning');
  await yapObserveRound(page);
  await page.waitForTimeout(400);
  expect(await yapPhaseNow(page)).toBe('planning');
});
