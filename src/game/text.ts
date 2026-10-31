// Text factory (C1 visual pass 3 — crisp HiDPI rendering).
//
// Every Text in the game is created through yapText, with a style built by
// yapTextStyle. Phaser draws a Text into a canvas of its own at the style's
// `resolution`, 1 by default, and the game renders at the device pixel ratio:
// a Text left at 1 would be magnified and blurry on a phone. The factory sets
// the resolution to YAP_DPR and keeps the system font stacks in one place
// (docs/design/2026-10-30-plan-style-design.md §4), so no scene names a font.
//
// This module must not import the Phaser runtime (type-only imports are
// fine): it is unit-tested in node (tests/unit/text.test.ts). yapText needs
// none, it creates the Text through the scene it is given.
import type Phaser from 'phaser';
import { YAP_DPR } from './hidpi';

/**
 * The faces a Text can take. `ui` is the transitional face for the sans text
 * the screens already use (San Francisco on an iPhone instead of Helvetica);
 * later passes move titles and sentences to `serif` and kickers, numbers and
 * buttons to `mono`.
 */
export type YapFontFamily = 'ui' | 'serif' | 'mono';

/**
 * System fonts only, nothing to download. The faces differ by platform
 * (Android falls back to its own serif and mono), so layouts must not depend
 * on exact glyph widths.
 */
export const YAP_FONT_STACKS: Readonly<Record<YapFontFamily, string>> = {
  ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace',
};

/**
 * What a caller may add to a style: everything Phaser accepts except the keys
 * the factory sets. Size and color are arguments of yapTextStyle, `family`
 * replaces `fontFamily` by picking one of the three stacks, and the resolution
 * is always the device's. `font`, Phaser's shorthand that sets style, size and
 * family at once, is left out too: it would override the family and size the
 * factory sets.
 */
export interface YapTextExtra extends Omit<
  Phaser.Types.GameObjects.Text.TextStyle,
  'fontFamily' | 'fontSize' | 'color' | 'resolution' | 'font'
> {
  family?: YapFontFamily;
}

/**
 * A Text style at the device resolution. `size` is in CSS px, the family is
 * `ui` unless `extra` picks another, and the rest of `extra` (font style,
 * alignment, word wrap, ...) passes through to Phaser as it is.
 */
export function yapTextStyle(
  size: number,
  color: string,
  extra: YapTextExtra = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const { family, ...rest } = extra;
  return {
    ...rest,
    fontFamily: YAP_FONT_STACKS[family ?? 'ui'],
    fontSize: `${size}px`,
    color,
    resolution: YAP_DPR,
  };
}

/**
 * Creates a Text on `scene`, always at the device resolution: any `resolution`
 * the style carries is replaced, so a style written by hand cannot leave a
 * Text blurry.
 */
export function yapText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string | string[],
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, content, { ...style, resolution: YAP_DPR });
}
