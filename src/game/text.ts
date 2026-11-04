// Text factory (C1 visual pass 3 — crisp HiDPI rendering).
//
// Every Text in the game is created through yapText, with a style built by
// yapTextStyle. Phaser draws a Text into a canvas of its own at the style's
// `resolution`, 1 by default, and the game renders at the device pixel ratio:
// a Text left at 1 would be magnified and blurry on a phone. The factory sets
// the resolution to YAP_DPR and keeps the system font stacks in one place
// (docs/design/2026-10-30-plan-style-design.md §4), so no scene names a font.
//
// On top of the factory sit the type roles of the plan style (the same
// document, §5): serif titles and sentences, uppercase tracked mono kickers,
// stats and buttons. A screen asks yapRoleText for a role and a color, and the
// role carries the face, the size, the font style, the case and the letter
// spacing, so no scene picks them one by one.
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

// ---------------------------------------------------------------------------
// Roles: a face, a size, a font style, a case and a tracking under one name
// ---------------------------------------------------------------------------

/**
 * The type roles of the plan style (docs/design/2026-10-30-plan-style-design.md
 * §5). Serif for titles and sentences: the title of a screen, the title of a
 * card, the body, an italic caption. Mono for the rest: the kicker above a
 * title, the stat and the big number, the secondary and the primary button.
 */
export type YapTextRole =
  | 'screenTitle'
  | 'cardTitle'
  | 'body'
  | 'caption'
  | 'kicker'
  | 'stat'
  | 'statLarge'
  | 'button'
  | 'buttonPrimary';

/**
 * What a role sets. A key a role leaves out is off: regular weight, upright,
 * the content as it is written, no letter spacing.
 */
export interface YapTextRoleSpec {
  readonly family: YapFontFamily;
  /** In CSS px. */
  readonly size: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  /** The Text shows the content in capitals, whatever case it is written in. */
  readonly upper?: boolean;
  /** Letter spacing in em, a fraction of the size (yapRoleTracking gives it in px). */
  readonly tracking?: number;
}

/**
 * The sizes, styles and trackings of the roles (§5 gives the ranges). Everything
 * essential is at least 14 px; the kicker only decorates, and is the one role at
 * 12. The numbers are mono, whose digits all have the same width. A label must
 * still fit at 360 px: the kit reduces the tracking or wraps when it does not.
 */
export const YAP_TEXT_ROLES: Readonly<Record<YapTextRole, YapTextRoleSpec>> = {
  screenTitle: { family: 'serif', size: 27 },
  cardTitle: { family: 'serif', size: 22 },
  body: { family: 'serif', size: 16 },
  caption: { family: 'serif', size: 15, italic: true },
  kicker: { family: 'mono', size: 12, upper: true, tracking: 0.12 },
  stat: { family: 'mono', size: 14, upper: true, tracking: 0.12 },
  statLarge: { family: 'mono', size: 22, bold: true, tracking: 0.12 },
  button: { family: 'mono', size: 14, upper: true, tracking: 0.14 },
  buttonPrimary: { family: 'mono', size: 15, bold: true, upper: true, tracking: 0.18 },
};

/**
 * The style of `role` in `color`, at the device resolution. The role picks the
 * size, the family and the font style (bold, italic, both or none), and `extra`
 * adds the rest (alignment, word wrap, ...) as it does for yapTextStyle. Where
 * `extra` also names a `family` or a `fontStyle`, the role's wins; a role with
 * no font style leaves the `fontStyle` of `extra` alone. The letter spacing of
 * the role is not in the style, see yapRoleText.
 */
export function yapRoleStyle(
  role: YapTextRole,
  color: string,
  extra: YapTextExtra = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const { family, size, bold, italic } = YAP_TEXT_ROLES[role];
  const style: YapTextExtra = { ...extra, family };
  // Phaser puts the font style, the size and the family one after the other in
  // a CSS font, where 'bold italic' is as valid as either word alone
  const fontStyle: string[] = [];
  if (bold) fontStyle.push('bold');
  if (italic) fontStyle.push('italic');
  if (fontStyle.length > 0) style.fontStyle = fontStyle.join(' ');
  return yapTextStyle(size, color, style);
}

/**
 * The letter spacing of `role` in px: its tracking (em) times its size,
 * rounded to 0.1 px so that float noise stays out of it (14 × 0.14 is
 * 1.9600000000000002). 0 for a role without tracking.
 */
export function yapRoleTracking(role: YapTextRole): number {
  const { size, tracking } = YAP_TEXT_ROLES[role];
  return tracking === undefined ? 0 : Math.round(size * tracking * 10) / 10;
}

/**
 * `content` as `role` shows it: upper-cased for a role in capitals.
 * toUpperCase, not toLocaleUpperCase: on a Turkish device the latter turns an
 * i into İ, and the app's languages need no locale-specific casing.
 */
export function yapRoleCase(role: YapTextRole, content: string): string {
  return YAP_TEXT_ROLES[role].upper === true ? content.toUpperCase() : content;
}

/**
 * Whether `content` can be drawn with letter spacing. Phaser draws a spaced
 * Text one UTF-16 unit at a time, so a character beyond them (an emoji, as in
 * "💡 Hint" or "🔥 Streak") would be split into two halves drawn as two broken
 * glyphs.
 */
export function yapCanTrack(content: string): boolean {
  return !/[\uD800-\uDFFF]/.test(content);
}

/**
 * Creates a Text on `scene` for `role`, through yapText. A role in capitals
 * shows `content` upper-cased (yapRoleCase), and a tracked role sets its
 * letter spacing on the Text once it exists, which wins over a
 * `letterSpacing` in `extra` — unless `content` holds an emoji, which
 * letter spacing would break (yapCanTrack). Phaser draws a spaced Text glyph
 * by glyph, so the tracked roles are for short labels, not for paragraphs.
 */
export function yapRoleText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  role: YapTextRole,
  color: string,
  extra: YapTextExtra = {},
): Phaser.GameObjects.Text {
  const text = yapText(scene, x, y, yapRoleCase(role, content), yapRoleStyle(role, color, extra));
  const spacing = yapCanTrack(content) ? yapRoleTracking(role) : 0;
  if (spacing !== 0) text.setLetterSpacing(spacing);
  return text;
}
