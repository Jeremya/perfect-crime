// E2E for the fatal-cell marker back on the plan (story C4). The Gate 1 spec
// keeps a red marker on the fatal cell, but the heist is reset by then: a
// diamond caught on comes back as it was, without the cross. Each test
// compares the pixels of the fatal cell before and after the failure, with
// the route cleared so that only the marker can differ.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/failure.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { YAP_TEST_START_DATE } from '../../src/app/config';
import type { YapCell, YapLevel } from '../../src/core/level';
import type { YapMove } from '../../src/core/sim';
import { yapCellRect, yapLevelLayout } from '../../src/game/board';
import { yapHomeActions } from '../../src/game/home-layout';
import { YAP_ROW_FROM_BOTTOM, yapPlanningRow } from '../../src/game/kit';
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
  await server?.close();
});

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: YAP_MOBILE_UA,
  locale: 'en-US',
});

const CONSENT_REFUSED = { 'yapcorp:consent': 'refused' } as const;

const T2 = yapCatalogLevel('tutorial/t2');
const D3 = yapCatalogLevel('daily/d3');

/** A complete route on d3 that the guard stops on the diamond, at tick 10. */
const D3_CAUGHT_ON_DIAMOND: readonly YapMove[] = [
  ...['S', 'S', 'S', 'E', 'S', 'W', 'S', 'S', 'E', 'E'],
  ...['S', 'S', 'S', 'E', 'E', 'E'],
] as YapMove[];

/** A complete route on T2 that the guard stops on the floor cell (2,6). */
const T2_CAUGHT_ON_FLOOR: readonly YapCell[] = [
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

/** The pixels of one cell of `level`, as a PNG. */
async function yapCellPixels(page: Page, level: YapLevel, cell: YapCell): Promise<Buffer> {
  const view = await yapCanvasView(page);
  const rect = yapCellRect(yapLevelLayout(view.width, view.height, level), cell);
  return page.screenshot({
    clip: { x: view.x + rect.x, y: view.y + rect.y, width: rect.w, height: rect.h },
  });
}

/** Plays the drawn route to the failure, then taps back to the plan and clears the route. */
async function yapFailAndClear(page: Page, level: YapLevel, cells: readonly YapCell[]) {
  await yapDraw(page, level, cells);
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
  const clear = yapPlanningRow(view.width, false, true).clear;
  await yapTap(page, {
    x: clear.x + clear.width / 2,
    y: view.height - YAP_ROW_FROM_BOTTOM,
  });
  await page.waitForTimeout(300);
}

test.describe('the fatal-cell marker back on the plan', () => {
  test('a diamond caught on comes back without the cross', async ({ context, page }) => {
    const errors = yapPageErrors(page);
    // noon on day 3 of the test week, the clock running; the tutorial is done
    const [year, month, date] = YAP_TEST_START_DATE.split('-').map(Number);
    await page.clock.setSystemTime(new Date(year ?? 0, (month ?? 1) - 1, (date ?? 1) + 2, 12));
    await yapSeedStorage(context, {
      ...CONSENT_REFUSED,
      'yapcorp:levels': JSON.stringify({
        cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
        done: true,
      }),
    });
    await page.goto(`${baseUrl}/`);
    const view = await yapCanvasView(page);
    const home = yapHomeActions(view.width, view.height, 0);
    // Home has no phase hook: tap Play again only if the heist did not open,
    // so that no tap lands on a button of the heist
    await expect(async () => {
      await yapTap(page, { x: home.primary.x + home.primary.width / 2, y: home.primaryY });
      await yapWaitPhase(page, 'planning', 1_500);
    }).toPass({ timeout: 15_000 });
    await page.waitForTimeout(600);

    const before = await yapCellPixels(page, D3, D3.loot);
    await yapFailAndClear(page, D3, yapPlanCells(D3, D3_CAUGHT_ON_DIAMOND));
    expect((await yapCellPixels(page, D3, D3.loot)).equals(before)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a floor cell keeps its marker (Gate 1 spec)', async ({ context, page }) => {
    const errors = yapPageErrors(page);
    await yapSeedStorage(context, {
      ...CONSENT_REFUSED,
      'yapcorp:levels': '{"cleared":["tutorial/t1"],"done":false}',
    });
    await page.goto(`${baseUrl}/`);
    await yapWaitPhase(page, 'planning');
    await page.waitForTimeout(600);

    const fatal = { x: 2, y: 6 };
    const before = await yapCellPixels(page, T2, fatal);
    await yapFailAndClear(page, T2, T2_CAUGHT_ON_FLOOR);
    expect((await yapCellPixels(page, T2, fatal)).equals(before)).toBe(false);
    expect(errors).toEqual([]);
  });
});
