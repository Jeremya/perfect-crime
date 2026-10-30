// Device-pixel helpers (C1 visual pass 3 — crisp HiDPI rendering).
//
// The game renders at the device pixel ratio so that text, lines and shapes on
// a phone are as sharp as the browser's own text: the canvas backing store is
// the CSS size times the ratio, and it is displayed at the CSS size. Scenes
// keep laying out in CSS pixels; these helpers convert between the two.
//
// This module must not import the Phaser runtime (type-only imports are
// fine): it is unit-tested in node (tests/unit/hidpi.test.ts), where there is
// no devicePixelRatio and YAP_DPR is 1. It is also the only module that
// touches the device pixels of a scene (its game size, a pointer position, a
// baked texture): tests/unit/hidpi-guard.test.ts keeps the scenes off them.
import type Phaser from 'phaser';

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

// ---------------------------------------------------------------------------
// Scenes: CSS pixels in, device pixels out
// ---------------------------------------------------------------------------

/**
 * The view size in CSS pixels, the one size every scene lays out in: the game
 * size (the canvas backing store, in device pixels) divided by the ratio.
 */
export function yapViewSize(scene: Phaser.Scene): { width: number; height: number } {
  return yapCssSize(scene.scale.width, scene.scale.height, YAP_DPR);
}

/** The view size in device pixels. Only for camera viewports, which Phaser sizes in them. */
export function yapDeviceViewport(scene: Phaser.Scene): { width: number; height: number } {
  return { width: scene.scale.width, height: scene.scale.height };
}

/**
 * Shows the CSS view on `camera`: zoom by the ratio, centred on the centre of
 * the view. The camera keeps its default origin (0.5), with which centerOn
 * maps the CSS view exactly onto a full device viewport, so world coordinates
 * are CSS pixels.
 */
export function yapFitCamera(
  scene: Phaser.Scene,
  camera: Phaser.Cameras.Scene2D.Camera = scene.cameras.main,
): void {
  const view = yapViewSize(scene);
  camera.setZoom(YAP_DPR);
  camera.centerOn(view.width / 2, view.height / 2);
}

/** Where `pointer` is in CSS pixels: its world position under the main camera. */
export function yapPointerView(
  scene: Phaser.Scene,
  pointer: Phaser.Input.Pointer,
): { x: number; y: number } {
  const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  return { x: point.x, y: point.y };
}

/**
 * Bakes what `draw` paints, in CSS pixels, into the texture `key` at device
 * resolution (replacing any previous texture with that key), so a baked grid
 * stays as crisp as one drawn live. Show it with yapBakedImage.
 */
export function yapBakeTexture(
  scene: Phaser.Scene,
  key: string,
  cssWidth: number,
  cssHeight: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.scaleCanvas(YAP_DPR, YAP_DPR);
  draw(g);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, Math.ceil(cssWidth * YAP_DPR), Math.ceil(cssHeight * YAP_DPR));
  g.destroy();
}

/** A texture baked by yapBakeTexture, its top-left corner at (x, y) in CSS pixels. */
export function yapBakedImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
): Phaser.GameObjects.Image {
  return scene.add
    .image(x, y, key)
    .setOrigin(0, 0)
    .setScale(1 / YAP_DPR);
}

/**
 * Keeps the game at the size of its page frame. Scale mode NONE does not
 * follow the page by itself, so every window resize (a rotation included)
 * resizes the game to the frame's CSS size in device pixels, which emits
 * RESIZE to the scenes.
 */
export function yapInstallResize(game: Phaser.Game, frame: HTMLElement): void {
  window.addEventListener('resize', () => {
    const size = yapDeviceSize(frame.clientWidth, frame.clientHeight, YAP_DPR);
    game.scale.resize(size.width, size.height);
  });
}
