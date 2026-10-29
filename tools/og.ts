// Build-time OG / link-preview assets and challenge pages (story E3).
//
// Pages /c/1 … /c/7 are generated at build time (Gate 1 spec, "Sharing and
// previews"): the same app as /, each with its own og:title, og:description
// and og:image tags so a pasted link looks right in WhatsApp / Messages.
// The 1200 x 630 preview image shows the heist map and the daily title —
// never a route or a solution (docs/UI-DESIGN.md, spoiler-free preview).
//
// The image is rasterized here (rects + a small bitmap font) and encoded as
// PNG with node:zlib — no new dependency, fully deterministic: the same
// levels always produce the same bytes, so the committed files under
// public/icons/ never diff after a rebuild.
//
// Displayed text comes from the i18n dictionaries (src/app/i18n) and the
// brand constants (src/app/brand.ts); the public domain comes from
// src/app/config.ts (YAP_DOMAIN).
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { YAP_CORP } from '../src/app/brand';
import { YAP_DOMAIN } from '../src/app/config';
import { YAP_WEEK_DAYS } from '../src/app/daily';
import { en } from '../src/app/i18n/en';
import { YAP_PALETTE } from '../src/game/board';
import type { YapLevel } from '../src/core/level';
import { createInitialState } from '../src/core/sim';
import { loadLevelEntries, YAP_LEVEL_DIRS, type YapLevelEntry } from './compile-levels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Social preview size (docs/UI-DESIGN.md): 1200 x 630. */
export const YAP_OG_WIDTH = 1200;
export const YAP_OG_HEIGHT = 630;
/** Where the generated previews live (copied to dist/ by Vite). */
export const YAP_OG_ICONS_DIR = 'public/icons';
/** Challenge preview file name prefix: og-c-1.png … og-c-7.png. */
export const YAP_OG_IMAGE_PREFIX = 'og-c-';
/** Preview of the root page (the local daily heist). */
export const YAP_OG_DEFAULT_IMAGE = 'og-default.png';
/** Public route of a challenge day: /c/<day>. */
export function yapChallengePath(day: number): string {
  return `/c/${day}`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** '#D99B32' -> [0xd9, 0x9b, 0x32]. */
export function yapHexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Interpolates `{placeholder}` tokens, like YapI18n.t (src/app/i18n). */
export function yapInterpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
  );
}

/** Absolute public URL of a site asset (og:image must be absolute). */
export function yapSiteUrl(path: string): string {
  return `https://${YAP_DOMAIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Public URL of the challenge page of a day. */
export function yapChallengePageUrl(day: number): string {
  return yapSiteUrl(yapChallengePath(day));
}

/** Public URL of a generated preview image. */
export function yapOgImageUrl(day: number): string {
  return yapSiteUrl(`/icons/${YAP_OG_IMAGE_PREFIX}${day}.png`);
}

/** Title baked into the challenge preview: "Daily heist #N" (en dictionary). */
export function yapOgChallengeTitle(day: number): string {
  return yapInterpolate(en.home.dailyHeist, { day });
}

// ---------------------------------------------------------------------------
// Levels: which map goes on /c/<day>
// ---------------------------------------------------------------------------

/**
 * The heist of a challenge day: `daily/d<day>` when the content is shipped
 * (story F3), otherwise the first daily level, otherwise the tutorial — so
 * the build always has a spoiler-free map to draw while levels/daily is empty.
 */
export function yapLevelForDay(entries: readonly YapLevelEntry[], day: number): YapLevel {
  const byId = new Map(entries.map((e) => [e.id, e.level] as const));
  const direct = byId.get(`daily/d${day}`);
  if (direct !== undefined) return direct;
  const anyDaily = entries.find((e) => e.id.startsWith('daily/'));
  if (anyDaily !== undefined) return anyDaily.level;
  return yapTutorialLevel(entries);
}

/** The tutorial heist, used for the root page preview. */
export function yapTutorialLevel(entries: readonly YapLevelEntry[]): YapLevel {
  const t1 = entries.find((e) => e.id === 'tutorial/t1') ?? entries[0];
  if (t1 === undefined) {
    throw new Error('yap-og: no .lvl file found — cannot draw a preview map');
  }
  return t1.level;
}

/** Level entries of the repo, resolved against an absolute root. */
export function yapLoadLevelEntries(root: string): YapLevelEntry[] {
  return loadLevelEntries(YAP_LEVEL_DIRS.map((d) => join(root, d)));
}

// ---------------------------------------------------------------------------
// OG meta tags (injected into index.html and the generated /c/<day> pages)
// ---------------------------------------------------------------------------

export interface YapOgTag {
  readonly tag: 'meta';
  readonly attributes: Record<string, string>;
}

function yapMeta(attributes: Record<string, string>): YapOgTag {
  return { tag: 'meta', attributes };
}

function yapSocialTags(title: string, description: string, image: string, url: string): YapOgTag[] {
  return [
    yapMeta({ property: 'og:type', content: 'website' }),
    yapMeta({ property: 'og:site_name', content: YAP_CORP.studio }),
    yapMeta({ property: 'og:title', content: title }),
    yapMeta({ property: 'og:description', content: description }),
    yapMeta({ property: 'og:image', content: image }),
    yapMeta({ property: 'og:image:width', content: String(YAP_OG_WIDTH) }),
    yapMeta({ property: 'og:image:height', content: String(YAP_OG_HEIGHT) }),
    yapMeta({ property: 'og:url', content: url }),
    yapMeta({ name: 'twitter:card', content: 'summary_large_image' }),
    yapMeta({ name: 'twitter:title', content: title }),
    yapMeta({ name: 'twitter:description', content: description }),
    yapMeta({ name: 'twitter:image', content: image }),
  ];
}

/** OG tags of a challenge page /c/<day>: daily title + map image. */
export function yapOgTagsForDay(day: number): YapOgTag[] {
  return yapSocialTags(
    `${yapOgChallengeTitle(day)} · ${en.app.title}`,
    en.planning.grabDiamond,
    yapOgImageUrl(day),
    yapChallengePageUrl(day),
  );
}

/** OG tags of the root page (the local daily heist). */
export function yapOgTagsForRoot(): YapOgTag[] {
  return yapSocialTags(
    en.app.title,
    en.planning.grabDiamond,
    yapSiteUrl(`/icons/${YAP_OG_DEFAULT_IMAGE}`),
    yapSiteUrl('/'),
  );
}

function yapEscapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yapTagToHtml(tag: YapOgTag): string {
  const attrs = Object.entries(tag.attributes)
    .map(([k, v]) => `${k}="${yapEscapeAttr(v)}"`)
    .join(' ');
  return `<meta ${attrs} />`;
}

/** Inserts OG tags right after the <title> element of an HTML page. */
export function yapInjectOgTags(html: string, tags: readonly YapOgTag[]): string {
  const block = tags.map(yapTagToHtml).join('\n    ');
  if (!html.includes('</title>')) {
    throw new Error('yap-og: template has no </title> to anchor the OG tags');
  }
  return html.replace('</title>', `</title>\n    ${block}`);
}

// ---------------------------------------------------------------------------
// Challenge page HTML (/c/<day>/index.html, emitted at build time)
// ---------------------------------------------------------------------------

export interface YapChallengePageOptions {
  readonly day: number;
  /** Contents of index.html (the app shell every page is generated from). */
  readonly template: string;
  /** Script URL of the built app entry, relative to the page (e.g. ../assets/index-abc.js). */
  readonly scriptSrc: string;
}

const YAP_DEV_ENTRY = '<script type="module" src="/src/main.ts"></script>';

/**
 * One challenge page: the app shell with the day's OG tags and the built app
 * entry wired in (in dev, `scriptSrc` is /src/main.ts and stays as-is).
 */
export function yapChallengePageHtml(options: YapChallengePageOptions): string {
  let html = yapInjectOgTags(options.template, yapOgTagsForDay(options.day));
  if (options.template.includes(YAP_DEV_ENTRY) && options.scriptSrc !== '/src/main.ts') {
    html = html.replace(
      YAP_DEV_ENTRY,
      `<script type="module" src="${options.scriptSrc}"></script>`,
    );
  }
  if (!html.includes(`src="${options.scriptSrc}"`)) {
    throw new Error('yap-og: could not wire the app entry into the challenge page template');
  }
  return html;
}

// ---------------------------------------------------------------------------
// Bitmap font (5 x 7) — system-font look, no web font, no dependency
// ---------------------------------------------------------------------------

const YAP_FONT_ROWS = 7;
const YAP_FONT_COLS = 5;

/** 5x7 glyphs, '#' = ink. Unknown characters throw at build time. */
const YAP_FONT: Record<string, readonly string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '#': ['.###.', '#.#.#', '#.#.#', '#####', '#.#.#', '#.#.#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.....', '.##..', '.....', '.....', '.....'],
  '…': ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'],
  '°': ['.##..', '#..#.', '.##..', '.....', '.....', '.....', '.....'],
  '×': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#..#', '.#...', '###..', '.#...', '.#...', '.#...'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '####.', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.####', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '###..', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
};

// ---------------------------------------------------------------------------
// Raster canvas
// ---------------------------------------------------------------------------

type YapRgb = readonly [number, number, number];

class YapOgCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.fillRect(0, 0, width, height, [255, 255, 255]);
  }

  fillRect(x: number, y: number, w: number, h: number, [r, g, b]: YapRgb): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = 255;
      }
    }
  }

  fillCircle(cx: number, cy: number, radius: number, color: YapRgb): void {
    const r2 = radius * radius;
    for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py++) {
      for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px++) {
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) {
          const i = (py * this.width + px) * 4;
          this.data[i] = color[0];
          this.data[i + 1] = color[1];
          this.data[i + 2] = color[2];
          this.data[i + 3] = 255;
        }
      }
    }
  }

  /** Diamond (rotated square) — the loot marker. */
  fillDiamond(cx: number, cy: number, radius: number, color: YapRgb): void {
    for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py++) {
      for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px++) {
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const dx = Math.abs(px + 0.5 - cx);
        const dy = Math.abs(py + 0.5 - cy);
        if (dx + dy <= radius) {
          const i = (py * this.width + px) * 4;
          this.data[i] = color[0];
          this.data[i + 1] = color[1];
          this.data[i + 2] = color[2];
          this.data[i + 3] = 255;
        }
      }
    }
  }

  textWidth(text: string, scale: number): number {
    return text.length === 0 ? 0 : text.length * (YAP_FONT_COLS + 1) * scale - scale;
  }

  drawText(x: number, y: number, text: string, scale: number, color: YapRgb): void {
    let cx = x;
    for (const ch of text) {
      const glyph = YAP_FONT[ch];
      if (glyph === undefined) {
        throw new Error(
          `yap-og: no bitmap glyph for ${JSON.stringify(ch)} in ${JSON.stringify(text)}`,
        );
      }
      for (let row = 0; row < YAP_FONT_ROWS; row++) {
        const line = glyph[row] ?? '';
        for (let col = 0; col < YAP_FONT_COLS; col++) {
          if (line.charAt(col) === '#') {
            this.fillRect(cx + col * scale, y + row * scale, scale, scale, color);
          }
        }
      }
      cx += (YAP_FONT_COLS + 1) * scale;
    }
  }
}

// ---------------------------------------------------------------------------
// PNG encoding (node:zlib, no dependency)
// ---------------------------------------------------------------------------

const YAP_PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const YAP_CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function yapCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = YAP_CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function yapPngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, yapCrc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encodes an RGBA buffer (width * height * 4 bytes) as an 8-bit PNG. */
export function yapEncodePng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(`yap-og: expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }
  const stride = 1 + width * 4;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor with alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  const parts = [
    YAP_PNG_SIGNATURE,
    yapPngChunk('IHDR', ihdr),
    yapPngChunk('IDAT', idat),
    yapPngChunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const part of parts) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preview image rendering (1200 x 630, spoiler-free: map + title, no route)
// ---------------------------------------------------------------------------

const YAP_OG_MARGIN = 80;
const YAP_OG_CELL = 44;

function yapDrawOgBoard(canvas: YapOgCanvas, level: YapLevel, ox: number, oy: number): void {
  const cell = YAP_OG_CELL;
  const boardW = level.width * cell;
  const boardH = level.height * cell;
  // Panel behind the map.
  canvas.fillRect(
    ox - 20,
    oy - 20,
    boardW + 40,
    boardH + 40,
    yapHexToRgb(YAP_PALETTE['surface-panel']),
  );
  // Cells: walls dark slate, floor light warm gray (docs/UI-DESIGN.md tokens).
  for (let y = 0; y < level.height; y++) {
    const row = level.map[y] ?? '';
    for (let x = 0; x < level.width; x++) {
      const ch = row.charAt(x);
      const color = ch === '#' ? yapHexToRgb(YAP_PALETTE.wall) : yapHexToRgb(YAP_PALETTE.floor);
      canvas.fillRect(ox + x * cell, oy + y * cell, cell, cell, color);
    }
  }
  // Crisp cell boundaries.
  const grid = yapHexToRgb(YAP_PALETTE['grid-line']);
  for (let x = 0; x <= level.width; x++) canvas.fillRect(ox + x * cell, oy, 1, boardH, grid);
  for (let y = 0; y <= level.height; y++) canvas.fillRect(ox, oy + y * cell, boardW, 1, grid);

  const center = (c: { x: number; y: number }): [number, number] => [
    ox + c.x * cell + cell / 2,
    oy + c.y * cell + cell / 2,
  ];

  // Static level info only — never a path or a solution.
  const state = createInitialState(level);
  for (const laser of state.lasers) {
    const color = laser.active
      ? yapHexToRgb(YAP_PALETTE['danger-laser'])
      : yapHexToRgb(YAP_PALETTE['laser-off']);
    for (const c of laser.cells) {
      canvas.fillRect(
        ox + c.x * cell + cell * 0.15,
        oy + c.y * cell + cell * 0.15,
        cell * 0.7,
        cell * 0.7,
        color,
      );
    }
  }
  for (const camera of state.cameras) {
    const [cx, cy] = center(camera.at);
    canvas.fillRect(
      cx - cell * 0.25,
      cy - cell * 0.25,
      cell * 0.5,
      cell * 0.5,
      yapHexToRgb(YAP_PALETTE['path-outline']),
    );
    canvas.fillRect(
      cx - cell * 0.18,
      cy - cell * 0.18,
      cell * 0.36,
      cell * 0.36,
      yapHexToRgb(YAP_PALETTE['danger-camera']),
    );
  }
  for (const guard of state.guards) {
    const [cx, cy] = center(guard.pos);
    canvas.fillCircle(cx, cy, cell * 0.32, yapHexToRgb(YAP_PALETTE['path-outline']));
    canvas.fillCircle(cx, cy, cell * 0.24, yapHexToRgb(YAP_PALETTE['danger-guard']));
  }
  {
    const [cx, cy] = center(level.start);
    canvas.fillCircle(cx, cy, cell * 0.3, yapHexToRgb(YAP_PALETTE['text-primary']));
  }
  {
    const [cx, cy] = center(level.loot);
    canvas.fillDiamond(cx, cy, cell * 0.36, yapHexToRgb(YAP_PALETTE['objective-diamond']));
  }
  {
    const [cx, cy] = center(level.exit);
    canvas.fillRect(
      cx - cell * 0.28,
      cy - cell * 0.28,
      cell * 0.56,
      cell * 0.56,
      yapHexToRgb(YAP_PALETTE['objective-exit']),
    );
  }
}

function yapRenderOg(level: YapLevel, title: string, subtitle: string, footer: string): Uint8Array {
  const canvas = new YapOgCanvas(YAP_OG_WIDTH, YAP_OG_HEIGHT);
  canvas.fillRect(0, 0, YAP_OG_WIDTH, YAP_OG_HEIGHT, yapHexToRgb(YAP_PALETTE['surface-page']));
  // Text block on the left.
  canvas.drawText(YAP_OG_MARGIN, 140, title, 7, yapHexToRgb(YAP_PALETTE['text-primary']));
  canvas.fillRect(YAP_OG_MARGIN, 214, 120, 6, yapHexToRgb(YAP_PALETTE['action-primary']));
  canvas.drawText(YAP_OG_MARGIN, 248, subtitle, 5, yapHexToRgb(YAP_PALETTE['text-secondary']));
  canvas.drawText(YAP_OG_MARGIN, 330, footer, 3, yapHexToRgb(YAP_PALETTE['text-secondary']));
  // Map on the right, vertically centered.
  const boardW = level.width * YAP_OG_CELL;
  const boardH = level.height * YAP_OG_CELL;
  const ox = YAP_OG_WIDTH - YAP_OG_MARGIN - boardW;
  const oy = Math.round((YAP_OG_HEIGHT - boardH) / 2);
  yapDrawOgBoard(canvas, level, ox, oy);
  return yapEncodePng(YAP_OG_WIDTH, YAP_OG_HEIGHT, canvas.data);
}

/** Preview of /c/<day>: the daily title + that day's map. */
export function yapRenderChallengeOgPng(level: YapLevel, day: number): Uint8Array {
  return yapRenderOg(level, yapOgChallengeTitle(day), en.app.title, YAP_CORP.studio);
}

/** Preview of /: the game name + the tutorial map. */
export function yapRenderDefaultOgPng(level: YapLevel): Uint8Array {
  return yapRenderOg(
    level,
    en.app.title,
    YAP_CORP.studio,
    yapOgChallengeTitle(1).replace(/#\d+$/, '#…'),
  );
}

/** Renders every preview image: og-c-1…7 plus og-default. */
export function yapRenderAllOgPngs(entries: readonly YapLevelEntry[]): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (let day = 1; day <= YAP_WEEK_DAYS; day++) {
    out.set(
      `${YAP_OG_IMAGE_PREFIX}${day}.png`,
      yapRenderChallengeOgPng(yapLevelForDay(entries, day), day),
    );
  }
  out.set(YAP_OG_DEFAULT_IMAGE, yapRenderDefaultOgPng(yapTutorialLevel(entries)));
  return out;
}

/** Writes every preview image into `outDir`; returns the written paths. */
export function generateYapOgImages(outDir: string, root = process.cwd()): string[] {
  const entries = yapLoadLevelEntries(root);
  const images = yapRenderAllOgPngs(entries);
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const [name, png] of images) {
    const file = join(outDir, name);
    writeFileSync(file, png);
    written.push(file);
  }
  return written;
}

// ---------------------------------------------------------------------------
// Vite plugin: images at build time + /c/1…/c/7 pages
// ---------------------------------------------------------------------------

/**
 * Wires the challenge routes into the build:
 * - `buildStart` renders the preview images into public/icons/ (Vite then
 *   copies them to dist/icons/);
 * - `generateBundle` emits dist/c/<day>/index.html — the app shell with the
 *   day's OG tags and the built entry script — and the images themselves if
 *   the public-dir copy did not pick them up;
 * - `transformIndexHtml` adds the root OG tags to index.html (dev + build);
 * - `configureServer` serves /c/<day> in dev.
 */
export function yapChallengePagesPlugin(): Plugin {
  let root = process.cwd();
  let images: Map<string, Uint8Array> | null = null;

  const renderImages = (): Map<string, Uint8Array> => {
    if (images === null) images = yapRenderAllOgPngs(yapLoadLevelEntries(root));
    return images;
  };

  return {
    name: 'yap-challenge-pages',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      const dir = join(root, YAP_OG_ICONS_DIR);
      const rendered = renderImages();
      mkdirSync(dir, { recursive: true });
      for (const [name, png] of rendered) writeFileSync(join(dir, name), png);
      console.log(`yap-challenge-pages: ${rendered.size} preview image(s) in ${YAP_OG_ICONS_DIR}/`);
    },
    transformIndexHtml(html, ctx) {
      if (ctx.path === '/index.html' || ctx.path === '/') {
        return yapInjectOgTags(html, yapOgTagsForRoot());
      }
      return html;
    },
    generateBundle(_options, bundle) {
      const rendered = renderImages();
      // Entry chunk of the app (the chunk facaded by index.html / src/main.ts),
      // to wire the built script into the generated pages.
      let entryFile: string | null = null;
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && item.isEntry) {
          const facade = (item.facadeModuleId ?? '').replace(/\\/g, '/');
          if (facade.endsWith('index.html') || facade.endsWith('src/main.ts')) {
            entryFile = item.fileName;
          }
        }
      }
      if (entryFile === null) {
        throw new Error('yap-challenge-pages: app entry chunk (src/main.ts) not found');
      }
      const template = readFileSync(join(root, 'index.html'), 'utf8');
      for (const [name, png] of rendered) {
        const assetName = `icons/${name}`;
        if (bundle[assetName] === undefined) {
          this.emitFile({ type: 'asset', fileName: assetName, source: png });
        }
      }
      for (let day = 1; day <= YAP_WEEK_DAYS; day++) {
        const scriptSrc = posix.relative(`c/${day}`, entryFile);
        this.emitFile({
          type: 'asset',
          fileName: `c/${day}/index.html`,
          source: yapChallengePageHtml({ day, template, scriptSrc }),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        const match = /^\/c\/([1-9]\d*)\/?$/.exec(url);
        if (match === null) {
          next();
          return;
        }
        const day = Number(match[1]);
        if (day < 1 || day > YAP_WEEK_DAYS) {
          next();
          return;
        }
        const template = readFileSync(join(server.config.root, 'index.html'), 'utf8');
        const html = yapChallengePageHtml({ day, template, scriptSrc: '/src/main.ts' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
    configurePreviewServer(server) {
      // Static hosts serve /c/<day>/index.html; mirror that for /c/<day>.
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        const match = /^\/c\/([1-9]\d*)\/?$/.exec(url);
        if (match === null) {
          next();
          return;
        }
        const day = Number(match[1]);
        if (day < 1 || day > YAP_WEEK_DAYS) {
          next();
          return;
        }
        const file = join(server.config.root, 'dist', 'c', String(day), 'index.html');
        try {
          const html = readFileSync(file, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch {
          next();
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// CLI: `tsx tools/og.ts` regenerates public/icons/ by hand
// ---------------------------------------------------------------------------

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '..');
  const written = generateYapOgImages(join(repoRoot, YAP_OG_ICONS_DIR), repoRoot);
  for (const file of written) {
    console.log(`og: wrote ${file}`);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) main();
