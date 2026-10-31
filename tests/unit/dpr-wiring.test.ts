// Tests for story C1, visual pass 3 — crisp HiDPI rendering: the device pixel
// ratio of a phone reaches YAP_DPR, every text style and every text.
//
// The other suites run in node, where there is no devicePixelRatio and
// YAP_DPR is 1, so a text left at Phaser's resolution of 1 passes them all.
// Here a phone's ratio is stubbed before src/game/hidpi.ts loads (it reads
// the ratio once, at load), and the modules are imported fresh after it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';

describe('the device ratio reaches YAP_DPR and every text', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reads a fractional ratio at load into YAP_DPR, the styles and the texts', async () => {
    vi.stubGlobal('devicePixelRatio', 2.625);
    vi.resetModules();
    const { YAP_DPR } = await import('../../src/game/hidpi');
    const { yapText, yapTextStyle } = await import('../../src/game/text');

    expect(YAP_DPR).toBe(2.625);
    expect(yapTextStyle(16, '#000').resolution).toBe(2.625);
    // a fake scene whose add.text records the style it is given; the style
    // written by hand asks for 1, the factory draws at the device ratio
    const text = vi.fn(
      (
        _x: number,
        _y: number,
        _content: string | string[],
        _style: Phaser.Types.GameObjects.Text.TextStyle,
      ) => ({}),
    );
    yapText({ add: { text } } as unknown as Phaser.Scene, 0, 0, 'Hi', { resolution: 1 });
    expect(text).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledWith(0, 0, 'Hi', { resolution: 2.625 });
  });

  it('caps the ratio at 3', async () => {
    vi.stubGlobal('devicePixelRatio', 5);
    vi.resetModules();
    const { YAP_DPR } = await import('../../src/game/hidpi');
    expect(YAP_DPR).toBe(3);
  });
});
