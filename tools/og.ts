// Build-time OG / link-preview assets and challenge pages (story E3).
//
// Pages /c/1 … /c/7 are generated at build time (Gate 1 spec, "Sharing and
// previews"): the same app as /, each with its own og:title, og:description
// and og:image tags so a pasted link looks right in WhatsApp / Messages.
// The 1200 x 630 preview image is a sheet of the plan style (plan style
// 6/6): the paper page, the tagline and the daily title in typewriter
// capitals, and the heist as a plan drawn with the game's own geometry —
// never a route, a cone or a solution (docs/UI-DESIGN.md, spoiler-free).
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
import {
  YAP_INK_SOFT_ALPHA,
  YAP_PALETTE,
  yapCellCenter,
  yapCellRect,
  yapDirVector,
  yapLevelLayout,
  yapMixHex,
  type YapBoardLayout,
  type YapPoint,
} from '../src/game/board';
import {
  yapCameraAnchor,
  yapDashes,
  yapDoorSide,
  yapFloorSeams,
  yapLaserBeam,
  yapWallEdges,
  type YapSegment,
} from '../src/game/plan-geometry';
import type { YapCell, YapLevel } from '../src/core/level';
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
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
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

  /** Fills a rect pixel by pixel with `paint(x, y, current)` (current = the pixel there now). */
  fillPixels(
    x: number,
    y: number,
    w: number,
    h: number,
    paint: (px: number, py: number, current: YapRgb) => YapRgb,
  ): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        const current: YapRgb = [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0];
        const [r, g, b] = paint(px, py, current);
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = 255;
      }
    }
  }

  /** A rect outline `width` px thick, inside the rect. */
  strokeRect(x: number, y: number, w: number, h: number, width: number, color: YapRgb): void {
    this.fillRect(x, y, w, width, color);
    this.fillRect(x, y + h - width, w, width, color);
    this.fillRect(x, y, width, h, color);
    this.fillRect(x + w - width, y, width, h, color);
  }

  /** A ring of `radius`, `width` px thick; with `dashes`, that many dashes around it. */
  strokeCircle(
    cx: number,
    cy: number,
    radius: number,
    width: number,
    color: YapRgb,
    dashes = 0,
  ): void {
    const outer = radius + width / 2;
    this.fillPixels(cx - outer, cy - outer, 2 * outer, 2 * outer, (px, py, current) => {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (Math.abs(Math.hypot(dx, dy) - radius) > width / 2) return current;
      if (dashes > 0) {
        const turn = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        if (Math.floor(turn * dashes * 2) % 2 === 1) return current;
      }
      return color;
    });
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
/** The thin wall frame of the preview's plan, in px (the game's is 10 at 59 px cells). */
const YAP_OG_FRAME = 12;
/** The box the plan is fitted into, on the right of the preview. */
const YAP_OG_BOARD_BOX_W = 360;
const YAP_OG_BOARD_BOX_H = 510;

/** The colour of `top` laid over `bottom` at `alpha`, as RGB. */
function yapOgMix(top: string, bottom: string, alpha: number): YapRgb {
  return yapHexToRgb(yapMixHex(top, bottom, alpha));
}

/**
 * The plan's layout on the preview: the game's own geometry (yapLevelLayout,
 * thin wall frame included), fitted into the right-hand box and centred
 * vertically.
 */
export function yapOgBoardLayout(level: YapLevel): YapBoardLayout {
  const fitted = yapLevelLayout(
    YAP_OG_BOARD_BOX_W,
    YAP_OG_BOARD_BOX_H,
    level,
    0,
    0,
    YAP_OG_FRAME,
    0,
  );
  return {
    ...fitted,
    originX: YAP_OG_WIDTH - YAP_OG_MARGIN - fitted.boardWidth,
    originY: Math.round((YAP_OG_HEIGHT - fitted.boardHeight) / 2),
  };
}

/** A horizontal or vertical segment as a `width` px band. */
function yapOgSegment(canvas: YapOgCanvas, s: YapSegment, width: number, color: YapRgb): void {
  const x = Math.min(s.x1, s.x2);
  const y = Math.min(s.y1, s.y2);
  if (s.x1 === s.x2) canvas.fillRect(x - width / 2, y, width, Math.abs(s.y2 - s.y1), color);
  else canvas.fillRect(x, y - width / 2, Math.abs(s.x2 - s.x1), width, color);
}

/**
 * The heist as a plan sheet (plan style 6/6, spec §7): paper floor, an
 * ink-soft grid between floor cells, hatched walls with an ink edge where
 * floor meets wall, the double ink frame, the start, the diamond, the door,
 * and the threats at tick 0 as their tokens — never a route or a cone.
 */
function yapDrawOgBoard(canvas: YapOgCanvas, level: YapLevel, layout: YapBoardLayout): void {
  const ink = yapHexToRgb(YAP_PALETTE.ink);
  const paper = yapHexToRgb(YAP_PALETTE.paper);
  const hatch = yapHexToRgb(YAP_PALETTE['hatch-ground']);
  // cells: paper floors; walls in hatch-ground with 45° ink hatching
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const r = yapCellRect(layout, { x, y });
      if ((level.map[y]?.charAt(x) ?? '#') !== '#') {
        canvas.fillRect(r.x, r.y, r.w, r.h, paper);
        continue;
      }
      canvas.fillPixels(r.x, r.y, r.w, r.h, (px, py) => ((px + py) % 9 < 1.6 ? ink : hatch));
    }
  }
  const soft = yapOgMix(YAP_PALETTE.ink, YAP_PALETTE.paper, YAP_INK_SOFT_ALPHA);
  for (const s of yapFloorSeams(level, layout)) yapOgSegment(canvas, s, 1, soft);
  for (const s of yapWallEdges(level, layout)) yapOgSegment(canvas, s, 2, ink);
  // the double ink frame: 2 px on the edge, 1 px inside it
  const { originX: bx, originY: by, boardWidth: bw, boardHeight: bh } = layout;
  canvas.strokeRect(bx, by, bw, bh, 2, ink);
  canvas.strokeRect(bx + 4, by + 4, bw - 8, bh - 8, 1, ink);

  const cell = layout.cell;
  const centre = (c: YapCell): YapPoint => yapCellCenter(layout, c);
  // static level info only — never a path or a solution
  const state = createInitialState(level);
  for (const laser of state.lasers) {
    const beam = yapLaserBeam(level, layout, laser.cells);
    if (laser.active) {
      const red = yapHexToRgb(YAP_PALETTE.stamp);
      yapOgSegment(
        canvas,
        { x1: beam.from.x, y1: beam.from.y, x2: beam.to.x, y2: beam.to.y },
        3,
        red,
      );
      for (const end of [beam.from, beam.to]) canvas.fillRect(end.x - 3, end.y - 3, 6, 6, red);
    } else {
      for (const s of yapDashes(beam.from, beam.to, 5, 5)) {
        yapOgSegment(canvas, s, 2, yapHexToRgb(YAP_PALETTE['laser-off']));
      }
    }
  }
  for (const camera of state.cameras) {
    const { box, lens } = yapCameraAnchor(layout, camera.at, camera.facing);
    canvas.fillRect(box.x, box.y, box.w, box.h, paper);
    canvas.strokeRect(box.x, box.y, box.w, box.h, 2, ink);
    canvas.fillCircle(lens.x, lens.y, cell * 0.09, yapHexToRgb(YAP_PALETTE['camera-cone']));
  }
  for (const guard of state.guards) {
    const p = centre(guard.pos);
    const tokenInk = yapHexToRgb(YAP_PALETTE['guard-token-ink']);
    canvas.fillCircle(p.x, p.y, cell * 0.3, tokenInk);
    canvas.fillCircle(p.x, p.y, cell * 0.3 - 2, yapHexToRgb(YAP_PALETTE['guard-token']));
    const g = 'G';
    canvas.drawText(p.x - canvas.textWidth(g, 2) / 2, p.y - 7, g, 2, tokenInk);
  }
  {
    // the start: a dashed ink-muted ring
    const p = centre(level.start);
    canvas.strokeCircle(p.x, p.y, cell * 0.42, 1.5, yapHexToRgb(YAP_PALETTE['ink-muted']), 12);
  }
  {
    // the diamond: an outlined gem
    const p = centre(level.loot);
    const r = cell * 0.27;
    canvas.fillDiamond(p.x, p.y, r, yapHexToRgb(YAP_PALETTE['diamond-edge']));
    canvas.fillDiamond(p.x, p.y, r - 2.5, yapHexToRgb(YAP_PALETTE['diamond-fill']));
    canvas.fillRect(
      p.x - r * 0.62,
      p.y - r * 0.3,
      r * 1.24,
      1,
      yapHexToRgb(YAP_PALETTE['diamond-edge']),
    );
  }
  {
    // the exit: the door's quarter swing, tinted, its leaf and its threshold
    const r = yapCellRect(layout, level.exit);
    const side = yapDoorSide(level, level.exit);
    const span = side === 'E' || side === 'W' ? r.h : r.w;
    const leaf = span * 0.55;
    const along = side === 'E' || side === 'W' ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const d = yapDirVector(side);
    const start =
      side === 'E'
        ? { x: r.x + r.w, y: r.y }
        : side === 'S'
          ? { x: r.x, y: r.y + r.h }
          : { x: r.x, y: r.y };
    const hinge = { x: start.x + along.x * span * 0.4, y: start.y + along.y * span * 0.4 };
    const into = { x: -d.x, y: -d.y };
    const green = yapHexToRgb(YAP_PALETTE['exit-door']);
    const tint = yapOgMix(YAP_PALETTE['exit-door'], YAP_PALETTE.paper, 0.12);
    canvas.fillPixels(hinge.x - leaf, hinge.y - leaf, 2 * leaf, 2 * leaf, (px, py, under) => {
      const vx = px + 0.5 - hinge.x;
      const vy = py + 0.5 - hinge.y;
      const dist = Math.hypot(vx, vy);
      // inside the quarter between the open leaf (into) and the frame (along)
      if (dist > leaf || vx * into.x + vy * into.y < 0 || vx * along.x + vy * along.y < 0)
        return under;
      return dist > leaf - 1.5 ? green : tint;
    });
    yapOgSegment(
      canvas,
      { x1: hinge.x, y1: hinge.y, x2: hinge.x + into.x * leaf, y2: hinge.y + into.y * leaf },
      3,
      green,
    );
    for (const s of yapDashes(
      hinge,
      { x: hinge.x + along.x * leaf, y: hinge.y + along.y * leaf },
      3,
      3,
    )) {
      yapOgSegment(canvas, s, 2, green);
    }
  }
}

/**
 * The preview's pixels (plan style 6/6): the paper page with its 20 px ink
 * grid, a typewriter block on the left — kicker, title over a double ink
 * rule, subtitle, footer — and the heist as a plan on the right.
 */
export function yapRenderOgPixels(
  level: YapLevel,
  title: string,
  subtitle: string,
  footer: string,
): Uint8ClampedArray {
  const canvas = new YapOgCanvas(YAP_OG_WIDTH, YAP_OG_HEIGHT);
  const page = yapHexToRgb(YAP_PALETTE['paper-page']);
  const grid = yapOgMix(YAP_PALETTE.ink, YAP_PALETTE['paper-page'], 0.05);
  canvas.fillPixels(0, 0, YAP_OG_WIDTH, YAP_OG_HEIGHT, (px, py) =>
    px % 20 === 0 || py % 20 === 0 ? grid : page,
  );
  const ink = yapHexToRgb(YAP_PALETTE.ink);
  const muted = yapHexToRgb(YAP_PALETTE['ink-muted']);
  // the kicker: Home's tagline, in typewriter capitals
  canvas.drawText(YAP_OG_MARGIN, 128, en.home.tagline.toUpperCase(), 3, muted);
  canvas.drawText(YAP_OG_MARGIN, 170, title, 7, ink);
  canvas.fillRect(YAP_OG_MARGIN, 236, 360, 3, ink);
  canvas.fillRect(YAP_OG_MARGIN, 243, 360, 1, ink);
  canvas.drawText(YAP_OG_MARGIN, 272, subtitle, 5, ink);
  if (footer !== '') canvas.drawText(YAP_OG_MARGIN, 340, footer, 3, muted);
  yapDrawOgBoard(canvas, level, yapOgBoardLayout(level));
  return canvas.data;
}

function yapRenderOg(level: YapLevel, title: string, subtitle: string, footer: string): Uint8Array {
  return yapEncodePng(
    YAP_OG_WIDTH,
    YAP_OG_HEIGHT,
    yapRenderOgPixels(level, title, subtitle, footer),
  );
}

/** Preview of /c/<day>: the daily title + that day's map. */
export function yapRenderChallengeOgPng(level: YapLevel, day: number): Uint8Array {
  // the kicker already names the studio: no footer
  return yapRenderOg(level, yapOgChallengeTitle(day), en.app.title, '');
}

/** Preview of /: the game name + the tutorial map. */
export function yapRenderDefaultOgPng(level: YapLevel): Uint8Array {
  // the kicker already names the studio: the subtitle says what to expect
  return yapRenderOg(level, en.app.title, yapOgChallengeTitle(1).replace(/#\d+$/, '#…'), '');
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
