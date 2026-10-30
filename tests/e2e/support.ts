// Shared helpers of the end-to-end specs, which drive the BUILT app in dist/
// (Playwright, Chromium):
//   - a static server for dist/ (there is no playwright.config in this repo:
//     each spec serves the build itself on an ephemeral port);
//   - the levels the specs play, from the generated levels.json, and the
//     cells a solver plan walks through;
//   - page helpers: the level scene's phase (`window.__yapPhase`), strokes
//     and taps on the canvas in CSS pixels, seeded localStorage, and the
//     page's uncaught errors.
//
// The board geometry comes from src/game/board.ts, the same layout the level
// scene computes, so the pointer strokes land on the exact cells of the grid.
import type { BrowserContext, Page } from '@playwright/test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { YapCell, YapDir, YapLevel } from '../../src/core/level';
import type { YapMove } from '../../src/core/sim';
import { yapCellCenter, yapComputeLayout, type YapPoint } from '../../src/game/board';

// ---------------------------------------------------------------------------
// Static server for dist/
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

/** The dist/ server of one spec file. */
export interface YapDistServer {
  /** `http://127.0.0.1:<port>`, without a trailing slash. */
  readonly baseUrl: string;
  close(): Promise<void>;
}

/** Serves dist/ on an ephemeral port: start it in beforeAll, close it in afterAll. */
export async function yapStartDistServer(): Promise<YapDistServer> {
  const server = createServer((req, res) => {
    void yapServe(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ---------------------------------------------------------------------------
// Levels and plans
// ---------------------------------------------------------------------------

interface YapLevelsJson {
  readonly levels: readonly { readonly id: string; readonly level: YapLevel }[];
}

const LEVELS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../levels/levels.json', import.meta.url)), 'utf8'),
) as unknown as YapLevelsJson;

/** A level of the generated catalog ('tutorial/t1', 'daily/d3'…), as the game plays it. */
export function yapCatalogLevel(id: string): YapLevel {
  const entry = LEVELS.levels.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`${id} missing from levels/levels.json`);
  return entry.level;
}

const DIR_VECTORS: Record<YapDir, YapCell> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** The cells of a plan, start cell first (waits stay on their cell). */
export function yapPlanCells(level: YapLevel, plan: readonly YapMove[]): YapCell[] {
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
// Page helpers — every coordinate in CSS pixels, relative to the canvas
// ---------------------------------------------------------------------------

/** The iPhone user agent of the phone contexts. */
export const YAP_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** What the level scene shows, as exposed in `window.__yapPhase`. */
export type YapPhase = 'planning' | 'execution' | 'failure' | 'win';

/**
 * Waits until the level scene shows `phase`, then until the next frame is
 * rendered. Phaser hit-tests a tap as soon as it arrives, through the camera
 * transform of the last rendered frame: a tap sent in the same frame as a
 * camera change (a fresh scene, the failure zoom undone) would land through
 * the previous view, which no finger is fast enough to do. No sleep: two
 * animation frames.
 */
export async function yapWaitPhase(page: Page, phase: YapPhase, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    (wanted) => (window as unknown as { __yapPhase?: string }).__yapPhase === wanted,
    phase,
    { timeout },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** The canvas on the page: its top-left corner and its CSS size. */
export interface YapCanvasView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function yapCanvasView(page: Page): Promise<YapCanvasView> {
  const box = await page.locator('canvas').first().boundingBox();
  if (box === null) throw new Error('the app canvas never appeared');
  return { x: box.x, y: box.y, width: Math.round(box.width), height: Math.round(box.height) };
}

/** A tap (mouse click) at `point`, in CSS pixels from the canvas corner. */
export async function yapTap(page: Page, point: YapPoint): Promise<void> {
  const view = await yapCanvasView(page);
  await page.mouse.click(view.x + point.x, view.y + point.y);
}

/** One stroke through the centres of `cells`, on the board layout of `level`. */
export async function yapDraw(
  page: Page,
  level: YapLevel,
  cells: readonly YapCell[],
): Promise<void> {
  const view = await yapCanvasView(page);
  const layout = yapComputeLayout(view.width, view.height, level.width, level.height);
  const points = cells.map((cell) => yapCellCenter(layout, cell));
  const first = points[0];
  if (first === undefined) throw new Error('empty route');
  await page.mouse.move(view.x + first.x, view.y + first.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(view.x + point.x, view.y + point.y);
  }
  await page.mouse.up();
}

/** PLAY, in the bottom bar: centred at (viewWidth / 2 + 42, viewHeight - 30). */
export async function yapPressPlay(page: Page): Promise<void> {
  const view = await yapCanvasView(page);
  await yapTap(page, { x: view.width / 2 + 42, y: view.height - 30 });
}

/** Seeds localStorage (full `yapcorp:` keys) before any page script runs. */
export async function yapSeedStorage(
  context: BrowserContext,
  entries: Readonly<Record<string, string>>,
): Promise<void> {
  await context.addInitScript((seed) => {
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, entries);
}

/** The page's uncaught errors, collected from now on: a spec expects none. */
export function yapPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  return errors;
}
