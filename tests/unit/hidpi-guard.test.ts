// Source guards for story C1, visual pass 3 — crisp HiDPI rendering.
//
// The canvas is backed in device pixels (CSS size × ratio) while every scene
// lays out in CSS pixels. The conversions between the two live in one module,
// src/game/hidpi.ts. A scene that read the game size, a pointer position or
// baked a texture on its own would silently work in device pixels: a layout
// three times too large, a stroke landing cells away from the finger, a
// blurry grid on a phone. These guards scan the scenes and the entry point so
// that the device-pixel APIs are only reached through hidpi.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = new URL('../../src/', import.meta.url);
/** The one module allowed to touch the device-pixel APIs. */
const HIDPI_FILE = 'src/game/hidpi.ts';

/** Every src/game/*.ts file plus src/main.ts, as [path from the repo root, source]. */
function yapScannedSources(): (readonly [string, string])[] {
  const game = readdirSync(new URL('game/', SRC_ROOT))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `game/${name}`);
  return [...game, 'main.ts'].map(
    (rel) => [`src/${rel}`, readFileSync(new URL(rel, SRC_ROOT), 'utf8')] as const,
  );
}

/** `file:line: code` for every line matching `pattern`, outside hidpi.ts. */
function yapOffenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const [file, source] of yapScannedSources()) {
    if (file === HIDPI_FILE) continue;
    source.split('\n').forEach((line, index) => {
      if (pattern.test(line)) found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  return found;
}

describe('device pixels stay behind src/game/hidpi.ts', () => {
  it('scans every scene and the entry point', () => {
    // a guard over an empty file list would pass for nothing
    const files = yapScannedSources().map(([file]) => file);
    for (const expected of [
      'src/game/level-scene.ts',
      'src/game/home-scene.ts',
      'src/game/challenge-scene.ts',
      'src/game/consent-scene.ts',
      'src/game/viewer-scene.ts',
      HIDPI_FILE,
      'src/main.ts',
    ]) {
      expect(files).toContain(expected);
    }
  });

  it('reads the view size only through yapViewSize', () => {
    expect(yapOffenders(/this\.scale\.(width|height)\b/)).toEqual([]);
  });

  it('converts pointers only through yapPointerView', () => {
    expect(yapOffenders(/\bpointer\.(x|y)\b/)).toEqual([]);
  });

  it('bakes textures only through yapBakeTexture', () => {
    expect(yapOffenders(/generateTexture\(/)).toEqual([]);
  });

  it('keeps the canvas in device pixels', () => {
    const main = readFileSync(new URL('main.ts', SRC_ROOT), 'utf8');
    expect(main).toContain('Phaser.Scale.NONE');
    expect(main).not.toContain('Phaser.Scale.RESIZE');
  });
});
