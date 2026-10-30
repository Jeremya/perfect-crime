// Device-pixel helpers (C1 visual pass 3 — crisp HiDPI rendering).
//
// The game renders at the device pixel ratio so that text, lines and shapes on
// a phone are as sharp as the browser's own text: the canvas backing store is
// the CSS size times the ratio, and it is displayed at the CSS size. Scenes
// keep laying out in CSS pixels; these helpers convert between the two.
//
// This module must not import the Phaser runtime (type-only imports are
// fine): it is unit-tested in node (tests/unit/hidpi.test.ts), where there is
// no devicePixelRatio and YAP_DPR is 1.

/**
 * The ratio is capped at 3 (docs/design/2026-10-30-plan-style-design.md §6):
 * the backing store's pixel count grows with the square of the ratio.
 */
export const YAP_MAX_DPR = 3;

/**
 * The ratio to render at: 1 when `raw` is missing, not a finite number or
 * below 1; otherwise `raw`, capped at YAP_MAX_DPR. Fractional ratios (2.625)
 * are kept as they are.
 */
export function yapDevicePixelRatio(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, YAP_MAX_DPR);
}

/**
 * The ratio of this device, read once when the module loads (at boot). 1
 * outside a browser: node has no devicePixelRatio.
 */
export const YAP_DPR = yapDevicePixelRatio(globalThis.devicePixelRatio);

/**
 * A CSS-pixel size in device pixels, i.e. the canvas backing store: 390 × 844
 * at 3 is 1170 × 2532. The canvas holds whole pixels, so each side is rounded.
 */
export function yapDeviceSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { width: number; height: number } {
  return { width: Math.round(cssWidth * dpr), height: Math.round(cssHeight * dpr) };
}

/**
 * A device-pixel size in CSS pixels: an exact division, never rounded, so
 * scene layouts see the true CSS size.
 */
export function yapCssSize(
  deviceWidth: number,
  deviceHeight: number,
  dpr: number,
): { width: number; height: number } {
  return { width: deviceWidth / dpr, height: deviceHeight / dpr };
}
