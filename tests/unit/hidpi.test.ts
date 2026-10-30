// Tests for the device-pixel helpers (story C1, visual pass 3 — crisp HiDPI
// rendering).
//
// The game draws at the device pixel ratio so that text and lines on a phone
// are as sharp as the browser's own. These helpers are the arithmetic under
// that: which ratio to trust, how large the canvas backing store is, and how
// to get back to the CSS pixels every scene lays out in. They are pure and
// Phaser-free, so they run in node, where there is no devicePixelRatio.
import { describe, expect, it } from 'vitest';
import { YAP_DPR, yapCssSize, yapDevicePixelRatio, yapDeviceSize } from '../../src/game/hidpi';

describe('yapDevicePixelRatio — the ratio the canvas is backed at', () => {
  it('clamps the device pixel ratio to [1, 3]', () => {
    const cases: ReadonlyArray<readonly [number | undefined, number]> = [
      // no usable ratio: one device pixel per CSS pixel
      [undefined, 1],
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 1],
      [0, 1],
      [0.5, 1],
      // a usable ratio is kept as it is, fractional ones included
      [1, 1],
      [2, 2],
      [2.625, 2.625],
      [3, 3],
      // above the cap
      [4, 3],
    ];
    for (const [raw, expected] of cases) {
      expect(yapDevicePixelRatio(raw), `raw ratio ${String(raw)}`).toBe(expected);
    }
  });
});

describe('yapDeviceSize — the backing store in device pixels', () => {
  it('sizes the backing store in device pixels', () => {
    expect(yapDeviceSize(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
    expect(yapDeviceSize(360, 640, 2)).toEqual({ width: 720, height: 1280 });
    // a fractional ratio rounds to the nearest whole device pixel: 393 × 2.75 = 1080.75
    expect(yapDeviceSize(393, 852, 2.75)).toEqual({ width: 1081, height: 2343 });
    // ... down as well as up (not a ceiling): 391 × 2.75 = 1075.25, 845 × 2.75 = 2323.75
    expect(yapDeviceSize(391, 845, 2.75)).toEqual({ width: 1075, height: 2324 });
  });
});

describe('yapCssSize — back to the pixels the scenes lay out in', () => {
  it('maps device pixels back to CSS pixels', () => {
    expect(yapCssSize(1170, 2532, 3)).toEqual({ width: 390, height: 844 });
    // an exact division, never rounded: half a CSS pixel stays half a CSS pixel
    expect(yapCssSize(721, 1281, 2)).toEqual({ width: 360.5, height: 640.5 });
  });
});

describe('YAP_DPR — read once at boot', () => {
  it('defaults to 1 outside a browser', () => {
    expect(YAP_DPR).toBe(1);
  });
});
