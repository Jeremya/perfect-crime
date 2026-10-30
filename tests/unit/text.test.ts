// Tests for the text factory (story C1, visual pass 3 — crisp HiDPI rendering).
//
// Every Text in the game is made through one factory, so that none is left at
// Phaser's default resolution of 1 (blurry on a high-density screen) and none
// names a font of its own: the three system font stacks live in one place. The
// style builder is pure and the scene is a fake that records what it was asked
// to create, so the suite runs in node, where there is no devicePixelRatio and
// the resolution is 1.
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { YAP_FONT_STACKS, yapText, yapTextStyle } from '../../src/game/text';

describe('YAP_FONT_STACKS — system fonts only', () => {
  it('pins the three system font stacks', () => {
    expect(YAP_FONT_STACKS).toEqual({
      ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif',
      serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
      mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace',
    });
  });
});

describe('yapTextStyle — a style at the device resolution', () => {
  // toStrictEqual: Phaser reads a key that is present even when its value is
  // undefined, so a stray `undefined` in the style is not harmless.
  it('builds a style at the device resolution', () => {
    expect(yapTextStyle(16, '#202A33')).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.ui,
      fontSize: '16px',
      color: '#202A33',
      resolution: 1,
    });
  });

  it('passes extra style through and picks the family', () => {
    const style = yapTextStyle(14, '#000', {
      family: 'mono',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 200 },
    });
    expect(style).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.mono,
      fontSize: '14px',
      color: '#000',
      resolution: 1,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 200 },
    });
    // `family` is the factory's own option, not a Phaser style key: it is
    // consumed, never forwarded
    expect(style).not.toHaveProperty('family');
  });
});

describe('yapText — a Text created through the scene', () => {
  it('creates text through the scene with the device resolution', () => {
    // echoes its arguments, so the returned "Text" shows what it was made from
    const text = vi.fn(
      (
        x: number,
        y: number,
        content: string | string[],
        style: Phaser.Types.GameObjects.Text.TextStyle,
      ) => ({ x, y, content, style }),
    );
    const scene = { add: { text } } as unknown as Phaser.Scene;
    const style = { color: '#111', resolution: 7 };

    const created = yapText(scene, 4, 5, 'Hi', style);

    // the caller's own resolution (7) gives way to the device's (1 in node)
    expect(text).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledWith(4, 5, 'Hi', { color: '#111', resolution: 1 });
    // without touching the style object, which a scene may share between texts
    expect(style).toEqual({ color: '#111', resolution: 7 });
    // and the caller gets back exactly what the scene created
    expect(created).toBe(text.mock.results[0]?.value);
  });
});
