// Component kit of the plan style (C1 visual pass 3, plan style 2/6 — the
// component kit of docs/design/2026-10-30-plan-style-design.md §5).
//
// One module for the pieces every scene is made of: the paper page, the button,
// the header, the card, the rule and the note (the toast). A scene asks the kit
// instead of drawing its own buttons and bars, so the sizes, the radii, the
// colors and the press behavior stay the same on every screen. Colors come from
// the paper and ink tokens of YAP_PALETTE and every label from the text roles
// (./text), so no scene picks a face, a size or a letter spacing by itself.
//
// Layout is in CSS pixels (./hidpi): a scene hands the kit its view width, and
// the kit never reads the size of the canvas. The layout maths is pure and
// exported (yapActionRow, yapPlanningRow, yapFitFontSize, yapEllipsize,
// yapHeaderLeftWidth), so the scenes and the e2e specs place things from the same
// numbers; it is unit-tested in node (tests/unit/kit.test.ts), together with the
// firing of a button, the fit of its label and the header's layout through a fake
// scene. The components themselves draw through the scene they are given.
//
// This module must not import the Phaser runtime (type-only imports are fine):
// it is unit-tested in node, and the e2e specs import its layout helpers. A
// component keeps what it needs of its own objects (its hit zone, its texts) in
// closures, since without the runtime it cannot ask an object what class it is.
import type Phaser from 'phaser';
import { YAP_PALETTE, YAP_TOP_BAR_HEIGHT, yapHexToInt, type YapPaletteToken } from './board';
import { YAP_MOTION_FAST, yapPrefersReducedMotion } from './motion';
import { YAP_UI_TAP_EVENT } from './sound';
import {
  YAP_TEXT_ROLES,
  yapCanTrack,
  yapRoleCase,
  yapRoleText,
  yapRoleTracking,
  type YapTextRole,
} from './text';

// ---------------------------------------------------------------------------
// Rows of buttons: where a row sits and how wide each button is
// ---------------------------------------------------------------------------

/** Margin on each side of a row, in px. */
const YAP_ROW_MARGIN = 16;
/** Gap between two slots of a row, in px. */
const YAP_ROW_GAP = 8;

/**
 * One slot of a row of buttons. A slot with a `width` keeps it; a slot without
 * one shares the width that is left with the other such slots.
 */
export interface YapSlot {
  readonly width?: number;
}

/** Where a slot lands: its left edge and its width, in px. */
export interface YapBox {
  readonly x: number;
  readonly width: number;
}

/**
 * Centre y of a row of buttons at the bottom of the view, measured up from the
 * view's bottom: a 52 px button (YAP_BUTTON_HEIGHT) over a 12 px margin. A scene
 * puts its row at `viewHeight - YAP_ROW_FROM_BOTTOM`.
 */
export const YAP_ROW_FROM_BOTTOM = 38;

/**
 * The boxes of `slots` in a row `viewWidth` wide, from the left margin to the
 * right one, a gap between two boxes: fixed slots keep their width and the fill
 * slots split what is left equally (never less than 0 on a view too narrow for
 * the fixed slots). The boxes come in the order of the slots.
 */
export function yapActionRow(
  viewWidth: number,
  slots: readonly YapSlot[],
  margin = YAP_ROW_MARGIN,
  gap = YAP_ROW_GAP,
): readonly YapBox[] {
  let fixed = 0;
  let fills = 0;
  for (const slot of slots) {
    if (slot.width === undefined) fills += 1;
    else fixed += slot.width;
  }
  const free = viewWidth - 2 * margin - gap * Math.max(slots.length - 1, 0) - fixed;
  const fillWidth = fills === 0 ? 0 : Math.max(free, 0) / fills;
  let x = margin;
  return slots.map((slot) => {
    const box = { x, width: slot.width ?? fillWidth };
    x += box.width + gap;
    return box;
  });
}

/** Width of Clear in the planning row, in px. */
export const YAP_PLANNING_CLEAR_WIDTH = 104;
/** Width of Hint in the planning row, in px. */
export const YAP_PLANNING_HINT_WIDTH = 96;

/** Width of Preview (X3) in the planning row, in px: Hint's slot, which it takes. */
export const YAP_PLANNING_PREVIEW_WIDTH = 96;

/**
 * The planning row: Clear, Hint (only when a hint is available), Preview (X3,
 * only when the route is complete) and PLAY.
 */
export interface YapPlanningRow {
  readonly clear: YapBox;
  readonly hint: YapBox | null;
  readonly preview: YapBox | null;
  readonly play: YapBox;
}

/**
 * The planning row of `viewWidth`: Clear, Hint and Preview keep their width
 * and PLAY, the primary action, takes the rest, so PLAY gives width up to Hint
 * or Preview when one appears, with the same margins and gaps. Preview takes
 * the slot of Hint: with both asked, only Preview is laid out (X3, the Hint's
 * ghost stays drawn on the board).
 */
export function yapPlanningRow(
  viewWidth: number,
  hasHint: boolean,
  hasPreview = false,
): YapPlanningRow {
  const middle: YapSlot | null = hasPreview
    ? { width: YAP_PLANNING_PREVIEW_WIDTH }
    : hasHint
      ? { width: YAP_PLANNING_HINT_WIDTH }
      : null;
  const clear: YapSlot = { width: YAP_PLANNING_CLEAR_WIDTH };
  const boxes = yapActionRow(viewWidth, middle === null ? [clear, {}] : [clear, middle, {}]);
  const middleBox = middle === null ? null : yapBoxAt(boxes, 1);
  return {
    clear: yapBoxAt(boxes, 0),
    hint: hasPreview ? null : middleBox,
    preview: hasPreview ? middleBox : null,
    play: yapBoxAt(boxes, middle === null ? 1 : 2),
  };
}

/** Widths of the row when two buttons stand between Clear and PLAY. */
const YAP_CROWDED_CLEAR_WIDTH = 72;
const YAP_CROWDED_FIRST_WIDTH = 80;
const YAP_CROWDED_SECOND_WIDTH = 72;

/** The planning row once Observer has its place (story X9). */
export interface YapPlanningSlots extends Omit<YapPlanningRow, 'play'> {
  /** Null when Observer takes the slot of the disabled PLAY. */
  readonly play: YapBox | null;
  readonly observer: YapBox | null;
}

/**
 * Where each button of the planning row stands. Without Observer this is
 * yapPlanningRow. With it, it takes the middle slot; when a hint already holds
 * that slot on an unfinished route, Observer takes the place of the disabled
 * PLAY, which says nothing the caption does not say. Two buttons in the middle
 * of a route that can play shrink the row, so PLAY stays.
 */
export function yapPlanningSlots(
  viewWidth: number,
  state: {
    readonly canPlay: boolean;
    readonly hint: boolean;
    readonly observer: boolean;
    readonly preview: boolean;
  },
): YapPlanningSlots {
  const { canPlay, hint, observer, preview } = state;
  if (!observer) return { ...yapPlanningRow(viewWidth, hint, preview), observer: null };
  const single = yapPlanningRow(viewWidth, true);
  if (!canPlay && hint) {
    return {
      clear: single.clear,
      hint: single.hint,
      preview: null,
      observer: single.play,
      play: null,
    };
  }
  if (!hint && !preview) {
    return {
      clear: single.clear,
      hint: null,
      preview: null,
      observer: single.hint,
      play: single.play,
    };
  }
  const boxes = yapActionRow(viewWidth, [
    { width: YAP_CROWDED_CLEAR_WIDTH },
    { width: YAP_CROWDED_FIRST_WIDTH },
    { width: YAP_CROWDED_SECOND_WIDTH },
    {},
  ]);
  const first = yapBoxAt(boxes, 1);
  const second = yapBoxAt(boxes, 2);
  return {
    clear: yapBoxAt(boxes, 0),
    hint: hint ? first : null,
    observer: hint ? second : first,
    preview: hint ? null : second,
    play: yapBoxAt(boxes, 3),
  };
}

/** The box of slot `index`: yapActionRow returns one box per slot, so it exists. */
function yapBoxAt(boxes: readonly YapBox[], index: number): YapBox {
  const box = boxes[index];
  if (box === undefined) throw new RangeError(`YapPlanningRow: no box for slot ${index}`);
  return box;
}

// ---------------------------------------------------------------------------
// Fitting a text into a width
// ---------------------------------------------------------------------------

/**
 * The largest whole font size from `maxSize` down to `minSize` at which
 * `measure(size)`, the width of the text at that size, fits `available`;
 * `minSize` when none fits. It tries the sizes from the largest down and stops
 * at the first that fits, and it never measures `minSize` itself (that is the
 * answer either way), since a measure is a Text that renders again.
 */
export function yapFitFontSize(
  measure: (size: number) => number,
  maxSize: number,
  minSize: number,
  available: number,
): number {
  for (let size = Math.floor(maxSize); size > minSize; size -= 1) {
    if (measure(size) <= available) return size;
  }
  return minSize;
}

const YAP_ELLIPSIS = '…';

/**
 * `text` when `measure(text)` fits `available`; otherwise its longest start,
 * trailing spaces trimmed, followed by an ellipsis, that fits; the ellipsis
 * alone when nothing does. An empty text stays empty. It cuts between
 * characters, so an emoji is never split, and it searches for the cut instead
 * of walking back from the end: a measure is a Text that renders again.
 */
export function yapEllipsize(
  measure: (text: string) => number,
  text: string,
  available: number,
): string {
  if (text === '' || measure(text) <= available) return text;
  const characters = Array.from(text);
  const start = (count: number): string =>
    `${characters.slice(0, count).join('').trimEnd()}${YAP_ELLIPSIS}`;
  // The whole text does not fit, and a longer start is never narrower than a
  // shorter one: look for the greatest count of characters, from 0 (the
  // ellipsis alone) to one short of the whole text, whose start fits
  let low = 0;
  let high = characters.length - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (measure(start(middle)) <= available) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return start(best);
}

/** A measure for yapEllipsize: the width `text` takes once it shows `candidate`. */
function yapMeasureText(text: Phaser.GameObjects.Text): (candidate: string) => number {
  return (candidate) => {
    text.setText(candidate);
    return text.width;
  };
}

// ---------------------------------------------------------------------------
// Page, rule and card
// ---------------------------------------------------------------------------

/** Spacing of the grid on the page, in px. */
export const YAP_PAGE_GRID = 20;
/** Opacity of the ink of that grid. */
export const YAP_PAGE_GRID_ALPHA = 0.05;
/** Opacity of the ink of a hairline rule. */
const YAP_RULE_ALPHA = 0.16;

/** Radius of the corners of a card, in px. */
const YAP_CARD_RADIUS = 3;
/** Width of the ink border of a card, in px. */
const YAP_CARD_BORDER = 1.5;
/** How far the hard shadow of a card falls to the right and down, in px. */
const YAP_CARD_SHADOW_X = 4;
const YAP_CARD_SHADOW_Y = 5;
/** Opacity of the ink of that shadow. */
const YAP_CARD_SHADOW_ALPHA = 0.15;

/**
 * The page of the plan style: the main camera clears to `paper-page`, and the
 * returned Graphics draws the grid over it, a line of ink at 5% every 20 px.
 * The scene puts the Graphics at the back of its root container.
 */
export function yapPaperPage(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.Graphics {
  scene.cameras.main.setBackgroundColor(YAP_PALETTE['paper-page']);
  const page = scene.add.graphics();
  page.lineStyle(1, yapHexToInt(YAP_PALETTE.ink), YAP_PAGE_GRID_ALPHA);
  // A 1 px line centred half a pixel in covers one column or row of CSS pixels
  // exactly, where one on a whole pixel would straddle two
  for (let x = 0; x < width; x += YAP_PAGE_GRID) page.lineBetween(x + 0.5, 0, x + 0.5, height);
  for (let y = 0; y < height; y += YAP_PAGE_GRID) page.lineBetween(0, y + 0.5, width, y + 0.5);
  return page;
}

/**
 * A 1 px ink hairline from (x1, y) to (x2, y), at 16% unless `alpha` says
 * otherwise. It is crisp when `y` sits on a half pixel (63.5, not 64).
 */
export function yapRule(
  scene: Phaser.Scene,
  x1: number,
  x2: number,
  y: number,
  alpha = YAP_RULE_ALPHA,
): Phaser.GameObjects.Graphics {
  return scene.add
    .graphics()
    .lineStyle(1, yapHexToInt(YAP_PALETTE.ink), alpha)
    .lineBetween(x1, y, x2, y);
}

/**
 * An index card: a paper fill, a 1.5 px ink border and a hard shadow of ink at
 * 15%, 4 px to the right and 5 px down, with corners of radius 3. The Graphics
 * sits at (x, y), the top-left corner of the card, and draws from there, so
 * moving it moves the whole card. The border runs inside the card's box, as a
 * CSS border does, and the shadow falls outside it.
 */
export function yapCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Graphics {
  const ink = yapHexToInt(YAP_PALETTE.ink);
  const inset = YAP_CARD_BORDER / 2;
  return scene.add
    .graphics({ x, y })
    .fillStyle(ink, YAP_CARD_SHADOW_ALPHA)
    .fillRoundedRect(YAP_CARD_SHADOW_X, YAP_CARD_SHADOW_Y, width, height, YAP_CARD_RADIUS)
    .fillStyle(yapHexToInt(YAP_PALETTE.paper), 1)
    .fillRoundedRect(0, 0, width, height, YAP_CARD_RADIUS)
    .lineStyle(YAP_CARD_BORDER, ink, 1)
    .strokeRoundedRect(
      inset,
      inset,
      width - YAP_CARD_BORDER,
      height - YAP_CARD_BORDER,
      YAP_CARD_RADIUS - inset,
    );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

/** Height of a button, in px: a touch target well above 44. */
export const YAP_BUTTON_HEIGHT = 52;
/** Radius of the corners of a button, in px. */
const YAP_BUTTON_RADIUS = 6;
/** Width of the ink outline of a secondary button, in px. */
const YAP_BUTTON_OUTLINE = 1.5;
/** A press shrinks the button to this fraction of its size, and back. */
const YAP_PRESS_SCALE = 0.97;
/** Room a label keeps on each side before it loses its tracking: 12 px. */
const YAP_LABEL_PADDING = 12;
/** Room it keeps on each side once it wraps: 8 px. */
const YAP_LABEL_WRAP_PADDING = 8;

export interface YapButtonOptions {
  /** Left edge of the button's box, as in YapBox. */
  x: number;
  /** Centre of the button's height, as in YAP_ROW_FROM_BOTTOM. */
  y: number;
  width: number;
  /** Defaults to YAP_BUTTON_HEIGHT. */
  height?: number;
  /** Shown in capitals. */
  label: string;
  kind: 'primary' | 'secondary';
  /** Defaults to true. */
  enabled?: boolean;
  /**
   * When the button fires: on the press ('down', the default) or on the release
   * over it ('up'). A browser grants the user activation that sharing and the
   * clipboard need on the release of a touch, so a button that shares fires 'up'.
   */
  fireOn?: 'down' | 'up';
  onPress: () => void;
}

export interface YapButton {
  /** At the centre of the button's box: a scene adds it to its own container. */
  readonly container: Phaser.GameObjects.Container;
  /** Shows another label, fitted to the width. */
  setLabel(label: string): void;
  /**
   * A disabled button looks disabled and does not run its action. It still
   * answers a tap, with the tap event.
   */
  setEnabled(enabled: boolean): void;
  /** Moves the button's box and gives it another width, refitting the label. */
  setBox(x: number, width: number): void;
}

/** The tokens a button is drawn with. */
interface YapButtonLook {
  readonly fill: YapPaletteToken;
  readonly outline: YapPaletteToken | null;
  readonly label: YapPaletteToken;
}

/**
 * Primary: filled ink with a paper label, or ink-disabled with an ink label
 * when disabled. Secondary: paper with an ink outline and an ink label, or an
 * ink-disabled outline and an ink-muted label when disabled.
 */
function yapButtonLook(kind: 'primary' | 'secondary', enabled: boolean): YapButtonLook {
  if (kind === 'primary') {
    return enabled
      ? { fill: 'ink', outline: null, label: 'paper' }
      : { fill: 'ink-disabled', outline: null, label: 'ink' };
  }
  return enabled
    ? { fill: 'paper', outline: 'ink', label: 'ink' }
    : { fill: 'paper', outline: 'ink-disabled', label: 'ink-muted' };
}

/**
 * A button of the plan style: a rounded box, primary (ink, with a bold paper
 * label) or secondary (paper, with an ink outline), and its label in capitals
 * in the mono role of its kind. It is a container centred on its box, with a
 * hit zone over the whole box, so the press scale shrinks it in place.
 *
 * A press is acknowledged at once, on pointerdown: the button shrinks to 0.97
 * and back over 120 ms, unless the player asked for reduced motion. It fires on
 * pointerdown or, with `fireOn: 'up'`, on the release of a press it took. Firing
 * runs `onPress` when the button is enabled, then emits YAP_UI_TAP_EVENT on the
 * scene's events, enabled or not: a disabled button still answers a tap, as the
 * soft PLAY of the planning screen always did. The action goes first because
 * sound.ts merges a tap into a cue that played just before it (the PLAY sound,
 * which PLAY's action emits): emitted first, the tap would sound as well.
 *
 * A label wider than the button less 24 px loses its letter spacing; if it is
 * still too wide, it wraps at the width less 16 px, centred. A label with an
 * emoji never takes letter spacing (yapCanTrack).
 */
export function yapButton(scene: Phaser.Scene, options: YapButtonOptions): YapButton {
  const { kind, onPress } = options;
  const height = options.height ?? YAP_BUTTON_HEIGHT;
  const fireOn = options.fireOn ?? 'down';
  const role: YapTextRole = kind === 'primary' ? 'buttonPrimary' : 'button';
  let width = options.width;
  let enabled = options.enabled ?? true;
  let current = options.label;

  const container = scene.add.container(options.x + width / 2, options.y);
  const background = scene.add.graphics();
  const zone = scene.add.zone(0, 0, width, height).setInteractive({ useHandCursor: true });
  const label = yapRoleText(
    scene,
    0,
    0,
    current,
    role,
    YAP_PALETTE[yapButtonLook(kind, enabled).label],
    { align: 'center' },
  ).setOrigin(0.5);
  container.add([background, label, zone]);

  const drawBackground = (): void => {
    const look = yapButtonLook(kind, enabled);
    const left = -width / 2;
    const top = -height / 2;
    background
      .clear()
      .fillStyle(yapHexToInt(YAP_PALETTE[look.fill]), 1)
      .fillRoundedRect(left, top, width, height, YAP_BUTTON_RADIUS);
    if (look.outline === null) return;
    // The outline runs inside the box, so the drawing fills its box exactly
    const inset = YAP_BUTTON_OUTLINE / 2;
    background
      .lineStyle(YAP_BUTTON_OUTLINE, yapHexToInt(YAP_PALETTE[look.outline]), 1)
      .strokeRoundedRect(
        left + inset,
        top + inset,
        width - YAP_BUTTON_OUTLINE,
        height - YAP_BUTTON_OUTLINE,
        YAP_BUTTON_RADIUS - inset,
      );
  };

  // What fitLabel has taken from the look of the label's role. Each change
  // renders the Text again, so only a real change is made.
  let spacing = yapRoleTracking(role);
  let wrapped = false;
  const fitLabel = (): void => {
    const natural = yapCanTrack(current) ? yapRoleTracking(role) : 0;
    if (spacing !== natural) {
      label.setLetterSpacing(natural);
      spacing = natural;
    }
    if (wrapped) {
      label.setWordWrapWidth(null);
      wrapped = false;
    }
    const room = width - 2 * YAP_LABEL_PADDING;
    if (label.width <= room) return;
    if (spacing !== 0) {
      label.setLetterSpacing(0);
      spacing = 0;
    }
    if (label.width <= room) return;
    label.setWordWrapWidth(width - 2 * YAP_LABEL_WRAP_PADDING);
    wrapped = true;
  };

  let pressTween: Phaser.Tweens.Tween | null = null;
  const acknowledge = (): void => {
    if (yapPrefersReducedMotion()) return;
    // A quick second press starts from the rest size: a tween interrupted half
    // way back would otherwise leave the next one a smaller size to return to
    pressTween?.stop();
    container.setScale(1);
    pressTween = scene.tweens.add({
      targets: container,
      scale: YAP_PRESS_SCALE,
      duration: YAP_MOTION_FAST / 2,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  };

  const fire = (): void => {
    if (enabled) onPress();
    scene.events.emit(YAP_UI_TAP_EVENT);
  };

  // A release fires only the button that took the press: a chrome that changes
  // under the finger must not turn the end of one tap into a press of another.
  let armed = false;
  zone.on('pointerdown', () => {
    acknowledge();
    if (fireOn === 'down') {
      fire();
      return;
    }
    armed = true;
    // Phaser runs this after the zone's own pointerup: it ends a press released
    // elsewhere
    scene.input.once('pointerup', () => {
      armed = false;
    });
  });
  if (fireOn === 'up') {
    zone.on('pointerup', () => {
      if (armed) fire();
      armed = false;
    });
  }

  drawBackground();
  fitLabel();
  return {
    container,
    setLabel(next) {
      if (next === current) return;
      current = next;
      label.setText(yapRoleCase(role, next));
      fitLabel();
    },
    setEnabled(next) {
      if (next === enabled) return;
      enabled = next;
      drawBackground();
      label.setColor(YAP_PALETTE[yapButtonLook(kind, enabled).label]);
    },
    setBox(x, nextWidth) {
      container.x = x + nextWidth / 2;
      // A move alone redraws nothing
      if (nextWidth === width) return;
      width = nextWidth;
      zone.setSize(width, height);
      drawBackground();
      fitLabel();
    },
  };
}

/** A gear's teeth, the radii of its ring and of its teeth's tips, a tooth's width, in px. */
const YAP_GEAR_TEETH = 8;
const YAP_GEAR_RING = 7;
const YAP_GEAR_TIP = 11;
const YAP_GEAR_TOOTH = 3.5;

/**
 * The way to the settings: a square secondary button with a gear drawn in ink,
 * `box` being its left edge, its width and its centre line.
 */
export function yapGearButton(
  scene: Phaser.Scene,
  box: YapBox & { readonly y: number },
  onPress: () => void,
): YapButton {
  const button = yapButton(scene, {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.width,
    label: '',
    kind: 'secondary',
    onPress,
  });
  const gear = scene.add.graphics();
  gear.lineStyle(2 * YAP_BUTTON_OUTLINE, yapHexToInt(YAP_PALETTE.ink), 1);
  gear.strokeCircle(0, 0, YAP_GEAR_RING - YAP_BUTTON_OUTLINE);
  gear.lineStyle(YAP_GEAR_TOOTH, yapHexToInt(YAP_PALETTE.ink), 1);
  for (let tooth = 0; tooth < YAP_GEAR_TEETH; tooth += 1) {
    const angle = (tooth * 2 * Math.PI) / YAP_GEAR_TEETH;
    gear.lineBetween(
      YAP_GEAR_RING * Math.cos(angle),
      YAP_GEAR_RING * Math.sin(angle),
      YAP_GEAR_TIP * Math.cos(angle),
      YAP_GEAR_TIP * Math.sin(angle),
    );
  }
  // under the hit zone, which stays last
  button.container.addAt(gear, 1);
  return button;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/** Side margin of the header, in px. */
const YAP_HEADER_MARGIN = 16;
/** Gap between the kicker and title column and the right block, in px. */
const YAP_HEADER_GAP = 12;
/** Top of the kicker, of the title and of the first right line, in px. */
const YAP_HEADER_KICKER_Y = 10;
const YAP_HEADER_TITLE_Y = 26;
const YAP_HEADER_RIGHT_Y = 12;
/** The smallest size the title is fitted down to; it is cut with an ellipsis beyond. */
const YAP_HEADER_TITLE_MIN = 18;

export interface YapHeaderOptions {
  /** Shown in capitals, above the title. */
  kicker: string;
  title: string;
  /** Lines of the block on the right, from the top. */
  right?: readonly string[];
  /** Sets the last right line in the large stat role (the tick counter). */
  rightLarge?: boolean;
  /** Room kept free at the right end of the band, in px: the right block stands before it. */
  rightInset?: number;
}

/** The kicker and the title a header shows, as they are drawn. */
export interface YapHeaderShown {
  readonly kicker: string;
  readonly title: string;
}

export interface YapHeader {
  /** The band, at (0, 0): a scene adds it to its own container. */
  readonly container: Phaser.GameObjects.Container;
  /** Shows other right lines, re-stacked, and refits the kicker and the title. */
  setRight(lines: readonly string[]): void;
  /**
   * The kicker and the title as drawn right now: the kicker in capitals, and
   * either one cut with an ellipsis where it did not fit. `setRight` refits
   * them, so ask again after it.
   */
  shown(): YapHeaderShown;
}

/**
 * The width of the header's left column, the kicker and the title: from the
 * left margin to a 12 px gap before the right block, which ends at the right
 * margin. The gap goes when there is no right block (`rightWidth` of 0).
 */
export function yapHeaderLeftWidth(viewWidth: number, rightWidth: number): number {
  const gap = rightWidth > 0 ? YAP_HEADER_GAP : 0;
  return Math.max(viewWidth - 2 * YAP_HEADER_MARGIN - rightWidth - gap, 0);
}

/** A line of the right block, with the role it was made for. */
interface YapHeaderLine {
  readonly role: YapTextRole;
  readonly text: Phaser.GameObjects.Text;
}

/**
 * The header of a screen, in the 64 px band at the top (YAP_TOP_BAR_HEIGHT),
 * which has no fill so the page shows through: a mono kicker in ink-muted over a
 * serif title in ink on the left, a right-aligned block of mono stats in ink
 * stacked from the top, and a hairline rule on the bottom edge.
 *
 * Nothing overlaps. The right block takes the room it needs and the kicker and
 * the title share the rest (yapHeaderLeftWidth): the title is fitted from 27 down
 * to 18 px and cut with an ellipsis if it is still too wide, and so is the
 * kicker. `setRight` redoes that for the new block.
 */
export function yapHeader(
  scene: Phaser.Scene,
  width: number,
  options: YapHeaderOptions,
): YapHeader {
  const container = scene.add.container(0, 0);
  const kicker = yapRoleText(
    scene,
    YAP_HEADER_MARGIN,
    YAP_HEADER_KICKER_Y,
    options.kicker,
    'kicker',
    YAP_PALETTE['ink-muted'],
  );
  const title = yapRoleText(
    scene,
    YAP_HEADER_MARGIN,
    YAP_HEADER_TITLE_Y,
    options.title,
    'screenTitle',
    YAP_PALETTE.ink,
  );
  container.add([yapRule(scene, 0, width, YAP_TOP_BAR_HEIGHT - 0.5), kicker, title]);
  // Both texts, whole, to fit again from: the kicker as the role shows it, in capitals
  const kickerWhole = kicker.text;
  const titleWhole = options.title;
  const inset = options.rightInset ?? 0;
  const rightEdge = width - YAP_HEADER_MARGIN - inset;
  const right: YapHeaderLine[] = [];

  // Fitting renders the texts again, and most changes of the right lines (a
  // number that changes) leave the room as it is: fit only when it changes
  let fittedTo = -1;
  const fitLeft = (): void => {
    let rightWidth = 0;
    for (const line of right) rightWidth = Math.max(rightWidth, line.text.width);
    const available = yapHeaderLeftWidth(width - inset, rightWidth);
    if (available === fittedTo) return;
    fittedTo = available;
    kicker.setText(yapEllipsize(yapMeasureText(kicker), kickerWhole, available));
    title.setText(titleWhole);
    const size = yapFitFontSize(
      (candidate) => {
        title.setFontSize(candidate);
        return title.width;
      },
      YAP_TEXT_ROLES.screenTitle.size,
      YAP_HEADER_TITLE_MIN,
      available,
    );
    title.setFontSize(size);
    title.setText(yapEllipsize(yapMeasureText(title), titleWhole, available));
  };

  const setRight = (lines: readonly string[]): void => {
    let y = YAP_HEADER_RIGHT_Y;
    lines.forEach((line, index) => {
      const role: YapTextRole =
        options.rightLarge === true && index === lines.length - 1 ? 'statLarge' : 'stat';
      let entry = right[index];
      if (entry !== undefined && entry.role !== role) {
        entry.text.destroy();
        entry = undefined;
      }
      if (entry === undefined) {
        const text = yapRoleText(scene, rightEdge, y, line, role, YAP_PALETTE.ink).setOrigin(1, 0);
        container.add(text);
        entry = { role, text };
        right[index] = entry;
      } else {
        entry.text.setText(yapRoleCase(role, line)).setY(y);
      }
      y += entry.text.height;
    });
    for (const stale of right.splice(lines.length)) stale.text.destroy();
    fitLeft();
  };

  setRight(options.right ?? []);
  return {
    container,
    setRight,
    shown: () => ({ kicker: kicker.text, title: title.text }),
  };
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

/** Width a message wraps at, in px: it fits a 360 px view with room around it. */
const YAP_TOAST_WRAP = 280;
/** Padding around the text of a note, in px. */
const YAP_TOAST_PADDING_X = 12;
const YAP_TOAST_PADDING_Y = 8;
/** How long a note fades in, holds and fades out, in ms. */
const YAP_TOAST_FADE_IN = YAP_MOTION_FAST;
const YAP_TOAST_HOLD = 1400;
const YAP_TOAST_FADE_OUT = 200;

/**
 * Shows `message` as a note, a slip of paper with the card's border and shadow,
 * its text in the body role in ink, wrapped at 280 px, with 12 × 8 px of
 * padding. The note is added to `parent` and anchored at its bottom centre at
 * (x, y). It fades in over 120 ms, holds 1400 ms, fades out over 200 ms and is
 * destroyed. Under reduced motion it shows and goes without fading, after the
 * same time.
 */
export function yapShowToast(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  message: string,
): void {
  const text = yapRoleText(scene, 0, 0, message, 'body', YAP_PALETTE.ink, {
    align: 'center',
    wordWrap: { width: YAP_TOAST_WRAP },
  });
  const boxWidth = text.width + 2 * YAP_TOAST_PADDING_X;
  const boxHeight = text.height + 2 * YAP_TOAST_PADDING_Y;
  text.setOrigin(0.5).setPosition(0, -boxHeight / 2);
  const note = scene.add.container(x, y);
  note.add([yapCard(scene, -boxWidth / 2, -boxHeight, boxWidth, boxHeight), text]);
  parent.add(note);

  if (yapPrefersReducedMotion()) {
    scene.time.delayedCall(YAP_TOAST_FADE_IN + YAP_TOAST_HOLD + YAP_TOAST_FADE_OUT, () => {
      note.destroy();
    });
    return;
  }
  note.setAlpha(0);
  scene.tweens.add({
    targets: note,
    alpha: 1,
    duration: YAP_TOAST_FADE_IN,
    onComplete: () => {
      scene.tweens.add({
        targets: note,
        alpha: 0,
        delay: YAP_TOAST_HOLD,
        duration: YAP_TOAST_FADE_OUT,
        onComplete: () => {
          note.destroy();
        },
      });
    },
  });
}
