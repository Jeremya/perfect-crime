// The pure geometry of the screen compositions (plan style 4/6, spec §5 and
// §8): the dotted leader of a row, the graduations of the execution ruler,
// the seven day boxes of the streak, the weekday of a test day, what a heist
// holds, the win report's telegram line, how a stamp fits its text, where the
// win actions sit, and where the first-launch hand is in its loop. The kit
// (./kit.ts) and the scenes draw with these; the unit tests pin them.
import { YAP_TEST_START_DATE } from '../app/config';
import type { YapLevel } from '../core/level';
import { YAP_BOTTOM_BAR_HEIGHT, yapConsentTopBar } from './board';
import { YAP_BUTTON_HEIGHT, type YapBox } from './kit';

/** Room a leader keeps clear on each side, next to its texts, in px. */
const YAP_LEADER_CLEAR = 6;

/** The x of each dot of a leader from `from` to `to`, clear of both texts. */
export function yapLeaderDots(from: number, to: number, step = 4): number[] {
  const dots: number[] = [];
  for (let x = from + YAP_LEADER_CLEAR + step / 2; x < to - YAP_LEADER_CLEAR; x += step)
    dots.push(x);
  return dots;
}

/** The `count + 1` graduations of a ruler `width` wide; every 5th one is long. */
export function yapRulerMarks(width: number, count: number): { x: number; long: boolean }[] {
  const n = Math.max(1, count);
  return Array.from({ length: n + 1 }, (_, i) => ({ x: (width * i) / n, long: i % 5 === 0 }));
}

/** The seven day boxes from `x`, `size` px square, shrunk to fit `width`. */
export function yapDayBoxes(x: number, width: number, size = 24, gap = 6): YapBox[] {
  const fit = Math.min(size, Math.floor((width - 6 * gap) / 7));
  return Array.from({ length: 7 }, (_, i) => ({ x: x + i * (fit + gap), width: fit }));
}

/** The weekday (Sunday = 0) of test day `day`, day 1 being `start`, in the local calendar. */
export function yapWeekday(day: number, start: string = YAP_TEST_START_DATE): number {
  const [y, m, d] = start.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + day - 1).getDay();
}

/** The kinds of threat a heist holds, in the order guard, camera, laser. */
export function yapHeistFacts(level: YapLevel): ('guard' | 'camera' | 'laser')[] {
  const facts: ('guard' | 'camera' | 'laser')[] = [];
  if (level.guards.length > 0) facts.push('guard');
  if (level.cameras.length > 0) facts.push('camera');
  if (level.lasers.length > 0) facts.push('laser');
  return facts;
}

/** The glyphs of `text`, whole (an emoji with its modifiers stays one). */
function yapGlyphs(text: string): string[] {
  // Intl.Segmenter keeps an emoji and its modifiers together; browsers
  // without it (Firefox before 125) get code points, never half a surrogate pair
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/**
 * The telegram line of the win report: `template` with `{line}` (the emoji
 * line) and `{ticks}`. When it is wider than `room` (by `measure`), the emoji
 * line loses glyphs from its end, whole, and ends with "…".
 */
export function yapTelegram(
  template: string,
  line: string,
  ticks: number,
  room: number,
  measure: (text: string) => number,
): string {
  const fill = (emoji: string): string =>
    template.replace('{line}', emoji).replace('{ticks}', String(ticks));
  const full = fill(line);
  if (measure(full) <= room) return full;
  const glyphs = yapGlyphs(line);
  for (let keep = glyphs.length - 1; keep >= 0; keep -= 1) {
    const candidate = fill(`${glyphs.slice(0, keep).join('')}…`);
    if (measure(candidate) <= room) return candidate;
  }
  return fill('…');
}

/** The scale (1 down to 0.7) at which a stamp's text `textWidth` wide fits `max`. */
export function yapFitStamp(textWidth: number, max: number): number {
  if (textWidth <= max) return 1;
  return Math.max(0.7, max / textWidth);
}

/**
 * The font size (px) at which a stamp's text, `textWidth` px wide at `base`
 * px, fits a stamp at most `maxWidth` wide (its padding is `pad` px): `base`
 * when it fits, smaller down to `min` (12 px, the decorative floor), or null
 * when even `min` does not fit — the caller then uses a shorter text.
 */
export function yapStampFont(
  textWidth: number,
  base: number,
  maxWidth: number,
  pad = 24,
  min = 12,
): number | null {
  const room = maxWidth - pad;
  if (textWidth <= room) return base;
  const size = Math.floor((base * room) / textWidth);
  return size >= min ? size : null;
}

/**
 * The band of the view the board shows in: under the header, itself under
 * the first-launch consent note (`note` px), and above the bottom bar.
 */
export function yapPlanningBand(viewHeight: number, note: number): { y: number; height: number } {
  const y = yapConsentTopBar(note);
  return { y, height: viewHeight - y - YAP_BOTTOM_BAR_HEIGHT };
}

/** Height of the win report's secondary row (Improve, Home), in px. */
export const YAP_WIN_ROW_HEIGHT = 48;

/**
 * The win report's footer (spec §8): Share, primary and full width, then the
 * row of Improve and Home 12 px below it, 16 px above the bottom. `top` is
 * Share's top edge, which the fiche and the toast stay above.
 */
export function yapWinActions(viewHeight: number): {
  readonly shareY: number;
  readonly rowY: number;
  readonly top: number;
} {
  const rowY = viewHeight - 16 - YAP_WIN_ROW_HEIGHT / 2;
  const shareY = rowY - YAP_WIN_ROW_HEIGHT / 2 - 12 - YAP_BUTTON_HEIGHT / 2;
  return { shareY, rowY, top: shareY - YAP_BUTTON_HEIGHT / 2 };
}

/** The first-launch hand's loop: it draws for 1600 ms, then rests 800 ms. */
export const YAP_HAND_DRAW_MS = 1600;
export const YAP_HAND_LOOP_MS = 2400;

/**
 * Where the first-launch hand is at `t` ms: on segment `index` of the route,
 * `along` (0..1) of the way, drawing in YAP_HAND_DRAW_MS, then resting at the
 * end until the loop starts again. Not visible on a route of no segment.
 */
export function yapHandPose(
  t: number,
  segments: number,
): { readonly index: number; readonly along: number; readonly visible: boolean } {
  if (segments <= 0) return { index: 0, along: 0, visible: false };
  const at = ((t % YAP_HAND_LOOP_MS) + YAP_HAND_LOOP_MS) % YAP_HAND_LOOP_MS;
  if (at >= YAP_HAND_DRAW_MS) return { index: segments - 1, along: 1, visible: true };
  const pos = (at / YAP_HAND_DRAW_MS) * segments;
  const index = Math.floor(pos);
  return { index, along: pos - index, visible: true };
}
