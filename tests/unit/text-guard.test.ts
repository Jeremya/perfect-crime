// Source guards for story C1, visual pass 3 — crisp HiDPI rendering.
//
// Every Text in the game is created by one factory, src/game/text.ts: yapText
// draws it at the device pixel ratio and yapTextStyle names the system font
// stacks. A scene that made a Text on its own would leave it at Phaser's
// resolution of 1 (soft on a phone) and a style that named a font would drift
// from the stacks of the design. These guards scan the scenes so that texts
// are only made, and fonts only named or changed, in text.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GAME_ROOT = new URL('../../src/game/', import.meta.url);
/** The one module allowed to create a Text and to name or change a font. */
const TEXT_FILE = 'src/game/text.ts';

/** Every src/game/*.ts file, as [path from the repo root, source]. */
function yapScannedSources(): (readonly [string, string])[] {
  return readdirSync(GAME_ROOT)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [`src/game/${name}`, readFileSync(new URL(name, GAME_ROOT), 'utf8')] as const);
}

/**
 * `file:line: code` for every match of `pattern` (a plain regexp, applied
 * globally) outside text.ts. The pattern runs over the whole source, so it also
 * catches a chain broken over lines (`this.add` then `.text(` on the next
 * one); the line is where the match starts.
 */
function yapOffenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const [file, source] of yapScannedSources()) {
    if (file === TEXT_FILE) continue;
    const lines = source.split('\n');
    for (const match of source.matchAll(new RegExp(pattern.source, 'g'))) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push(`${file}:${line}: ${(lines[line - 1] ?? '').trim()}`);
    }
  }
  return found;
}

describe('texts stay behind src/game/text.ts', () => {
  it('scans every scene and the text factory', () => {
    // a guard over an empty file list would pass for nothing
    const files = yapScannedSources().map(([file]) => file);
    for (const expected of [
      'src/game/level-scene.ts',
      'src/game/home-scene.ts',
      'src/game/challenge-scene.ts',
      'src/game/consent-scene.ts',
      'src/game/viewer-scene.ts',
      TEXT_FILE,
    ]) {
      expect(files).toContain(expected);
    }
  });

  it('no font family outside text.ts', () => {
    // `fontFamily:` and Phaser's `font:` shorthand, which sets the family too;
    // `fontSize:` and `fontStyle:` stay free
    expect(yapOffenders(/\bfont(Family)?\s*:/)).toEqual([]);
  });

  it('no font is changed outside text.ts', () => {
    // `setFontSize` and `setFontStyle` keep the family and the resolution
    expect(yapOffenders(/\.\s*setFont(Family)?\s*\(/)).toEqual([]);
  });

  it('no Text is created outside yapText', () => {
    expect(yapOffenders(/\badd\s*\.\s*text\s*\(/)).toEqual([]);
  });
});
