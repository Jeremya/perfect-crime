// Tests for the HTML shell (index.html) and the build base.
//
// Two regressions this guards against:
//   - the shell still painted the pre-C1 dark background (#0b0e14) while
//     docs/UI-DESIGN.md mandates the light theme only: mobile showed a dark
//     flash before Phaser booted and a dark browser chrome (theme-color);
//   - `base: './'` broke every route deeper than one segment: at /dev/viewer
//     the entry chunk resolved to /dev/assets/index-*.js, which a static host
//     answers with index.html (refused by nosniff), so the viewer never booted.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { YAP_PALETTE } from '../../src/game/board';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const shell = readFileSync(`${ROOT}index.html`, 'utf8');
const viteConfig = readFileSync(`${ROOT}vite.config.ts`, 'utf8');

describe('HTML shell and build base', () => {
  it('paints the app background with the surface-page token', () => {
    const surfacePage = YAP_PALETTE['surface-page'].toLowerCase();
    expect(shell.toLowerCase()).toContain(`background: ${surfacePage};`);
  });

  it('declares a theme-color that matches the light surface', () => {
    const meta = /<meta name="theme-color" content="([^"]+)" \/>/.exec(shell);
    expect(meta).not.toBeNull();
    expect(meta?.[1]?.toLowerCase()).toBe(YAP_PALETTE['surface-page'].toLowerCase());
  });

  it('has no trace of the retired dark background', () => {
    expect(shell.toLowerCase()).not.toContain('#0b0e14');
  });

  it('uses root-absolute asset URLs so /dev/viewer can boot', () => {
    expect(viteConfig).toMatch(/\bbase: '\/'/);
    expect(viteConfig).not.toMatch(/\bbase: '\.\/'/);
  });
});
