// The screen pieces of the plan style (plan style 4/6, spec §5): the stamp,
// the leader row of a fiche, the seven day boxes of the streak, the execution
// ruler, the wax seal of a friend's plan and the kraft folder of Home. They
// are drawn with Phaser from the pure geometry of ./compose.ts and the text
// roles of ./text.ts, beside the base kit of ./kit.ts (button, header, card,
// rule, toast). Phaser is imported as a type only, as in kit.ts.
import type Phaser from 'phaser';
import {
  YAP_INK_SOFT_ALPHA,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapHexToInt,
  type YapPaletteToken,
  type YapRect,
} from './board';
import { yapDayBoxes, yapLeaderDots, yapRulerMarks, yapStampFont } from './compose';
import { yapActionRow } from './kit';
import { yapPrefersReducedMotion } from './motion';
import type { YapBandTick } from './observe';
import { yapRoleText, yapSetRoleText } from './text';

// ---------------------------------------------------------------------------
// Stamp
// ---------------------------------------------------------------------------

/** A stamp's tilt, in degrees (spec §5: about −9°). */
export const YAP_STAMP_ANGLE = -9;
/** A stamp's font size, in px: heavy mono capitals. */
const YAP_STAMP_FONT = 18;
/** The smallest a stamp's text goes, in px: the decorative floor. */
const YAP_STAMP_MIN_FONT = 12;
/** The stamp's thump (spec §9): from 1.35 to 1 over 180 ms. */
const YAP_STAMP_THUMP_SCALE = 1.35;
const YAP_STAMP_THUMP_MS = 180;

export interface YapStampOptions {
  /** Tilt in degrees; YAP_STAMP_ANGLE by default. */
  readonly angle?: number;
  /** Lands with a thump (not under reduced motion). */
  readonly thump?: boolean;
  /** Widest the stamp may be, in px: its text shrinks to 70% to fit. */
  readonly maxWidth?: number;
  /** Font size in px before fitting; 18 by default. */
  readonly size?: number;
  /** A shorter text, for when `text` does not fit `maxWidth` at 12 px. */
  readonly fallback?: string;
}

/**
 * A stamp (spec §5): `text` in heavy mono capitals in `color`, inside a
 * double border — 3 px, then a 1.5 px line 3 px inside it — on paper at 55%,
 * tilted about −9° and centred at (x, y). With `thump` it lands from 1.35×
 * to its size in 180 ms, unless the player asked for reduced motion.
 */
export function yapStamp(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: YapPaletteToken = 'stamp',
  options: YapStampOptions = {},
): Phaser.GameObjects.Container {
  const hex = YAP_PALETTE[color];
  const base = options.size ?? YAP_STAMP_FONT;
  const label = yapRoleText(scene, 0, 0, text, 'buttonPrimary', hex);
  label.setFontSize(base);
  const padX = 12;
  const padY = 7;
  if (options.maxWidth !== undefined) {
    // never under the 12 px decorative floor: a shorter text instead
    let size = yapStampFont(label.width, base, options.maxWidth, 2 * padX);
    if (size === null && options.fallback !== undefined) {
      yapSetRoleText(label, 'buttonPrimary', options.fallback);
      size = yapStampFont(label.width, base, options.maxWidth, 2 * padX);
    }
    label.setFontSize(size ?? YAP_STAMP_MIN_FONT);
  }
  label.setOrigin(0.5);
  const w = label.width + 2 * padX;
  const h = label.height + 2 * padY;
  const c = yapHexToInt(hex);
  const frame = scene.add.graphics();
  frame.fillStyle(yapHexToInt(YAP_PALETTE.paper), 0.55).fillRect(-w / 2, -h / 2, w, h);
  frame.lineStyle(3, c, 1).strokeRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3);
  frame.lineStyle(1.5, c, 1).strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
  const stamp = scene.add.container(x, y, [frame, label]);
  stamp.setAngle(options.angle ?? YAP_STAMP_ANGLE);
  stamp.setSize(w, h);
  if (options.thump === true && !yapPrefersReducedMotion()) {
    stamp.setScale(YAP_STAMP_THUMP_SCALE);
    scene.tweens.add({
      targets: stamp,
      scale: 1,
      duration: YAP_STAMP_THUMP_MS,
      ease: 'Cubic.easeIn',
    });
  }
  return stamp;
}

// ---------------------------------------------------------------------------
// Leader row
// ---------------------------------------------------------------------------

/**
 * A fiche row (spec §5): `label` in the body role on the left, `value` in the
 * stat role on the right, `width` px apart from `x`, and a dotted ink-soft
 * leader between them, on the label's baseline.
 */
export function yapLeaderRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  valueColor: YapPaletteToken = 'ink',
): Phaser.GameObjects.Container {
  const name = yapRoleText(scene, x, y, label, 'body', YAP_PALETTE['ink-muted']);
  const stat = yapRoleText(scene, x + width, y, value, 'stat', YAP_PALETTE[valueColor]);
  const baseline = y + name.getTextMetrics().ascent;
  stat.setOrigin(1, 0).setY(Math.round(baseline - stat.getTextMetrics().ascent));
  const dots = scene.add.graphics();
  dots.fillStyle(yapHexToInt(YAP_PALETTE.ink), YAP_INK_SOFT_ALPHA * 3);
  for (const dx of yapLeaderDots(x + name.width, x + width - stat.width)) {
    dots.fillCircle(dx, baseline - 1, 0.9);
  }
  return scene.add.container(0, 0, [dots, name, stat]);
}

// ---------------------------------------------------------------------------
// Tick band
// ---------------------------------------------------------------------------

/** Size of a tick of the band at most, and the gap between two, in px. */
const YAP_BAND_TICK_SIZE = 22;
const YAP_BAND_TICK_GAP = 3;
/** Where the line and the ticks sit under the top of the header, in px. */
const YAP_BAND_LINE_Y = 4;
const YAP_BAND_TICKS_Y = 24;

/**
 * The ticks of a cell while drawing (X9): it covers the header from `top`, with
 * the line of the arrival, then a box per tick, filled and crossed when the
 * cell is exposed, and the arrival ringed. An exposed tick has both a colour and
 * a cross, as the danger cues of docs/UI-DESIGN.md do.
 */
export function yapTickBand(
  scene: Phaser.Scene,
  viewWidth: number,
  top: number,
  band: readonly YapBandTick[],
  line: string,
  exposed: boolean,
): Phaser.GameObjects.Container {
  const room = yapActionRow(viewWidth, [{}])[0]?.width ?? viewWidth;
  const g = scene.add.graphics();
  g.fillStyle(yapHexToInt(YAP_PALETTE['paper-page']), 1);
  g.fillRect(0, top, viewWidth, YAP_TOP_BAR_HEIGHT - 1);
  const parts: Phaser.GameObjects.GameObject[] = [g];

  const label = yapRoleText(
    scene,
    0,
    top + YAP_BAND_LINE_Y,
    line,
    'caption',
    YAP_PALETTE[exposed ? 'stamp' : 'ink'],
  );
  // two threats at once run wider than the line at 360 px
  if (label.width > room) label.setScale(room / label.width);
  label.setX(Math.round((viewWidth - label.displayWidth) / 2));
  parts.push(label);

  const gaps = YAP_BAND_TICK_GAP * (band.length - 1);
  const size = Math.min(YAP_BAND_TICK_SIZE, Math.floor((room - gaps) / band.length));
  const left = Math.round((viewWidth - band.length * size - gaps) / 2);
  const y = top + YAP_BAND_TICKS_Y;
  const red = yapHexToInt(YAP_PALETTE.stamp);
  const paper = yapHexToInt(YAP_PALETTE.paper);
  const ink = yapHexToInt(YAP_PALETTE.ink);
  band.forEach((t, i) => {
    const x = left + i * (size + YAP_BAND_TICK_GAP);
    if (t.threats.length > 0) {
      g.fillStyle(red, 1).fillRect(x, y, size, size);
      g.lineStyle(2, paper, 1)
        .lineBetween(x + 5, y + 5, x + size - 5, y + size - 5)
        .lineBetween(x + 5, y + size - 5, x + size - 5, y + 5);
    } else {
      g.lineStyle(1, ink, 0.5).strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
    if (t.arrival) g.lineStyle(2, ink, 1).strokeRect(x - 2, y - 2, size + 4, size + 4);
    const number = yapRoleText(scene, 0, y + size + 2, String(t.tick), 'caption', YAP_PALETTE.ink);
    number.setFontSize(10);
    number.setX(Math.round(x + (size - number.width) / 2));
    parts.push(number);
  });
  return scene.add.container(0, 0, parts);
}

// ---------------------------------------------------------------------------
// Day boxes
// ---------------------------------------------------------------------------

/**
 * The seven days of the streak (spec §5): a box per day from `x`, `width` px
 * at most; a won day gets a red ✓, today is ringed in red, and the days
 * still to come show their number.
 */
export function yapDayBoxRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  won: readonly boolean[],
  today: number,
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const parts: Phaser.GameObjects.GameObject[] = [g];
  const ink = yapHexToInt(YAP_PALETTE.ink);
  const red = yapHexToInt(YAP_PALETTE.marker);
  yapDayBoxes(x, width).forEach((box, i) => {
    const day = i + 1;
    const s = box.width;
    g.fillStyle(yapHexToInt(YAP_PALETTE.paper), 1).fillRect(box.x, y, s, s);
    g.lineStyle(1.5, ink, 1).strokeRect(box.x + 0.75, y + 0.75, s - 1.5, s - 1.5);
    if (day === today) g.lineStyle(2, red, 1).strokeRect(box.x - 2.5, y - 2.5, s + 5, s + 5);
    if (won[i] === true) {
      // a hand-drawn check: short stroke down, long stroke up
      g.lineStyle(2.2, red, 1)
        .lineBetween(box.x + s * 0.22, y + s * 0.55, box.x + s * 0.42, y + s * 0.75)
        .lineBetween(box.x + s * 0.42, y + s * 0.75, box.x + s * 0.8, y + s * 0.25);
    } else {
      const n = yapRoleText(
        scene,
        box.x + s / 2,
        y + s / 2,
        String(day),
        'kicker',
        YAP_PALETTE.ink,
      );
      parts.push(n.setOrigin(0.5));
    }
  });
  return scene.add.container(0, 0, parts);
}

// ---------------------------------------------------------------------------
// Ruler
// ---------------------------------------------------------------------------

/** A progress ruler: its container and how to move its progress (0..1). */
export interface YapRuler {
  readonly container: Phaser.GameObjects.Container;
  setProgress(value: number): void;
}

/**
 * The execution ruler (spec §8): a hairline `width` px long at (x, y) with a
 * graduation per tick (every 5th one long) and an ink bar above it that grows
 * with the playback.
 */
export function yapRuler(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  count: number,
): YapRuler {
  const muted = yapHexToInt(YAP_PALETTE['ink-muted']);
  const scale = scene.add.graphics();
  scale.lineStyle(1, muted, 1).lineBetween(x, y + 0.5, x + width, y + 0.5);
  for (const mark of yapRulerMarks(width, count)) {
    const mx = Math.round(x + mark.x) + 0.5;
    scale.lineBetween(mx, y, mx, y + (mark.long ? 8 : 4));
  }
  const bar = scene.add.graphics();
  const container = scene.add.container(0, 0, [scale, bar]);
  const setProgress = (value: number): void => {
    const p = Math.max(0, Math.min(1, value));
    bar
      .clear()
      .fillStyle(yapHexToInt(YAP_PALETTE.ink), 1)
      .fillRect(x, y - 5, width * p, 4);
  };
  setProgress(0);
  return { container, setProgress };
}

// ---------------------------------------------------------------------------
// Wax seal
// ---------------------------------------------------------------------------

/**
 * A wax seal (spec §5, challenge): a stamp-red disc of `radius` at (x, y)
 * with a raised rim and `label` in paper capitals. A broken seal is cracked
 * across and faded: the plan it kept is open.
 */
export function yapSeal(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  label: string,
  broken: boolean,
): Phaser.GameObjects.Container {
  const red = yapHexToInt(YAP_PALETTE.stamp);
  const paper = yapHexToInt(YAP_PALETTE.paper);
  const g = scene.add.graphics();
  g.fillStyle(red, 1).fillCircle(0, 0, radius);
  g.lineStyle(2, paper, 0.35).strokeCircle(0, 0, radius * 0.78);
  const text = yapRoleText(scene, 0, 0, label, 'kicker', YAP_PALETTE.paper).setOrigin(0.5);
  if (text.width > radius * 1.6) text.setScale((radius * 1.6) / text.width);
  const seal = scene.add.container(x, y, [g, text]);
  if (broken) {
    g.lineStyle(2.5, paper, 1);
    g.beginPath();
    g.moveTo(-radius * 0.9, -radius * 0.2);
    g.lineTo(-radius * 0.3, radius * 0.1);
    g.lineTo(radius * 0.1, -radius * 0.25);
    g.lineTo(radius * 0.9, radius * 0.15);
    g.strokePath();
    seal.setAlpha(0.6);
  }
  return seal;
}

// ---------------------------------------------------------------------------
// Kraft folder
// ---------------------------------------------------------------------------

/** The folder: its container and the box of its paper sheet, for the content. */
export interface YapFolder {
  readonly container: Phaser.GameObjects.Container;
  readonly sheet: YapRect;
}

/** Height of the folder's tab, in px. */
const YAP_FOLDER_TAB = 24;
/** From the folder's top to its body's top, in px: the tab's band. */
export const YAP_FOLDER_TAB_BAND = YAP_FOLDER_TAB - 4;
/** How far the paper sheet sits inside the kraft body, in px. */
export const YAP_FOLDER_INSET = 12;

/**
 * Home's folder of the day (spec §5): a kraft body with a tab holding `tab`
 * (mono capitals in kraft-ink), and a paper sheet inside it, tilted about
 * −1.2°, both with a soft shadow — physical objects. `sheet` is the sheet's
 * box, where the caller draws its content; `footer` px stay free on the
 * kraft under the sheet (Home puts the status stamp there).
 */
export function yapFolder(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  tab: string,
  footer = 0,
): YapFolder {
  const kraft = yapHexToInt(YAP_PALETTE.kraft);
  const edge = yapHexToInt(YAP_PALETTE['kraft-edge']);
  const shadow = yapHexToInt(YAP_PALETTE.ink);
  const label = yapRoleText(scene, x + 14, y + 6, tab, 'kicker', YAP_PALETTE['kraft-ink']);
  const tabW = Math.min(width - 24, label.width + 28);
  const bodyY = y + YAP_FOLDER_TAB_BAND;
  const bodyH = height - (bodyY - y);
  const g = scene.add.graphics();
  // soft shadows: the folder and its sheet are objects on the page
  g.fillStyle(shadow, 0.08).fillRoundedRect(x + 2, bodyY + 4, width, bodyH, 4);
  g.fillStyle(shadow, 0.05).fillRoundedRect(x + 3, bodyY + 7, width, bodyH, 4);
  g.fillStyle(kraft, 1).fillRoundedRect(x, y, tabW, YAP_FOLDER_TAB + 6, {
    tl: 4,
    tr: 4,
    bl: 0,
    br: 0,
  });
  g.lineStyle(1.5, edge, 1).strokeRoundedRect(x, y, tabW, YAP_FOLDER_TAB + 6, {
    tl: 4,
    tr: 4,
    bl: 0,
    br: 0,
  });
  g.fillStyle(kraft, 1).fillRoundedRect(x, bodyY, width, bodyH, 4);
  g.lineStyle(1.5, edge, 1).strokeRoundedRect(x, bodyY, width, bodyH, 4);
  // cover the tab's bottom edge so the tab and the body read as one piece
  g.fillStyle(kraft, 1).fillRect(x + 1.5, bodyY - 1, tabW - 3, 6);
  const sheet: YapRect = {
    x: x + YAP_FOLDER_INSET,
    y: bodyY + YAP_FOLDER_INSET,
    w: width - 2 * YAP_FOLDER_INSET,
    h: bodyH - 2 * YAP_FOLDER_INSET - footer,
  };
  const paper = scene.add.graphics();
  paper.fillStyle(shadow, 0.1).fillRect(-sheet.w / 2 + 2, -sheet.h / 2 + 3, sheet.w, sheet.h);
  paper
    .fillStyle(yapHexToInt(YAP_PALETTE.paper), 1)
    .fillRect(-sheet.w / 2, -sheet.h / 2, sheet.w, sheet.h);
  paper.setPosition(sheet.x + sheet.w / 2, sheet.y + sheet.h / 2).setAngle(-1.2);
  const container = scene.add.container(0, 0, [g, label, paper]);
  return { container, sheet };
}
