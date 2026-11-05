// Tests for the share previews in the plan style (plan style 6/6, spec §13
// step 6): the 1200 × 630 image of /c/<day> and / is a sheet of the file —
// the paper page, the heist as a plan (paper floor, hatched walls, ink frame)
// — and stays spoiler-free: no route, no cone. The rasterizer of tools/og.ts
// is pure, so its pixels are checked here directly.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  YAP_CAMERA_CONE_ALPHA,
  YAP_GUARD_CONE_ALPHA,
  YAP_PALETTE,
  yapCellRect,
  yapMixHex,
} from '../../src/game/board';
import {
  YAP_OG_HEIGHT,
  YAP_OG_WIDTH,
  generateYapOgImages,
  yapDecodePngPixels,
  yapHexToRgb,
  yapLevelForDay,
  yapLoadLevelEntries,
  yapOgBoardLayout,
  yapRenderAllOgPngs,
  yapRenderOgPixels,
  yapTutorialLevel,
} from '../../tools/og';

const ENTRIES = yapLoadLevelEntries(process.cwd());
const T1 = yapTutorialLevel(ENTRIES);

/** The pixel at (x, y) of a rendered preview, as #RRGGBB. */
function pixel(data: Uint8ClampedArray, x: number, y: number): string {
  const i = (Math.floor(y) * YAP_OG_WIDTH + Math.floor(x)) * 4;
  const hex = (n: number | undefined): string => (n ?? 0).toString(16).padStart(2, '0');
  return `#${hex(data[i])}${hex(data[i + 1])}${hex(data[i + 2])}`.toUpperCase();
}

/** How many pixels of `data` are exactly `colour`. */
function count(data: Uint8ClampedArray, colour: string): number {
  const [r, g, b] = yapHexToRgb(colour);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === r && data[i + 1] === g && data[i + 2] === b) n += 1;
  }
  return n;
}

describe('the share preview is a plan sheet', () => {
  const data = yapRenderOgPixels(T1, 'Daily heist #1', 'Perfect Crime', 'Yap Corp');

  it('is 1200 × 630 on the paper page', () => {
    expect(data.length).toBe(YAP_OG_WIDTH * YAP_OG_HEIGHT * 4);
    // off the 20 px page grid, the page is paper-page
    expect(pixel(data, 10, 10)).toBe(YAP_PALETTE['paper-page']);
  });

  it('draws the heist as a plan: paper floor, hatched walls, ink frame', () => {
    const layout = yapOgBoardLayout(T1);
    expect(layout.frame).toBeGreaterThan(0);
    // a floor cell with nothing on it is paper at its centre
    const floor = yapCellRect(layout, { x: 1, y: 8 });
    expect(pixel(data, floor.x + floor.w / 2, floor.y + floor.h / 2)).toBe(YAP_PALETTE.paper);
    // a wall cell holds both the hatch ground and its ink hatching
    const wall = yapCellRect(layout, { x: 0, y: 5 });
    const seen = new Set<string>();
    for (let y = wall.y + 3; y < wall.y + wall.h - 3; y += 1) {
      for (let x = wall.x + 3; x < wall.x + wall.w - 3; x += 1) seen.add(pixel(data, x, y));
    }
    expect(seen.has(YAP_PALETTE['hatch-ground'])).toBe(true);
    expect(seen.has(YAP_PALETTE.ink)).toBe(true);
    // the board's outer edge is the ink frame
    expect(pixel(data, layout.originX, layout.originY + layout.boardHeight / 2)).toBe(
      YAP_PALETTE.ink,
    );
  });

  it('stays spoiler-free: no route, no cone', () => {
    const d5 = yapRenderOgPixels(
      yapLevelForDay(ENTRIES, 5),
      'Daily heist #5',
      'Perfect Crime',
      'Yap Corp',
    );
    // a route, or a cone as the game draws it (a tint over the paper floor)
    for (const colour of [
      YAP_PALETTE.marker,
      YAP_PALETTE['guard-cone'],
      YAP_PALETTE.graphite,
      yapMixHex(YAP_PALETTE['guard-cone'], YAP_PALETTE.paper, YAP_GUARD_CONE_ALPHA),
      yapMixHex(YAP_PALETTE['camera-cone'], YAP_PALETTE.paper, YAP_CAMERA_CONE_ALPHA),
    ]) {
      expect(count(d5, colour), colour).toBe(0);
    }
  });

  it('renders every day and the default as PNG', () => {
    const all = yapRenderAllOgPngs(ENTRIES);
    expect(all.size).toBe(8);
    for (const [name, png] of all) {
      expect(Array.from(png.slice(0, 4)), name).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

describe('the build keeps previews whose pixels did not change', () => {
  /** The same pixels as `png`, compressed another way (another zlib, another level). */
  function recompress(png: Uint8Array): Uint8Array {
    const pixels = yapDecodePngPixels(png);
    if (pixels === null) throw new Error('not one of our PNGs');
    const stride = 1 + YAP_OG_WIDTH * 4;
    const raw = new Uint8Array(stride * YAP_OG_HEIGHT);
    for (let y = 0; y < YAP_OG_HEIGHT; y++) {
      raw.set(pixels.subarray(y * YAP_OG_WIDTH * 4, (y + 1) * YAP_OG_WIDTH * 4), y * stride + 1);
    }
    const head = png.slice(0, 33); // signature + IHDR
    const idat = new Uint8Array(deflateSync(raw, { level: 1 }));
    const chunk = (type: string, data: Uint8Array): Uint8Array => {
      const out = new Uint8Array(12 + data.length);
      new DataView(out.buffer).setUint32(0, data.length);
      out.set(new TextEncoder().encode(type), 4);
      out.set(data, 8);
      return out; // CRC left at 0: the decoder does not check it
    };
    return new Uint8Array([...head, ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array(0))]);
  }

  it('decodes its own PNGs', () => {
    const png = yapRenderAllOgPngs(ENTRIES).get('og-c-1.png');
    if (png === undefined) throw new Error('no og-c-1');
    const pixels = yapDecodePngPixels(png);
    expect(pixels?.length).toBe(YAP_OG_WIDTH * YAP_OG_HEIGHT * 4);
  });

  it('does not rewrite a preview whose pixels are the same (another zlib)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yap-og-'));
    generateYapOgImages(dir);
    const file = join(dir, 'og-c-1.png');
    const other = recompress(readFileSync(file));
    writeFileSync(file, other);
    generateYapOgImages(dir);
    expect(Array.from(readFileSync(file))).toEqual(Array.from(other));
  });

  it('rewrites a preview whose pixels changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yap-og-'));
    generateYapOgImages(dir);
    const file = join(dir, 'og-c-2.png');
    const fresh = readFileSync(file);
    writeFileSync(file, new Uint8Array([1, 2, 3]));
    generateYapOgImages(dir);
    expect(Array.from(readFileSync(file))).toEqual(Array.from(fresh));
  });
});
