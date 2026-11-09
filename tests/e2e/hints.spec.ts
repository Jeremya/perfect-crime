// The hints used reach the day record (C7, on the BUILT app): a share from
// Home or from the comparison is built from that record, so a hint taken on
// the way to the win must be in it, as it is in the Win screen's own share.
//
// The spec opens daily heist 1 through its link (mode 'daily', the only mode
// that writes the record), fails three times with the optimal route delayed
// by one pause on the start, takes the hint that the third failure unlocks,
// then wins with the optimal route.
//
// Run against the built app (npm run build first):
//   npx playwright test tests/e2e/hints.spec.ts
import { expect, test, type Page } from '@playwright/test';
import type { YapLevel } from '../../src/core/level';
import { run } from '../../src/core/sim';
import { solveLevel } from '../../src/core/solver';
import { yapCellCenter, yapLevelLayout } from '../../src/game/board';
import { YAP_ROW_FROM_BOTTOM, yapPlanningSlots } from '../../src/game/kit';
import {
  YAP_MOBILE_UA,
  yapCanvasView,
  yapCatalogLevel,
  yapDraw,
  yapPageErrors,
  yapPlanCells,
  yapSeedStorage,
  yapStartDistServer,
  yapTap,
  yapWaitPhase,
  type YapDistServer,
} from './support';

let server: YapDistServer | null = null;

test.beforeAll(async () => {
  server = await yapStartDistServer();
});

test.afterAll(async () => {
  await server?.close();
  server = null;
});

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent: YAP_MOBILE_UA,
  locale: 'en-US',
});

const D1: YapLevel = yapCatalogLevel('daily/d1');
const D1_PLAN = solveLevel(D1).plan;
const D1_ROUTE = yapPlanCells(D1, D1_PLAN);

/** A tap in the planning row, at the centre of `box`. */
async function yapTapRow(page: Page, box: { x: number; width: number } | null): Promise<void> {
  if (box === null) throw new Error('no such button in the row');
  const view = await yapCanvasView(page);
  await yapTap(page, { x: box.x + box.width / 2, y: view.height - YAP_ROW_FROM_BOTTOM });
  await page.waitForTimeout(300);
}

/** PLAY: the right end of the row, whatever stands between Clear and it. */
async function yapPlay(page: Page): Promise<void> {
  const view = await yapCanvasView(page);
  await yapTap(page, { x: view.width - 48, y: view.height - YAP_ROW_FROM_BOTTOM });
}

test('a hint taken before the win is kept in the day record', async ({ context, page }) => {
  test.setTimeout(90_000); // three slow-motion failures before the win
  // the premise: the optimal route, one tick late, is caught
  expect(D1_PLAN).not.toContain('wait');
  expect(run(D1, ['wait', ...D1_PLAN]).outcome.kind).toBe('detected');

  const errors = yapPageErrors(page);
  await yapSeedStorage(context, {
    'yapcorp:consent': 'refused',
    'yapcorp:levels': JSON.stringify({
      cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
      done: true,
    }),
  });
  // an unreadable payload opens the heist of the link's day, without a card
  await page.goto(`${server?.baseUrl ?? ''}/c/1#x`);
  await yapWaitPhase(page, 'planning');
  const view = await yapCanvasView(page);

  // the optimal route, then one pause on the start: a tap on its cell
  await yapDraw(page, D1, D1_ROUTE);
  await yapTap(page, yapCellCenter(yapLevelLayout(view.width, view.height, D1), D1.start));
  await page.waitForTimeout(300);

  // three failures: each tap on the failure screen brings the plan back intact
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await yapPlay(page);
    await yapWaitPhase(page, 'failure', 20_000);
    await page.waitForFunction(
      () => (window as unknown as { __yapStamp?: string | null }).__yapStamp === 'SPOTTED',
      undefined,
      { timeout: 20_000 },
    );
    await yapTap(page, { x: view.width / 2, y: view.height / 2 });
    await yapWaitPhase(page, 'planning');
    await page.waitForTimeout(300);
  }

  // Clear (finished route, a hint waiting), then the hint on the empty plan
  await yapTapRow(
    page,
    yapPlanningSlots(view.width, { canPlay: true, hint: true, observer: true, preview: true })
      .clear,
  );
  await yapTapRow(
    page,
    yapPlanningSlots(view.width, { canPlay: false, hint: true, observer: true, preview: false })
      .hint,
  );

  // the win, on the fourth attempt
  await yapDraw(page, D1, D1_ROUTE);
  await yapPlay(page);
  await yapWaitPhase(page, 'win', 30_000);

  const record = await page.evaluate(() => {
    const days = JSON.parse(localStorage.getItem('yapcorp:days') ?? '{}') as Record<
      string,
      { winningAttempt: number; hints: number }
    >;
    return days['1'] ?? null;
  });
  expect(record).toMatchObject({ winningAttempt: 4, hints: 1 });
  expect(errors).toEqual([]);
});
