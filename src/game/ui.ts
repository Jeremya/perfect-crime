// Game UI foundations (visual pass 3, direction B — docs/design/2026-10-30-plan-style-design.md).
//
// §6 "Rendering foundations": the canvas runs at CSS size, so text must be
// rasterized at the device pixel ratio or it is upscaled by 2–3× on phones.
// This factory is the single place that decides it; the scenes create every
// Text through it, which also gives the shared component kit a home.
import type Phaser from 'phaser';

/** Text resolution: the device pixel ratio, capped at 3 (design §6). */
export function yapTextResolution(): number {
  try {
    return Math.min(3, Math.max(1, globalThis.devicePixelRatio ?? 1));
  } catch {
    return 1;
  }
}

/**
 * A Text object rasterized at the device pixel ratio, so glyphs stay as sharp
 * as DOM text at 1×, 2× and 3×. Same signature as `scene.add.text`.
 */
export function yapText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...style, resolution: yapTextResolution() });
}
