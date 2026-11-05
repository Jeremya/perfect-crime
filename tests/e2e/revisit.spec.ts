// E2E for a route that crosses itself (story C2). Red Line, the fourth daily,
// has one way through: back across (5,6) after the diamond. A stroke that cut
// the route on every cell it touched lost the diamond and left PLAY off, so
// nobody could win it. This test draws that route with the pointer, in the
// built game, and plays it to the win.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/revisit.spec.ts
import { expect, test } from '@playwright/test';
import { YAP_TEST_START_DATE } from '../../src/app/config';
import { solveLevel } from '../../src/core/solver';
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
