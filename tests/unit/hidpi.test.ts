// Tests for the device-pixel helpers (story C1, visual pass 3 — crisp HiDPI
// rendering).
//
// The game draws at the device pixel ratio so that text and lines on a phone
// are as sharp as the browser's own. These helpers are the arithmetic under
// that: which ratio to trust, how large the canvas backing store is, and how
// to get back to the CSS pixels every scene lays out in. They are pure and
// Phaser-free, so they run in node, where there is no devicePixelRatio. The
// resize helpers, which follow the page frame and rebuild a scene once per
// new size, run on fakes: a scene or a game that is only a size, a frame that
// is only a client size, and a stubbed window.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  YAP_DPR,
  yapCssSize,
  yapDevicePixelRatio,
  yapDeviceSize,
  yapInstallResize,
  yapOnViewResize,
} from '../../src/game/hidpi';

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

describe('yapOnViewResize — one rebuild per new view size', () => {
  it('rebuilds only when the view size changed', () => {
    // a scene that is only its game size, in device pixels; the ratio is 1 in
    // node, so that is the view size too
    const scale = { width: 390, height: 844 };
    const rebuild = vi.fn();
    const onResize = yapOnViewResize({ scale } as unknown as Phaser.Scene, rebuild);

    // Phaser's own refresh: a RESIZE at the size the scene was built at
    onResize();
    expect(rebuild).not.toHaveBeenCalled();

    // a new size rebuilds, once
    scale.width = 360;
    scale.height = 640;
    onResize();
    expect(rebuild).toHaveBeenCalledTimes(1);
    onResize();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // one side is enough
    scale.height = 700;
    onResize();
    expect(rebuild).toHaveBeenCalledTimes(2);
  });
});

describe('yapInstallResize — the game follows its page frame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * A 390 × 844 game whose `scale.resize` is a spy that, like Phaser's, makes
   * the new size the game size; and a page frame of the same client size.
   */
  function yapFakes() {
    const scale = {
      width: 390,
      height: 844,
      resize: vi.fn((width: number, height: number): void => {
        scale.width = width;
        scale.height = height;
      }),
    };
    const game = { scale } as unknown as Phaser.Game;
    const frame = { clientWidth: 390, clientHeight: 844 };
    return { game, resize: scale.resize, frame };
  }

  it('resizes the game on a window resize only when the frame size changed', () => {
    // node has no ResizeObserver: the window listener alone
    const addEventListener = vi.fn((_type: string, _listener: () => void): void => undefined);
    vi.stubGlobal('window', { addEventListener });
    const { game, resize, frame } = yapFakes();
    yapInstallResize(game, frame as unknown as HTMLElement);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    const [type, follow] = addEventListener.mock.calls[0] ?? [];
    expect(type).toBe('resize');
    if (follow === undefined) throw new Error('no window resize listener');

    // the frame kept its size (a desktop window wider than the 480 px frame):
    // nothing to resize, so no RESIZE reaches the scenes from here
    follow();
    expect(resize).not.toHaveBeenCalled();

    // the frame changed: the game takes its size, in device pixels
    frame.clientHeight = 700;
    follow();
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenLastCalledWith(390, 700);

    // the game has the frame's size now: a repeated event is a no-op
    follow();
    expect(resize).toHaveBeenCalledTimes(1);
  });

  it('follows a frame resized without a window resize, through a ResizeObserver', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const observers: YapFakeResizeObserver[] = [];
    /** Records what it observes; yapReport plays the browser reporting a size. */
    class YapFakeResizeObserver {
      readonly targets: unknown[] = [];
      private readonly callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target: unknown): void {
        this.targets.push(target);
      }
      yapReport(): void {
        this.callback();
      }
    }
    vi.stubGlobal('ResizeObserver', YapFakeResizeObserver);
    const { game, resize, frame } = yapFakes();
    yapInstallResize(game, frame as unknown as HTMLElement);

    const observer = observers[0];
    if (observer === undefined) throw new Error('no ResizeObserver');
    expect(observers).toHaveLength(1);
    expect(observer.targets).toHaveLength(1);
    expect(observer.targets[0]).toBe(frame);

    // the first report, at the size the game was made at: nothing to resize
    observer.yapReport();
    expect(resize).not.toHaveBeenCalled();

    // the page gives #game a new height, no window resize: the game follows
    frame.clientHeight = 700;
    observer.yapReport();
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenLastCalledWith(390, 700);
  });
});
