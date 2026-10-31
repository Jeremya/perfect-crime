// Tests for the component kit (plan style 2/6: src/game/kit.ts).
//
// The kit draws through Phaser, which does not run in node, so these tests pin
// what does not need a canvas:
//   - the layout maths, which is pure: the rows of buttons, the font size that
//     fits, the ellipsis, the width left to the header's title;
//   - how the components lay out and fire, through a fake scene that records
//     what it is asked to create (as in text.test.ts): the firing contract of a
//     button, the fit of its label, the stacking of the header's right lines, the
//     timing of a toast. The fake models a Text just enough for that, a width
//     that follows the font size and the letter spacing.
// What a component looks like once drawn is for the browser: the e2e specs of
// the scenes that use the kit, and the screenshot review at the end of the slice.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { YAP_PALETTE, yapHexToInt } from '../../src/game/board';
import {
  YAP_PAGE_GRID,
  YAP_PAGE_GRID_ALPHA,
  YAP_PLANNING_CLEAR_WIDTH,
  YAP_PLANNING_HINT_WIDTH,
  YAP_ROW_FROM_BOTTOM,
  yapActionRow,
  yapButton,
  yapCard,
  yapEllipsize,
  yapFitFontSize,
  yapHeader,
  yapHeaderLeftWidth,
  yapPaperPage,
  yapPlanningRow,
  yapRule,
  yapShowToast,
  type YapButtonOptions,
} from '../../src/game/kit';
import { YAP_MOTION_FAST } from '../../src/game/motion';
import { YAP_UI_TAP_EVENT } from '../../src/game/sound';

// ---------------------------------------------------------------------------
// Pure layout helpers
// ---------------------------------------------------------------------------

describe('yapActionRow — a row of slots between two margins', () => {
  it('shares the free width between fill slots', () => {
    expect(yapActionRow(390, [{ width: 104 }, {}])).toEqual([
      { x: 16, width: 104 },
      { x: 128, width: 246 },
    ]);
    expect(yapActionRow(390, [{ width: 104 }, { width: 96 }, {}])).toEqual([
      { x: 16, width: 104 },
      { x: 128, width: 96 },
      { x: 232, width: 142 },
    ]);
    expect(yapActionRow(360, [{}, {}])).toEqual([
      { x: 16, width: 160 },
      { x: 184, width: 160 },
    ]);
    expect(yapActionRow(390, [{}])).toEqual([{ x: 16, width: 358 }]);
  });

  it('splits the free width equally between several fill slots', () => {
    // 390 - 2 × 16 margins - 2 × 8 gaps = 342, a third each
    expect(yapActionRow(390, [{}, {}, {}])).toEqual([
      { x: 16, width: 114 },
      { x: 138, width: 114 },
      { x: 260, width: 114 },
    ]);
  });

  it('takes the margin and the gap as arguments', () => {
    expect(yapActionRow(300, [{}, {}], 10, 20)).toEqual([
      { x: 10, width: 130 },
      { x: 160, width: 130 },
    ]);
  });

  it('fills the row edge to edge, whatever the slots', () => {
    for (const view of [360, 390, 480]) {
      for (const slots of [
        [{}],
        [{}, {}],
        [{ width: 104 }, {}],
        [{ width: 104 }, { width: 96 }, {}],
      ]) {
        const boxes = yapActionRow(view, slots);
        expect(boxes[0]?.x).toBe(16);
        boxes.forEach((box, index) => {
          const next = boxes[index + 1];
          if (next !== undefined) expect(box.x + box.width + 8).toBe(next.x);
        });
        const last = boxes[boxes.length - 1];
        expect((last?.x ?? 0) + (last?.width ?? 0)).toBe(view - 16);
      }
    }
  });

  it('never gives a fill slot a negative width', () => {
    const boxes = yapActionRow(100, [{ width: 80 }, { width: 80 }, {}]);
    expect(boxes[2]?.width).toBe(0);
  });

  it('is empty without slots', () => {
    expect(yapActionRow(390, [])).toEqual([]);
  });
});

describe('yapPlanningRow — Clear, Hint and PLAY', () => {
  it('pins the row constants', () => {
    expect(YAP_ROW_FROM_BOTTOM).toBe(38);
    expect(YAP_PLANNING_CLEAR_WIDTH).toBe(104);
    expect(YAP_PLANNING_HINT_WIDTH).toBe(96);
  });

  it('lays out the planning row with and without the hint', () => {
    expect(yapPlanningRow(390, false)).toEqual({
      clear: { x: 16, width: 104 },
      hint: null,
      play: { x: 128, width: 246 },
    });
    expect(yapPlanningRow(390, true).play).toEqual({ x: 232, width: 142 });
    // 360 wide with the hint: PLAY keeps 112 px and nothing is too small to tap
    const tight = yapPlanningRow(360, true);
    expect(tight.play.width).toBe(112);
    expect(tight.hint).not.toBeNull();
    for (const box of [tight.clear, tight.hint, tight.play]) {
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  it('takes the hint slot from PLAY, not from the margins', () => {
    for (const view of [360, 390]) {
      const row = yapPlanningRow(view, true);
      expect(row.hint?.x).toBe(row.clear.x + row.clear.width + 8);
      expect(row.play.x).toBe((row.hint?.x ?? 0) + (row.hint?.width ?? 0) + 8);
      expect(row.play.x + row.play.width).toBe(view - 16);
    }
  });
});

describe('yapFitFontSize — the largest size that fits', () => {
  const measure = (size: number): number => size * 10;

  it('fits the largest size that fits', () => {
    expect(yapFitFontSize(measure, 27, 18, 230)).toBe(23);
    expect(yapFitFontSize(measure, 27, 18, 400)).toBe(27);
    expect(yapFitFontSize(measure, 27, 18, 100)).toBe(18);
  });

  it('measures from the largest size down and stops at the first that fits', () => {
    // a measure is a Text rendered again: no size is tried that cannot win
    const tried: number[] = [];
    yapFitFontSize(
      (size) => {
        tried.push(size);
        return measure(size);
      },
      27,
      18,
      230,
    );
    expect(tried).toEqual([27, 26, 25, 24, 23]);
  });

  it('gives the smallest size without measuring it when nothing larger fits', () => {
    // it is the answer whether it fits or not, so a measure is not spent on it
    const tried: number[] = [];
    const size = yapFitFontSize(
      (candidate) => {
        tried.push(candidate);
        return measure(candidate);
      },
      27,
      18,
      0,
    );
    expect(size).toBe(18);
    expect(tried).toEqual([27, 26, 25, 24, 23, 22, 21, 20, 19]);
  });
});

describe('yapEllipsize — the longest start that fits, then an ellipsis', () => {
  // ten px a character, the ellipsis included
  const measure = (text: string): number => text.length * 10;

  it('keeps a text that fits', () => {
    expect(yapEllipsize(measure, 'abcdefgh', 100)).toBe('abcdefgh');
    expect(yapEllipsize(measure, 'abcdefgh', 80)).toBe('abcdefgh');
  });

  it('cuts to the longest start that fits with the ellipsis', () => {
    expect(yapEllipsize(measure, 'abcdefgh', 55)).toBe('abcd…');
    // a start that fits exactly is kept
    expect(yapEllipsize(measure, 'abcdefgh', 50)).toBe('abcd…');
    expect(yapEllipsize(measure, 'abcdefgh', 49)).toBe('abc…');
  });

  it('trims the spaces before the ellipsis', () => {
    expect(yapEllipsize(measure, 'ab cdefgh', 45)).toBe('ab…');
  });

  it('gives the ellipsis alone when nothing fits', () => {
    expect(yapEllipsize(measure, 'abcdefgh', 5)).toBe('…');
  });

  it('leaves an empty text empty', () => {
    expect(yapEllipsize(measure, '', 0)).toBe('');
    expect(yapEllipsize(measure, '', -20)).toBe('');
  });

  it('cuts between characters, never inside an emoji', () => {
    // 😀 is two UTF-16 units but one character. At ten px a unit, 65 px has room for
    // two of them and the ellipsis (50 px), and for two and a stray half (60 px)
    const cut = yapEllipsize((text) => text.length * 10, '😀😀😀😀😀', 65);
    expect(cut).toBe('😀😀…');
  });

  it('measures few candidates, since a measure is a Text rendered again', () => {
    const measured = vi.fn(measure);
    yapEllipsize(measured, 'x'.repeat(64), 100);
    // a search, not a walk back from the end (63 candidates)
    expect(measured.mock.calls.length).toBeLessThanOrEqual(10);
  });
});

describe('yapHeaderLeftWidth — what the kicker and the title may take', () => {
  it('runs from the left margin to a 12 px gap before the right block', () => {
    expect(yapHeaderLeftWidth(390, 220)).toBe(390 - 16 - 16 - 220 - 12);
    expect(yapHeaderLeftWidth(360, 220)).toBe(360 - 16 - 16 - 220 - 12);
  });

  it('drops the gap when there are no right lines', () => {
    expect(yapHeaderLeftWidth(390, 0)).toBe(390 - 16 - 16);
  });

  it('is never negative', () => {
    expect(yapHeaderLeftWidth(360, 400)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A fake scene
// ---------------------------------------------------------------------------

/** The part of a tween config the kit sets. */
interface YapFakeTweenConfig {
  readonly targets?: unknown;
  readonly alpha?: number;
  readonly scale?: number;
  readonly duration?: number;
  readonly delay?: number;
  readonly yoyo?: boolean;
  readonly onComplete?: () => void;
}

/**
 * A Text as far as the kit asks of it. A character is half the font size wide,
 * plus the letter spacing between two of them, and a line is 1.2 times the font
 * size high, so a width follows the size and the tracking as Phaser's does.
 */
class YapFakeText {
  text: string;
  size: number;
  color: string;
  letterSpacing = 0;
  wrapWidth: number | null = null;
  originX = 0;
  originY = 0;
  destroyed = false;

  constructor(
    public x: number,
    public y: number,
    content: string,
    readonly style: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    this.text = content;
    this.size = Number.parseFloat(String(style.fontSize ?? '16'));
    this.color = typeof style.color === 'string' ? style.color : '';
  }

  get width(): number {
    const count = this.text.length;
    return Math.ceil(count * (this.size / 2) + Math.max(count - 1, 0) * this.letterSpacing);
  }

  get height(): number {
    return Math.ceil(this.size * 1.2);
  }

  setText(content: string): this {
    this.text = content;
    return this;
  }

  setFontSize(size: number | string): this {
    this.size = Number.parseFloat(String(size));
    return this;
  }

  setColor(color: string): this {
    this.color = color;
    return this;
  }

  setLetterSpacing(value: number): this {
    this.letterSpacing = value;
    return this;
  }

  setWordWrapWidth(width: number | null): this {
    this.wrapWidth = width;
    return this;
  }

  setOrigin(x: number, y: number = x): this {
    this.originX = x;
    this.originY = y;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** A Graphics that records the calls it receives, in order. */
class YapFakeGraphics {
  readonly calls: (readonly [string, ...unknown[]])[] = [];

  constructor(
    public x: number,
    public y: number,
  ) {}

  /** The arguments of every call to `name`. */
  argsOf(name: string): unknown[][] {
    return this.calls.filter(([called]) => called === name).map(([, ...args]) => args);
  }

  clear(): this {
    return this.record('clear');
  }

  fillStyle(color: number, alpha?: number): this {
    return this.record('fillStyle', color, alpha);
  }

  lineStyle(width: number, color: number, alpha?: number): this {
    return this.record('lineStyle', width, color, alpha);
  }

  fillRoundedRect(x: number, y: number, width: number, height: number, radius?: number): this {
    return this.record('fillRoundedRect', x, y, width, height, radius);
  }

  strokeRoundedRect(x: number, y: number, width: number, height: number, radius?: number): this {
    return this.record('strokeRoundedRect', x, y, width, height, radius);
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.record('lineBetween', x1, y1, x2, y2);
  }

  private record(name: string, ...args: unknown[]): this {
    this.calls.push([name, ...args]);
    return this;
  }
}

class YapFakeContainer {
  readonly children: unknown[] = [];
  scale = 1;
  alpha = 1;
  destroyed = false;

  constructor(
    public x: number,
    public y: number,
  ) {}

  add(child: unknown): this {
    if (Array.isArray(child)) this.children.push(...(child as unknown[]));
    else this.children.push(child);
    return this;
  }

  setScale(value: number): this {
    this.scale = value;
    return this;
  }

  setAlpha(value: number): this {
    this.alpha = value;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class YapFakeZone {
  readonly handlers = new Map<string, () => void>();
  interactive: unknown = null;

  constructor(
    public width: number,
    public height: number,
  ) {}

  setInteractive(config?: unknown): this {
    this.interactive = config ?? true;
    return this;
  }

  setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  on(event: string, handler: () => void): this {
    this.handlers.set(event, handler);
    return this;
  }

  /** What Phaser does when the pointer presses or releases over the zone. */
  emit(event: 'pointerdown' | 'pointerup'): void {
    this.handlers.get(event)?.();
  }
}

/**
 * A scene that creates fakes and keeps them, with the services the kit calls:
 * the scene's events, its tweens (each one returns a handle to stop it), its
 * clock and its main camera. Tweens do not run: a test calls a tween's
 * `onComplete` itself.
 */
function yapFakeStage() {
  const containers: YapFakeContainer[] = [];
  const graphics: YapFakeGraphics[] = [];
  const zones: YapFakeZone[] = [];
  const texts: YapFakeText[] = [];
  const events = { emit: vi.fn<(event: string) => void>() };
  const handles: { stop: ReturnType<typeof vi.fn<() => void>> }[] = [];
  const tweens = {
    add: vi.fn((_config: YapFakeTweenConfig) => {
      const handle = { stop: vi.fn<() => void>() };
      handles.push(handle);
      return handle;
    }),
  };
  const time = { delayedCall: vi.fn<(delay: number, callback: () => void) => void>() };
  const cameras = { main: { setBackgroundColor: vi.fn<(color: string) => void>() } };
  const add = {
    container: (x: number, y: number) => {
      const container = new YapFakeContainer(x, y);
      containers.push(container);
      return container;
    },
    graphics: (config?: { x?: number; y?: number }) => {
      const drawn = new YapFakeGraphics(config?.x ?? 0, config?.y ?? 0);
      graphics.push(drawn);
      return drawn;
    },
    zone: (_x: number, _y: number, width: number, height: number) => {
      const zone = new YapFakeZone(width, height);
      zones.push(zone);
      return zone;
    },
    text: (
      x: number,
      y: number,
      content: string | string[],
      style: Phaser.Types.GameObjects.Text.TextStyle,
    ) => {
      const text = new YapFakeText(
        x,
        y,
        Array.isArray(content) ? content.join('\n') : content,
        style,
      );
      texts.push(text);
      return text;
    },
  };
  return {
    scene: { add, events, tweens, time, cameras } as unknown as Phaser.Scene,
    events,
    tweens,
    handles,
    time,
    cameras,
    containers,
    graphics,
    zones,
    texts,
  };
}

/** Makes the OS ask for reduced motion, for the length of a test. */
function yapReduceMotion(): void {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Page, rule and card: the values of the style tile
// ---------------------------------------------------------------------------

describe('yapPaperPage — the page and its grid', () => {
  it('clears the camera to paper-page and draws a 20 px grid in ink at 5%', () => {
    const { scene, cameras, graphics } = yapFakeStage();

    const page = yapPaperPage(scene, 100, 60);

    expect([YAP_PAGE_GRID, YAP_PAGE_GRID_ALPHA]).toEqual([20, 0.05]);
    expect(cameras.main.setBackgroundColor).toHaveBeenCalledWith(YAP_PALETTE['paper-page']);
    expect(page).toBe(graphics[0]);
    expect(graphics[0]?.argsOf('lineStyle')).toEqual([[1, yapHexToInt(YAP_PALETTE.ink), 0.05]]);
    // a line every 20 px, half a pixel in so that it covers whole CSS pixels
    expect(graphics[0]?.argsOf('lineBetween')).toEqual([
      [0.5, 0, 0.5, 60],
      [20.5, 0, 20.5, 60],
      [40.5, 0, 40.5, 60],
      [60.5, 0, 60.5, 60],
      [80.5, 0, 80.5, 60],
      [0, 0.5, 100, 0.5],
      [0, 20.5, 100, 20.5],
      [0, 40.5, 100, 40.5],
    ]);
  });
});

describe('yapRule — a hairline', () => {
  it('is 1 px of ink at 16% by default, from x1 to x2 at y', () => {
    const { scene, graphics } = yapFakeStage();

    const rule = yapRule(scene, 10, 90, 63.5);

    expect(rule).toBe(graphics[0]);
    expect(graphics[0]?.argsOf('lineStyle')).toEqual([[1, yapHexToInt(YAP_PALETTE.ink), 0.16]]);
    expect(graphics[0]?.argsOf('lineBetween')).toEqual([[10, 63.5, 90, 63.5]]);
  });

  it('takes another opacity', () => {
    const { scene, graphics } = yapFakeStage();

    yapRule(scene, 0, 10, 5.5, 0.4);

    expect(graphics[0]?.argsOf('lineStyle')).toEqual([[1, yapHexToInt(YAP_PALETTE.ink), 0.4]]);
  });
});

describe('yapCard — an index card', () => {
  it('draws a hard shadow, a paper fill and a 1.5 px ink border, with a radius of 3', () => {
    const { scene, graphics } = yapFakeStage();

    const card = yapCard(scene, 16, 90, 100, 60);

    // the Graphics sits at the card's top-left corner and draws from there
    expect(card).toBe(graphics[0]);
    expect([graphics[0]?.x, graphics[0]?.y]).toEqual([16, 90]);
    const ink = yapHexToInt(YAP_PALETTE.ink);
    const paper = yapHexToInt(YAP_PALETTE.paper);
    expect(graphics[0]?.calls).toEqual([
      ['fillStyle', ink, 0.15], // the shadow, 4 px right and 5 px down
      ['fillRoundedRect', 4, 5, 100, 60, 3],
      ['fillStyle', paper, 1],
      ['fillRoundedRect', 0, 0, 100, 60, 3],
      ['lineStyle', 1.5, ink, 1],
      // the border runs inside the box, as a CSS border does
      ['strokeRoundedRect', 0.75, 0.75, 98.5, 58.5, 2.25],
    ]);
  });
});

// ---------------------------------------------------------------------------
// yapButton
// ---------------------------------------------------------------------------

/** A button at (16, 700), 246 wide, with the options a test overrides. */
function yapMakeTestButton(overrides: Partial<YapButtonOptions> = {}) {
  const stage = yapFakeStage();
  const onPress = vi.fn<() => void>();
  const button = yapButton(stage.scene, {
    x: 16,
    y: 700,
    width: 246,
    label: 'Play',
    kind: 'primary',
    onPress,
    ...overrides,
  });
  const zone = stage.zones[0];
  const label = stage.texts[0];
  const container = stage.containers[0];
  if (zone === undefined || label === undefined || container === undefined) {
    throw new Error('the button created no zone, label or container');
  }
  return { ...stage, button, onPress, zone, label, container };
}

describe('yapButton — the firing contract', () => {
  it('fires on pointerdown by default: the tap event, then onPress once', () => {
    const { zone, events, onPress } = yapMakeTestButton();

    zone.emit('pointerdown');

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(YAP_UI_TAP_EVENT);
    expect(onPress).toHaveBeenCalledTimes(1);
    // the release of the same tap is not a second press
    zone.emit('pointerup');
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does the action before the tap event, so the sound can merge the tap into it', () => {
    // sound.ts drops a tap that comes right after another cue (PLAY's own),
    // which only works when PLAY's action has already run
    const order: string[] = [];
    const { zone, events } = yapMakeTestButton({ onPress: () => order.push('press') });
    events.emit.mockImplementation(() => order.push('tap'));

    zone.emit('pointerdown');

    expect(order).toEqual(['press', 'tap']);
  });

  it('emits the tap event but does not press when disabled, until it is enabled', () => {
    const { zone, events, onPress, button } = yapMakeTestButton({ enabled: false });

    zone.emit('pointerdown');
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(YAP_UI_TAP_EVENT);
    expect(onPress).not.toHaveBeenCalled();

    button.setEnabled(true);
    zone.emit('pointerdown');
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenCalledTimes(1);

    button.setEnabled(false);
    zone.emit('pointerdown');
    expect(events.emit).toHaveBeenCalledTimes(3);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires on pointerup, not on pointerdown, with fireOn up', () => {
    const { zone, events, onPress } = yapMakeTestButton({ fireOn: 'up' });

    zone.emit('pointerdown');
    expect(events.emit).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();

    zone.emit('pointerup');
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(YAP_UI_TAP_EVENT);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('gates a release on enabled too', () => {
    const { zone, events, onPress } = yapMakeTestButton({ fireOn: 'up', enabled: false });

    zone.emit('pointerdown');
    zone.emit('pointerup');

    expect(events.emit).toHaveBeenCalledWith(YAP_UI_TAP_EVENT);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('makes the whole box tappable, with a hand cursor', () => {
    const { zone } = yapMakeTestButton({ width: 246, height: 44 });

    expect(zone.interactive).toEqual({ useHandCursor: true });
    expect([zone.width, zone.height]).toEqual([246, 44]);
  });
});

describe('yapButton — the press acknowledgement', () => {
  it('scales the container to 0.97 and back over 120 ms on pointerdown', () => {
    const { zone, tweens, container } = yapMakeTestButton();

    zone.emit('pointerdown');

    expect(tweens.add).toHaveBeenCalledTimes(1);
    const config = tweens.add.mock.calls[0]?.[0];
    expect(config?.targets).toBe(container);
    expect(config?.scale).toBe(0.97);
    expect(config?.yoyo).toBe(true);
    // out and back: twice the duration is the 120 ms of the spec
    expect((config?.duration ?? 0) * 2).toBe(YAP_MOTION_FAST);
  });

  it('also acknowledges a press that fires on release, and fires nothing yet', () => {
    const { zone, tweens, events } = yapMakeTestButton({ fireOn: 'up' });

    zone.emit('pointerdown');

    expect(tweens.add).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('acknowledges a disabled button too', () => {
    const { zone, tweens } = yapMakeTestButton({ enabled: false });

    zone.emit('pointerdown');

    expect(tweens.add).toHaveBeenCalledTimes(1);
  });

  it('starts a quick second press from the rest size instead of piling up', () => {
    const { zone, tweens, handles, container } = yapMakeTestButton();

    zone.emit('pointerdown');
    container.scale = 0.985; // the first press is half way back
    zone.emit('pointerdown');

    expect(handles[0]?.stop).toHaveBeenCalledTimes(1);
    expect(container.scale).toBe(1);
    expect(tweens.add).toHaveBeenCalledTimes(2);
  });

  it('does not move under reduced motion, but still fires', () => {
    yapReduceMotion();
    const { zone, tweens, events, onPress } = yapMakeTestButton();

    zone.emit('pointerdown');

    expect(tweens.add).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(YAP_UI_TAP_EVENT);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('yapButton — box, label and look', () => {
  it('sits at the centre of its box, which starts at x and is centred on y', () => {
    const { container, button } = yapMakeTestButton({ x: 128, y: 806, width: 246 });

    expect([container.x, container.y]).toEqual([128 + 123, 806]);
    expect(button.container).toBe(container);
  });

  it('moves and resizes its box: the container, the hit zone and the drawing', () => {
    const { container, zone, button, graphics } = yapMakeTestButton({ x: 128, width: 246 });
    const background = graphics[0];

    button.setBox(232, 142);

    expect(container.x).toBe(232 + 71);
    expect([zone.width, zone.height]).toEqual([142, 52]);
    // redrawn around its centre at the new width
    expect(background?.argsOf('fillRoundedRect').pop()).toEqual([-71, -26, 142, 52, 6]);
  });

  it('keeps its drawing when the box only moves', () => {
    const { button, graphics } = yapMakeTestButton();
    const background = graphics[0];
    const drawn = background?.calls.length ?? 0;

    button.setBox(40, 246);

    expect(background?.calls.length).toBe(drawn);
  });

  it('shows its label in capitals, and a new one too', () => {
    const { label, button } = yapMakeTestButton({ label: 'Jouer' });
    expect(label.text).toBe('JOUER');

    button.setLabel('Draw your route');
    expect(label.text).toBe('DRAW YOUR ROUTE');
  });

  it('has a 52 px height unless told otherwise', () => {
    expect(yapMakeTestButton().zone.height).toBe(52);
    expect(yapMakeTestButton({ height: 48 }).zone.height).toBe(48);
  });

  it('draws a primary button in ink, with a paper label in the primary role', () => {
    const { graphics, label } = yapMakeTestButton({ kind: 'primary' });

    expect(graphics[0]?.argsOf('fillStyle').pop()).toEqual([yapHexToInt(YAP_PALETTE.ink), 1]);
    expect(graphics[0]?.argsOf('lineStyle')).toEqual([]);
    expect(label.color).toBe(YAP_PALETTE.paper);
    expect(label.style.fontStyle).toBe('bold'); // buttonPrimary
  });

  it('draws a secondary button in paper with a 1.5 px ink outline and an ink label', () => {
    const { graphics, label } = yapMakeTestButton({ kind: 'secondary' });

    expect(graphics[0]?.argsOf('fillStyle').pop()).toEqual([yapHexToInt(YAP_PALETTE.paper), 1]);
    expect(graphics[0]?.argsOf('lineStyle').pop()).toEqual([1.5, yapHexToInt(YAP_PALETTE.ink), 1]);
    expect(label.color).toBe(YAP_PALETTE.ink);
    expect(label.style.fontStyle).toBeUndefined(); // button
  });

  it('draws a disabled primary button in ink-disabled with an ink label', () => {
    const { graphics, label, button } = yapMakeTestButton({ kind: 'primary' });

    button.setEnabled(false);

    expect(graphics[0]?.argsOf('fillStyle').pop()).toEqual([
      yapHexToInt(YAP_PALETTE['ink-disabled']),
      1,
    ]);
    expect(label.color).toBe(YAP_PALETTE.ink);
    button.setEnabled(true);
    expect(graphics[0]?.argsOf('fillStyle').pop()).toEqual([yapHexToInt(YAP_PALETTE.ink), 1]);
    expect(label.color).toBe(YAP_PALETTE.paper);
  });

  it('draws a disabled secondary button with an ink-disabled outline and an ink-muted label', () => {
    const { graphics, label } = yapMakeTestButton({ kind: 'secondary', enabled: false });

    expect(graphics[0]?.argsOf('fillStyle').pop()).toEqual([yapHexToInt(YAP_PALETTE.paper), 1]);
    expect(graphics[0]?.argsOf('lineStyle').pop()).toEqual([
      1.5,
      yapHexToInt(YAP_PALETTE['ink-disabled']),
      1,
    ]);
    expect(label.color).toBe(YAP_PALETTE['ink-muted']);
  });

  it('draws with a radius of 6', () => {
    const { graphics } = yapMakeTestButton({ kind: 'secondary' });

    expect(graphics[0]?.argsOf('fillRoundedRect').pop()?.[4]).toBe(6);
    // the outline sits inside the box: its radius shrinks by half its width
    expect(graphics[0]?.argsOf('strokeRoundedRect').pop()).toEqual([
      -122.25, -25.25, 244.5, 50.5, 5.25,
    ]);
  });
});

describe('yapButton — a label that must fit its width', () => {
  // The fake is 7 px a character at the button size, plus the 2 px tracking of
  // the button role between two characters. A 120 px button has room for 96 px
  // (24 px of padding) and wraps at 104 px (16 px).
  const tracking = 2;
  const room = { width: 120, kind: 'secondary' } as const;

  it('keeps the tracking while the label fits', () => {
    const { label } = yapMakeTestButton({ ...room, label: 'Clear' }); // 5: 35 + 8

    expect(label.letterSpacing).toBe(tracking);
    expect(label.wrapWidth).toBeNull();
  });

  it('drops the tracking when the tracked label is too wide', () => {
    // 11: 77 px, but 97 px tracked
    const { label } = yapMakeTestButton({ ...room, label: 'Abcdefghijk' });

    expect(label.letterSpacing).toBe(0);
    expect(label.wrapWidth).toBeNull();
  });

  it('wraps at the width minus 16 when it is still too wide, centred', () => {
    // 17: 119 px even without tracking
    const { label } = yapMakeTestButton({ ...room, label: 'Abcde fghijklmnop' });

    expect(label.letterSpacing).toBe(0);
    expect(label.wrapWidth).toBe(104);
    expect(label.style.align).toBe('center');
    expect(label.originX).toBe(0.5);
    expect(label.originY).toBe(0.5);
  });

  it('fits again from the role look when the label changes', () => {
    const { label, button } = yapMakeTestButton({ ...room, label: 'Abcde fghijklmnop' });

    button.setLabel('Ok');

    expect(label.letterSpacing).toBe(tracking);
    expect(label.wrapWidth).toBeNull();
  });

  it('fits again when the box changes width', () => {
    const { label, button } = yapMakeTestButton({ ...room, label: 'Abcde fghijklmnop' });

    button.setBox(16, 300); // 276 px of room

    expect(label.letterSpacing).toBe(tracking);
    expect(label.wrapWidth).toBeNull();

    button.setBox(16, 120);

    expect(label.letterSpacing).toBe(0);
    expect(label.wrapWidth).toBe(104);
  });

  it('leaves a label alone when it is set again to the same text', () => {
    const { label, button } = yapMakeTestButton({ ...room, label: 'Abcde fghijklmnop' });
    const spacing = vi.spyOn(label, 'setLetterSpacing');

    button.setLabel('Abcde fghijklmnop');

    expect(spacing).not.toHaveBeenCalled();
    expect(label.wrapWidth).toBe(104);
  });

  it('draws a label with an emoji untracked, whatever the room', () => {
    // Phaser spaces a Text one UTF-16 unit at a time: tracked, 💡 (two units)
    // would be drawn as two broken halves
    const { label, button } = yapMakeTestButton({
      width: 300,
      kind: 'secondary',
      label: '💡 Hint',
    });

    expect(label.letterSpacing).toBe(0);
    expect(label.wrapWidth).toBeNull();

    button.setLabel('Hint');
    expect(label.letterSpacing).toBe(tracking);

    button.setLabel('💡 Indice');
    expect(label.letterSpacing).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// yapHeader
// ---------------------------------------------------------------------------

describe('yapHeader — kicker, title and right block in a 64 px band', () => {
  function yapMakeTestHeader(
    width: number,
    options: { kicker: string; title: string; right?: readonly string[]; rightLarge?: boolean },
  ) {
    const stage = yapFakeStage();
    const header = yapHeader(stage.scene, width, options);
    const kicker = stage.texts[0];
    const title = stage.texts[1];
    if (kicker === undefined || title === undefined) throw new Error('the header made no texts');
    const rightLines = (): YapFakeText[] => stage.texts.slice(2).filter((text) => !text.destroyed);
    return { ...stage, header, kicker, title, rightLines };
  }

  it('puts the kicker at (16, 10) in ink-muted capitals and the title at (16, 26) in ink', () => {
    const { kicker, title } = yapMakeTestHeader(390, {
      kicker: 'Heist No. 5',
      title: 'Pink Panther',
    });

    expect([kicker.x, kicker.y]).toEqual([16, 10]);
    expect(kicker.text).toBe('HEIST NO. 5');
    expect(kicker.color).toBe(YAP_PALETTE['ink-muted']);
    expect([title.x, title.y]).toEqual([16, 26]);
    expect(title.text).toBe('Pink Panther');
    expect(title.color).toBe(YAP_PALETTE.ink);
    expect(title.size).toBe(27);
  });

  it('draws the rule on the bottom edge of the band, across the whole width', () => {
    const { graphics } = yapMakeTestHeader(390, { kicker: 'K', title: 'T' });

    const rule = graphics[0];
    expect(rule?.argsOf('lineBetween')).toEqual([[0, 63.5, 390, 63.5]]);
    expect(rule?.argsOf('lineStyle')).toEqual([[1, yapHexToInt(YAP_PALETTE.ink), 0.16]]);
  });

  it('stacks the right lines from y = 12, right-aligned at width - 16', () => {
    const { rightLines } = yapMakeTestHeader(390, {
      kicker: 'K',
      title: 'T',
      right: ['9 ticks', '2 pauses', 'par 12'],
    });

    const lines = rightLines();
    expect(lines.map((line) => line.text)).toEqual(['9 TICKS', '2 PAUSES', 'PAR 12']);
    expect(lines.map((line) => line.x)).toEqual([374, 374, 374]);
    expect(lines.map((line) => line.originX)).toEqual([1, 1, 1]);
    expect(lines.map((line) => line.color)).toEqual(lines.map(() => YAP_PALETTE.ink));
    // each one under the previous by its own height
    let y = 12;
    for (const line of lines) {
      expect(line.y).toBe(y);
      y += line.height;
    }
  });

  it('sets the last right line in the large stat role when asked', () => {
    const { rightLines } = yapMakeTestHeader(390, {
      kicker: 'K',
      title: 'T',
      right: ['07/26'],
      rightLarge: true,
    });
    const large = yapMakeTestHeader(390, {
      kicker: 'K',
      title: 'T',
      right: ['Ticks', '07/26'],
      rightLarge: true,
    }).rightLines();
    const plain = yapMakeTestHeader(390, {
      kicker: 'K',
      title: 'T',
      right: ['07/26'],
    }).rightLines();

    expect(rightLines()[0]?.size).toBe(22);
    expect(large.map((line) => line.size)).toEqual([14, 22]);
    expect(plain[0]?.size).toBe(14);
  });

  it('shrinks the title to the room next to the right block', () => {
    // A 22 character right line is 190 px wide, which leaves 360 - 32 - 12 - 190
    // = 126 px. 'The patrol' is 5 px wide per point of size: 25 px fits, 26 does not
    const { title, rightLines } = yapMakeTestHeader(360, {
      kicker: 'K',
      title: 'The patrol',
      right: ['x'.repeat(22)],
    });

    expect(rightLines()[0]?.width).toBe(190);
    expect(title.size).toBe(25);
    expect(title.text).toBe('The patrol');
    expect(title.width).toBeLessThanOrEqual(126);
  });

  it('cuts a title that does not fit at 18 px, and a kicker, with an ellipsis', () => {
    const { kicker, title, rightLines } = yapMakeTestHeader(360, {
      kicker: 'Challenge · heist No. 12',
      title: 'Changing of the Guard',
      right: ['10 ticks · par 12', '3 pauses · ★3=12 ★2≤16'],
    });

    const left = yapHeaderLeftWidth(360, Math.max(...rightLines().map((line) => line.width)));
    expect(title.size).toBe(18);
    expect(title.text.endsWith('…')).toBe(true);
    expect('Changing of the Guard'.startsWith(title.text.slice(0, -1).trimEnd())).toBe(true);
    expect(title.width).toBeLessThanOrEqual(left);
    expect(kicker.text.endsWith('…')).toBe(true);
    expect('CHALLENGE · HEIST NO. 12'.startsWith(kicker.text.slice(0, -1))).toBe(true);
    expect(kicker.width).toBeLessThanOrEqual(left);
  });

  it('refits the title and the kicker to the room when the right lines change', () => {
    const { header, kicker, title, rightLines } = yapMakeTestHeader(360, {
      kicker: 'Challenge · heist No. 12',
      title: 'Changing of the Guard',
      right: ['10 ticks · par 12', '3 pauses · ★3=12 ★2≤16'],
    });
    expect(title.text.endsWith('…')).toBe(true);

    // no right block: the whole 328 px are theirs, and the title is 284 px at 27 px
    header.setRight([]);
    expect(rightLines()).toEqual([]);
    expect(title.text).toBe('Changing of the Guard');
    expect(title.size).toBe(27);
    expect(kicker.text).toBe('CHALLENGE · HEIST NO. 12');
  });

  it('restores a cut title whole, at the largest size that now fits, when the room grows', () => {
    // 26 characters on the right leave 91 px, and 'Changing of the Guard' is cut at
    // 18 px. 13 characters leave 204 px: the whole title takes 10.5 px a point, so 19 px
    const { header, title } = yapMakeTestHeader(360, {
      kicker: 'K',
      title: 'Changing of the Guard',
      right: ['x'.repeat(26)],
    });
    expect(title.text.endsWith('…')).toBe(true);

    header.setRight(['x'.repeat(13)]);

    expect(title.text).toBe('Changing of the Guard');
    expect(title.size).toBe(19);
  });

  it('leaves the room alone, and renders nothing again, when the right block keeps its width', () => {
    // a digit that changes in a mono line does not change its width
    const { header, title, kicker } = yapMakeTestHeader(360, {
      kicker: 'Challenge · heist No. 12',
      title: 'Changing of the Guard',
      right: ['10 ticks · par 12', '3 pauses'],
    });
    const sizes = vi.spyOn(title, 'setFontSize');
    const texts = vi.spyOn(title, 'setText');
    const kickerTexts = vi.spyOn(kicker, 'setText');

    header.setRight(['11 ticks · par 12', '3 pauses']);

    expect(sizes).not.toHaveBeenCalled();
    expect(texts).not.toHaveBeenCalled();
    expect(kickerTexts).not.toHaveBeenCalled();
  });

  it('fits the title to the full width, and keeps the 27 px, without right lines', () => {
    const { title } = yapMakeTestHeader(390, { kicker: 'K', title: 'Pink Panther' });

    expect(title.size).toBe(27);
    expect(title.text).toBe('Pink Panther');
  });

  it('reuses its right lines when they change in place, and drops the extra ones', () => {
    const { header, texts, rightLines } = yapMakeTestHeader(390, {
      kicker: 'K',
      title: 'T',
      right: ['1 tick', '2 pauses'],
    });
    const created = texts.length;

    header.setRight(['2 ticks', '2 pauses']);
    expect(texts).toHaveLength(created); // no new Text
    expect(rightLines().map((line) => line.text)).toEqual(['2 TICKS', '2 PAUSES']);

    header.setRight(['3 ticks']);
    expect(texts).toHaveLength(created);
    expect(rightLines().map((line) => line.text)).toEqual(['3 TICKS']);
    expect(texts.filter((text) => text.destroyed)).toHaveLength(1);
  });

  it('swaps the role of a line that becomes the last one with rightLarge', () => {
    const { header, rightLines } = yapMakeTestHeader(390, {
      kicker: 'K',
      title: 'T',
      right: ['Ticks'],
      rightLarge: true,
    });
    expect(rightLines().map((line) => line.size)).toEqual([22]);

    header.setRight(['Ticks', '07/26']);

    const [first, last] = rightLines();
    expect(rightLines().map((line) => line.size)).toEqual([14, 22]);
    expect(rightLines().map((line) => line.text)).toEqual(['TICKS', '07/26']);
    // re-stacked from the top with the heights of the new roles
    expect(first?.y).toBe(12);
    expect(last?.y).toBe(12 + (first?.height ?? 0));
  });

  it('puts the header in one container the scene can place', () => {
    const { header, containers } = yapMakeTestHeader(390, { kicker: 'K', title: 'T' });

    expect(header.container).toBe(containers[0]);
    expect([containers[0]?.x, containers[0]?.y]).toEqual([0, 0]);
  });

  it('reports the kicker and the title as drawn: in capitals, and cut when cut', () => {
    const whole = yapMakeTestHeader(390, { kicker: 'Heist No. 5', title: 'Pink Panther' });
    expect(whole.header.shown()).toEqual({ kicker: 'HEIST NO. 5', title: 'Pink Panther' });

    const { header, kicker, title } = yapMakeTestHeader(360, {
      kicker: 'Challenge · heist No. 12',
      title: 'Changing of the Guard',
      right: ['10 ticks · par 12', '3 pauses · ★3=12 ★2≤16'],
    });
    const cut = header.shown();
    expect(cut).toEqual({ kicker: kicker.text, title: title.text });
    expect(cut.kicker.endsWith('…')).toBe(true);
    expect(cut.title.endsWith('…')).toBe(true);

    // the right block goes: both are refitted, whole, and reported so
    header.setRight([]);
    expect(header.shown()).toEqual({
      kicker: 'CHALLENGE · HEIST NO. 12',
      title: 'Changing of the Guard',
    });
  });
});

// ---------------------------------------------------------------------------
// yapShowToast
// ---------------------------------------------------------------------------

describe('yapShowToast — a note that fades in, holds and fades out', () => {
  function yapShow(message = 'Copied') {
    const stage = yapFakeStage();
    const parent = new YapFakeContainer(0, 0);
    yapShowToast(stage.scene, parent as unknown as Phaser.GameObjects.Container, 195, 700, message);
    const text = stage.texts[0];
    const note = stage.containers[0];
    if (text === undefined || note === undefined) throw new Error('the toast made no text or note');
    return { ...stage, parent, text, note };
  }

  it('puts a note in the parent at (x, y), with its text in the body role in ink', () => {
    const { parent, note, text } = yapShow('Copied');

    expect(parent.children).toEqual([note]);
    expect([note.x, note.y]).toEqual([195, 700]);
    expect(text.text).toBe('Copied');
    expect(text.color).toBe(YAP_PALETTE.ink);
    expect(text.size).toBe(16); // body
  });

  it('wraps a long message at 280 px, centred', () => {
    const { text } = yapShow('Could not share');

    expect(text.style.wordWrap).toEqual({ width: 280 });
    expect(text.style.align).toBe('center');
  });

  it('anchors the card above the point, with 12 × 8 px of padding around the text', () => {
    const { graphics, text } = yapShow('Copied');

    const card = graphics[0];
    const width = text.width + 24;
    const height = text.height + 16;
    // the card is a Graphics placed at its top-left corner in the note
    expect([card?.x, card?.y]).toEqual([-width / 2, -height]);
    expect(card?.argsOf('fillRoundedRect')).toContainEqual([0, 0, width, height, 3]);
    expect([text.x, text.y]).toEqual([0, -height / 2]);
    expect([text.originX, text.originY]).toEqual([0.5, 0.5]);
  });

  it('fades in over 120 ms, holds 1400 ms, fades out over 200 ms, then goes', () => {
    const { tweens, note } = yapShow();

    expect(note.alpha).toBe(0);
    expect(tweens.add).toHaveBeenCalledTimes(1);
    const fadeIn = tweens.add.mock.calls[0]?.[0];
    expect(fadeIn).toMatchObject({ targets: note, alpha: 1, duration: 120 });

    fadeIn?.onComplete?.();
    expect(tweens.add).toHaveBeenCalledTimes(2);
    const fadeOut = tweens.add.mock.calls[1]?.[0];
    expect(fadeOut).toMatchObject({ targets: note, alpha: 0, delay: 1400, duration: 200 });
    expect(note.destroyed).toBe(false);

    fadeOut?.onComplete?.();
    expect(note.destroyed).toBe(true);
  });

  it('shows with no fade under reduced motion, for the same time, then goes', () => {
    yapReduceMotion();
    const { tweens, time, note } = yapShow();

    expect(tweens.add).not.toHaveBeenCalled();
    expect(note.alpha).toBe(1);
    expect(time.delayedCall).toHaveBeenCalledTimes(1);
    expect(time.delayedCall.mock.calls[0]?.[0]).toBe(120 + 1400 + 200);

    time.delayedCall.mock.calls[0]?.[1]();
    expect(note.destroyed).toBe(true);
  });
});
