// E2E for the daily heists that nobody could win (stories C2 and F3). Red
// Line has one way through: back across (5,6) after the diamond, and a stroke
// that cut the route on every cell it touched lost the diamond. The Blind Spot
// needed a U-turn after a pause, which the drawing erases. Each test draws the
// route with the pointer, in the built game, and plays it to the win.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/revisit.spec.ts
import { expect, test } from '@playwright/test';
import { YAP_TEST_START_DATE } from '../../src/app/config';
import { solveLevel } from '../../src/core/solver';
import { yapCellCenter, yapLevelLayout } from '../../src/game/board';
import { yapHomeActions } from '../../src/game/home-layout';
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

const D4 = yapCatalogLevel('daily/d4');

test('Red Line can be drawn across itself and won', async ({ context, page }) => {
  const errors = yapPageErrors(page);
  // noon on day 4 of the test week, the clock running; the tutorial is done
  const [year, month, date] = YAP_TEST_START_DATE.split('-').map(Number);
  await page.clock.setSystemTime(new Date(year ?? 0, (month ?? 1) - 1, (date ?? 1) + 3, 12));
  await yapSeedStorage(context, {
    'yapcorp:consent': 'refused',
    'yapcorp:levels': JSON.stringify({
      cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
      done: true,
    }),
  });
  await page.goto(`${baseUrl}/`);
  const view = await yapCanvasView(page);
  const home = yapHomeActions(view.width, view.height, 0);
  // Home has no phase hook: tap Play again only if the heist did not open
  await expect(async () => {
    await yapTap(page, { x: home.primary.x + home.primary.width / 2, y: home.primaryY });
    await yapWaitPhase(page, 'planning', 1_500);
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(600);

  const route = yapPlanCells(D4, solveLevel(D4).plan);
  expect(new Set(route.map((c) => `${c.x},${c.y}`)).size).toBeLessThan(route.length);
  await yapDraw(page, D4, route);
  await page.waitForTimeout(200);
  await yapPressPlay(page);
  await yapWaitPhase(page, 'win', 30_000);
  expect(errors).toEqual([]);
});

const D5 = yapCatalogLevel('daily/d5');

test('The Blind Spot is won with the pause under the camera', async ({ context, page }) => {
  const errors = yapPageErrors(page);
  const [year, month, date] = YAP_TEST_START_DATE.split('-').map(Number);
  await page.clock.setSystemTime(new Date(year ?? 0, (month ?? 1) - 1, (date ?? 1) + 4, 12));
  await yapSeedStorage(context, {
    'yapcorp:consent': 'refused',
    'yapcorp:levels': JSON.stringify({
      cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
      done: true,
    }),
  });
  await page.goto(`${baseUrl}/`);
  const view = await yapCanvasView(page);
  const home = yapHomeActions(view.width, view.height, 0);
  await expect(async () => {
    await yapTap(page, { x: home.primary.x + home.primary.width / 2, y: home.primaryY });
    await yapWaitPhase(page, 'planning', 1_500);
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(600);

  const plan = solveLevel(D5).plan;
  expect(plan.filter((move) => move === 'wait')).toHaveLength(1);
  const moves = plan.filter((move) => move !== 'wait');
  await yapDraw(page, D5, yapPlanCells(D5, moves));
  await page.waitForTimeout(200);
  // the whole route first, then the pause: a tap on the blind spot (5,6)
  const blindSpot = yapCellCenter(yapLevelLayout(view.width, view.height, D5), { x: 5, y: 6 });
  await yapTap(page, blindSpot);
  await page.waitForTimeout(200);
  await yapPressPlay(page);
  await yapWaitPhase(page, 'win', 30_000);
  expect(errors).toEqual([]);
});
