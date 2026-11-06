// Story D3 — the Settings screen and the privacy page, on the built game. The
// geometry comes from src/game/settings-layout.ts, the one the scene draws
// with. The payload of a shared link is decoded here, as a friend's game does.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { YAP_TEST_START_DATE } from '../../src/app/config';
import { YapPayload } from '../../src/app/payload';
import { solveLevel } from '../../src/core/solver';
import { yapCellCenter, yapConsentTopBar, yapLevelLayout } from '../../src/game/board';
import { yapWinActions } from '../../src/game/compose';
import { yapHomeActions, yapHomeSettingsBox } from '../../src/game/home-layout';
import { yapSettingsLayout, type YapSettingsRowId } from '../../src/game/settings-layout';
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
  type YapCanvasView,
  type YapDistServer,
} from './support';

const TUTORIAL_DONE = JSON.stringify({
  cleared: ['tutorial/t1', 'tutorial/t2', 'tutorial/t3', 'tutorial/t4', 'tutorial/t5'],
  done: true,
});

let server: YapDistServer;
test.beforeAll(async () => {
  server = await yapStartDistServer();
});
test.afterAll(async () => {
  await server.close();
});

/** A phone at 360 × 640, with nothing in its storage yet. */
function yapPhone(browser: Browser, locale = 'fr-FR'): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: false,
    userAgent: YAP_MOBILE_UA,
    locale,
  });
}

/** Records the text of every share; `yapSharedLink` reads the payload back. */
async function yapStubShare(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __yapShared: string[] };
    w.__yapShared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData): Promise<void> => {
        w.__yapShared.push(data.text ?? '');
        return Promise.resolve();
      },
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  });
}

const yapShared = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __yapShared: string[] }).__yapShared);

/** The nickname a friend's game reads from the first shared link. */
async function yapSharedNickname(page: Page): Promise<string | undefined> {
  const link = /#([\w-]+)/.exec((await yapShared(page))[0] ?? '')?.[1];
  if (link === undefined) throw new Error('no payload in the shared text');
  return YapPayload.decode(link)?.nickname;
}

interface YapSession {
  context: BrowserContext;
  page: Page;
  errors: string[];
  /** The PostHog events that left the device, in order. */
  sent: string[];
}

/** A phone at 360 × 640 with `seed` in its storage, on Home. */
async function yapOpen(
  browser: Browser,
  seed: Record<string, string>,
  locale = 'fr-FR',
): Promise<YapSession> {
  const context = await yapPhone(browser, locale);
  await yapSeedStorage(context, { 'yapcorp:levels': TUTORIAL_DONE, ...seed });
  const sent: string[] = [];
  await context.route('https://eu.i.posthog.com/**', async (route) => {
    const body = route.request().postDataJSON() as { batch?: { event: string }[] };
    for (const entry of body.batch ?? []) sent.push(entry.event);
    await route.fulfill({ status: 200, body: '{}' });
  });
  const page = await context.newPage();
  const errors = yapPageErrors(page);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitScreen(page, 'home');
  return { context, page, errors, sent };
}

/**
 * What a person takes before the next tap at the least. A click on the very
 * spot of the previous one is lost when it comes sooner (measured: 5 of 10 at
 * 0 ms, none at 150 ms, none once the pointer has moved). Back and Home's main
 * action share that spot, so a double tap on Back does not open a level.
 */
async function yapSettle(page: Page): Promise<void> {
  await page.waitForTimeout(200);
}

async function yapWaitScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(
    (name) => (window as unknown as { __yapScreen?: string }).__yapScreen === name,
    screen,
    { timeout: 15_000 },
  );
  await yapSettle(page);
}

async function yapOpenSettings(page: Page): Promise<YapCanvasView> {
  const view = await yapCanvasView(page);
  const gear = yapHomeSettingsBox(view.width);
  await yapTap(page, { x: gear.x + gear.width / 2, y: gear.y });
  await yapWaitScreen(page, 'settings');
  return view;
}

/** Taps the first or the second choice of a row. */
async function yapChoose(
  page: Page,
  view: YapCanvasView,
  id: YapSettingsRowId,
  choice: 'first' | 'second',
): Promise<void> {
  const row = yapSettingsLayout(view.width, view.height, true).rows.find((r) => r.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  await yapTap(page, { x: row[choice].x + row[choice].width / 2, y: row.y });
}

const stored = (page: Page, key: string): Promise<string | null> =>
  page.evaluate((name) => localStorage.getItem(name), key);

test('the gear opens Settings, Back returns to Home', async ({ browser }) => {
  const { context, page, errors } = await yapOpen(browser, { 'yapcorp:consent': 'refused' });
  const view = await yapOpenSettings(page);
  const { actions } = yapSettingsLayout(view.width, view.height, true);
  await yapTap(page, { x: view.width / 2, y: actions.primaryY });
  await yapWaitScreen(page, 'home');
  expect(errors).toEqual([]);
  await context.close();
});

test('the language changes at once and is remembered', async ({ browser }) => {
  const { context, page, errors } = await yapOpen(browser, { 'yapcorp:consent': 'refused' });
  const view = await yapOpenSettings(page);
  await yapChoose(page, view, 'language', 'second');
  await expect.poll(() => stored(page, 'yapcorp:lang')).toBe('en');
  await page.reload();
  await yapWaitScreen(page, 'home');
  expect(await stored(page, 'yapcorp:lang')).toBe('en');
  expect(errors).toEqual([]);
  await context.close();
});

test('sound and vibration can be cut, and are remembered', async ({ browser }) => {
  const { context, page } = await yapOpen(browser, { 'yapcorp:consent': 'refused' });
  const view = await yapOpenSettings(page);
  await yapChoose(page, view, 'sound', 'second');
  await yapChoose(page, view, 'vibration', 'second');
  await expect.poll(() => stored(page, 'yapcorp:sound')).toBe('off');
  await expect.poll(() => stored(page, 'yapcorp:vibration')).toBe('off');
  await yapChoose(page, view, 'sound', 'first');
  await expect.poll(() => stored(page, 'yapcorp:sound')).toBe('on');
  await context.close();
});

test('a refusal in Settings stops every event, on the network', async ({ browser }) => {
  const { context, page, sent } = await yapOpen(browser, { 'yapcorp:consent': 'granted' });
  await expect.poll(() => sent.length).toBeGreaterThan(0); // app_open: the sensor works
  const view = await yapOpenSettings(page);
  await yapChoose(page, view, 'consent', 'second');
  await expect.poll(() => stored(page, 'yapcorp:consent')).toBe('refused');
  await yapSettle(page);
  const before = sent.length;

  // leave Settings and open a level: level_start would go out
  const { actions } = yapSettingsLayout(view.width, view.height, true);
  await yapTap(page, { x: view.width / 2, y: actions.primaryY });
  await yapWaitScreen(page, 'home');
  const tutorial = yapHomeActions(view.width, view.height, 0);
  await yapTap(page, { x: view.width / 2, y: tutorial.primaryY });
  await yapWaitPhase(page, 'planning');
  await page.waitForTimeout(500);
  expect(sent).toHaveLength(before);
  await context.close();
});

test('OK in Settings after a refusal starts with consent_set', async ({ browser }) => {
  const { context, page, sent } = await yapOpen(browser, { 'yapcorp:consent': 'refused' });
  const view = await yapOpenSettings(page);
  expect(sent).toEqual([]);
  await yapChoose(page, view, 'consent', 'first');
  await expect.poll(() => sent[0]).toBe('consent_set');
  await context.close();
});

test('the nickname typed in Settings travels in the link shared from Home', async ({ browser }) => {
  const context = await yapPhone(browser);
  await yapSeedStorage(context, {
    'yapcorp:levels': TUTORIAL_DONE,
    'yapcorp:consent': 'refused',
    'yapcorp:days': JSON.stringify({
      '3': { winningAttempt: 2, bestTicks: 20, stars: 2, hints: 0, causes: [], par: 20, plan: [] },
    }),
  });
  await yapStubShare(context);
  const page = await context.newPage();
  const [year, month, date] = YAP_TEST_START_DATE.split('-').map(Number);
  await page.clock.setSystemTime(new Date(year ?? 0, (month ?? 1) - 1, (date ?? 1) + 2, 12));
  await page.goto(`${server.baseUrl}/`);
  await yapWaitScreen(page, 'home');
  const view = await yapOpenSettings(page);

  const row = yapSettingsLayout(view.width, view.height, true).rows.find(
    (r) => r.id === 'nickname',
  );
  if (row === undefined) throw new Error('no nickname row');
  await yapTap(page, { x: view.width / 2 + 40, y: row.y });
  const field = page.getByRole('textbox');
  await expect(field).toBeFocused();
  await field.pressSequentially('Alexandrine-Marie');
  expect(await field.inputValue()).toBe('Alexandrine-');
  await field.press('Enter');
  await expect(field).toHaveCount(0);
  await expect.poll(() => stored(page, 'yapcorp:nickname')).toBe('Alexandrine-');
  await yapSettle(page);

  const { actions } = yapSettingsLayout(view.width, view.height, true);
  await yapTap(page, { x: view.width / 2, y: actions.primaryY });
  await yapWaitScreen(page, 'home');
  const home = yapHomeActions(view.width, view.height, 3);
  const share = home.secondary[0];
  if (share === undefined) throw new Error('no secondary row');
  await expect
    .poll(async () => {
      await yapTap(page, { x: share.x + share.width / 2, y: home.secondaryY });
      return (await yapShared(page)).length;
    })
    .toBeGreaterThan(0);
  expect(await yapSharedNickname(page)).toBe('Alexandrine-');
  await context.close();
});

test('the nickname travels in the link shared from the Win screen', async ({ browser }) => {
  const context = await yapPhone(browser);
  await yapSeedStorage(context, {
    'yapcorp:levels': TUTORIAL_DONE,
    'yapcorp:consent': 'refused',
    'yapcorp:nickname': 'Sam',
  });
  await yapStubShare(context);
  const page = await context.newPage();
  const [year, month, date] = YAP_TEST_START_DATE.split('-').map(Number);
  await page.clock.setSystemTime(new Date(year ?? 0, (month ?? 1) - 1, (date ?? 1) + 3, 12));
  await page.goto(`${server.baseUrl}/`);
  await yapWaitScreen(page, 'home');
  const view = await yapCanvasView(page);
  const home = yapHomeActions(view.width, view.height, 0);
  await yapTap(page, { x: view.width / 2, y: home.primaryY });
  await yapWaitPhase(page, 'planning');
  await page.waitForTimeout(600);

  const heist = yapCatalogLevel('daily/d4');
  await yapDraw(page, heist, yapPlanCells(heist, solveLevel(heist).plan));
  await page.waitForTimeout(200);
  await yapPressPlay(page);
  await yapWaitPhase(page, 'win', 30_000);
  await page.waitForTimeout(600);
  const shareY = yapWinActions(view.height).shareY;
  await expect
    .poll(async () => {
      await yapTap(page, { x: view.width / 2, y: shareY });
      return (await yapShared(page)).length;
    })
    .toBeGreaterThan(0);
  expect(await yapSharedNickname(page)).toBe('Sam');
  await context.close();
});

test('a press outside the field ends the typing and keeps the text', async ({ browser }) => {
  const { context, page } = await yapOpen(browser, { 'yapcorp:consent': 'refused' });
  const view = await yapOpenSettings(page);
  const row = yapSettingsLayout(view.width, view.height, true).rows.find(
    (r) => r.id === 'nickname',
  );
  if (row === undefined) throw new Error('no nickname row');
  await yapTap(page, { x: view.width / 2 + 40, y: row.y });
  const field = page.getByRole('textbox');
  await field.pressSequentially('Sam');
  await yapTap(page, { x: 30, y: view.height / 2 + 100 });
  await expect(field).toHaveCount(0);
  await expect.poll(() => stored(page, 'yapcorp:nickname')).toBe('Sam');
  await context.close();
});

for (const locale of ['fr-FR', 'en-US']) {
  test(`the privacy page opens from Settings and fits 360 × 640 (${locale})`, async ({
    browser,
  }) => {
    const { context, page, errors } = await yapOpen(
      browser,
      { 'yapcorp:consent': 'refused' },
      locale,
    );
    const view = await yapOpenSettings(page);
    const { actions } = yapSettingsLayout(view.width, view.height, true);
    await yapTap(page, { x: view.width / 2, y: actions.secondaryY });
    await yapWaitScreen(page, 'privacy');
    const room = await page.evaluate(
      () => (window as unknown as { __yapPrivacyRoom: number }).__yapPrivacyRoom,
    );
    expect(room).toBeGreaterThanOrEqual(0);

    const back = yapHomeActions(view.width, view.height, 0);
    await yapTap(page, { x: view.width / 2, y: back.primaryY });
    await yapWaitScreen(page, 'settings');
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('Learn more opens the privacy page over the level, and the route survives', async ({
  browser,
}) => {
  const context = await yapPhone(browser);
  const page = await context.newPage();
  const errors = yapPageErrors(page);
  await page.goto(`${server.baseUrl}/`);
  await yapWaitPhase(page, 'planning');
  await page.waitForTimeout(400);
  const view = await yapCanvasView(page);

  // the start of the route, on the board the banner moved down
  const t1 = yapCatalogLevel('tutorial/t1');
  const banner = await page.evaluate(
    () => (window as unknown as { __yapBannerHeight: number }).__yapBannerHeight,
  );
  const layout = yapLevelLayout(view.width, view.height, t1, yapConsentTopBar(banner));
  const route = yapPlanCells(t1, solveLevel(t1).plan).slice(0, 4);
  const points = route.map((cell) => yapCellCenter(layout, cell));
  const untouched = await page.screenshot();
  await page.mouse.move(view.x + (points[0]?.x ?? 0), view.y + (points[0]?.y ?? 0));
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(view.x + point.x, view.y + point.y);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const drawn = await page.screenshot();
  expect(drawn.equals(untouched)).toBe(false);

  await yapTap(page, { x: 60, y: 30 }); // the copy of the banner
  await yapWaitScreen(page, 'privacy');
  const back = yapHomeActions(view.width, view.height, 0);
  await yapTap(page, { x: view.width / 2, y: back.primaryY });
  await page.waitForFunction(
    () => (window as unknown as { __yapScreen?: string | null }).__yapScreen !== 'privacy',
  );
  await page.waitForTimeout(300);

  // still the first launch: no answer yet, and the board is as it was
  expect(await stored(page, 'yapcorp:consent')).toBeNull();
  expect((await page.screenshot()).equals(drawn)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});
