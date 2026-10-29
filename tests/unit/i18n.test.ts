// Tests for story A3 — typed FR/EN dictionaries, language detection,
// persisted language choice and reload-free switching.
// The dictionaries themselves are the single source of displayed strings:
// the last test scans the rest of src/ for hard-coded UI copy.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
  YAP_DEFAULT_LOCALE,
  YAP_LANGUAGE_STORAGE_KEY,
  YAP_LOCALES,
  YapI18n,
  yapCreateI18n,
  yapDetectLocale,
  yapLanguageLabel,
  yapReadStoredLocale,
  yapWriteStoredLocale,
  type YapDictionary,
  type YapKey,
  type YapLocale,
  type YapStorageLike,
} from '../../src/app/i18n';
import { en } from '../../src/app/i18n/en';
import { fr } from '../../src/app/i18n/fr';
import { YAP_CORP } from '../../src/app/brand';

/** In-memory Storage stand-in (node test env has no localStorage). */
function fakeStorage(initial: Record<string, string> = {}): YapStorageLike & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? (data[key] as string) : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

/** Deep key paths of a dictionary, e.g. 'settings.title'. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix === '' ? k : `${prefix}.${k}`),
  );
}

describe('dictionaries (fr / en)', () => {
  it('exposes exactly the fr and en locales', () => {
    expect([...YAP_LOCALES]).toEqual(['fr', 'en']);
  });

  it('fr and en have exactly the same key structure', () => {
    expect(leafPaths(fr).sort()).toEqual(leafPaths(en).sort());
  });

  it('every leaf of both dictionaries is a non-empty string', () => {
    for (const dict of [fr, en] as YapDictionary[]) {
      for (const path of leafPaths(dict)) {
        const leaf = path
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], dict);
        expect(typeof leaf, path).toBe('string');
        expect((leaf as string).trim().length, path).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the displayed game name identical in both languages', () => {
    expect(en.app.title).toBe('Perfect Crime');
    expect(fr.app.title).toBe('Perfect Crime');
  });

  it('names each language in its own tongue for the settings picker', () => {
    expect(yapLanguageLabel('fr')).toBe('Français');
    expect(yapLanguageLabel('en')).toBe('English');
  });
});

describe('language detection (navigator)', () => {
  it('detects fr from fr-FR and fr-CA', () => {
    expect(yapDetectLocale({ language: 'fr-FR' })).toBe('fr');
    expect(yapDetectLocale({ languages: ['fr-CA'] })).toBe('fr');
  });

  it('detects en from en-US and en-GB', () => {
    expect(yapDetectLocale({ language: 'en-US' })).toBe('en');
    expect(yapDetectLocale({ languages: ['en-GB', 'fr-FR'] })).toBe('en');
  });

  it('honours the priority order of navigator.languages', () => {
    expect(yapDetectLocale({ languages: ['fr-FR', 'en-US'] })).toBe('fr');
    expect(yapDetectLocale({ languages: ['de-DE', 'en-US'] })).toBe('en');
  });

  it('falls back to the default locale when nothing matches', () => {
    expect(yapDetectLocale({ language: 'de-DE' })).toBe(YAP_DEFAULT_LOCALE);
    expect(yapDetectLocale({ languages: [] })).toBe(YAP_DEFAULT_LOCALE);
    expect(yapDetectLocale({})).toBe(YAP_DEFAULT_LOCALE);
    // No argument: falls back to the real global navigator (present in Node
    // and browsers), so the result is a shipped locale either way.
    expect(YAP_LOCALES).toContain(yapDetectLocale(undefined));
  });

  it('accepts underscore-separated tags too', () => {
    expect(yapDetectLocale({ language: 'fr_FR' })).toBe('fr');
  });
});

describe('persisted language choice', () => {
  it('stores the choice under the yapcorp: storage prefix', () => {
    expect(YAP_LANGUAGE_STORAGE_KEY.startsWith(YAP_CORP.storagePrefix)).toBe(true);
    expect(YAP_LANGUAGE_STORAGE_KEY).toBe('yapcorp:lang');
  });

  it('round-trips a stored locale through storage', () => {
    const storage = fakeStorage();
    yapWriteStoredLocale('en', storage);
    expect(storage.data[YAP_LANGUAGE_STORAGE_KEY]).toBe('en');
    expect(yapReadStoredLocale(storage)).toBe('en');
  });

  it('returns null when nothing valid is stored', () => {
    expect(yapReadStoredLocale(fakeStorage())).toBeNull();
    expect(yapReadStoredLocale(fakeStorage({ [YAP_LANGUAGE_STORAGE_KEY]: 'de' }))).toBeNull();
    expect(yapReadStoredLocale(null)).toBeNull();
  });

  it('never crashes on a throwing storage (private browsing)', () => {
    const hostile: YapStorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(yapReadStoredLocale(hostile)).toBeNull();
    expect(() => yapWriteStoredLocale('fr', hostile)).not.toThrow();
  });
});

describe('YapI18n store', () => {
  it('prefers the stored choice over detection', () => {
    const storage = fakeStorage({ [YAP_LANGUAGE_STORAGE_KEY]: 'en' });
    const i18n = yapCreateI18n({ storage, navigator: { language: 'fr-FR' } });
    expect(i18n.getLocale()).toBe('en');
  });

  it('falls back to navigator detection when nothing is stored', () => {
    const i18n = yapCreateI18n({ storage: fakeStorage(), navigator: { language: 'fr-FR' } });
    expect(i18n.getLocale()).toBe('fr');
  });

  it('falls back to the default locale with no storage and no navigator', () => {
    const i18n = yapCreateI18n({ storage: null, navigator: {} });
    expect(i18n.getLocale()).toBe(YAP_DEFAULT_LOCALE);
  });

  it('switches language without reload: t() changes immediately', () => {
    const i18n = new YapI18n('fr', null);
    expect(i18n.t('settings.title')).toBe('Réglages');
    i18n.setLocale('en');
    expect(i18n.t('settings.title')).toBe('Settings');
    expect(i18n.getLocale()).toBe('en');
    i18n.setLocale('fr');
    expect(i18n.t('settings.title')).toBe('Réglages');
  });

  it('notifies subscribers on switch and persists the choice', () => {
    const storage = fakeStorage();
    const i18n = new YapI18n('fr', storage);
    const seen: YapLocale[] = [];
    const off = i18n.onChange((locale) => seen.push(locale));
    i18n.setLocale('en');
    expect(seen).toEqual(['en']);
    expect(yapReadStoredLocale(storage)).toBe('en');
    off();
    i18n.setLocale('fr');
    expect(seen).toEqual(['en']);
  });

  it('does not notify when the locale is unchanged', () => {
    const i18n = new YapI18n('fr', null);
    let calls = 0;
    i18n.onChange(() => {
      calls += 1;
    });
    i18n.setLocale('fr');
    expect(calls).toBe(0);
  });

  it('interpolates {params} in both languages', () => {
    const i18n = new YapI18n('en', null);
    expect(i18n.t('home.dailyHeist', { day: 3 })).toBe('Daily heist #3');
    i18n.setLocale('fr');
    expect(i18n.t('home.dailyHeist', { day: 3 })).toBe('Casse du jour n°3');
    expect(i18n.t('challenge.anonymous', { day: 3, attempts: 2, ticks: 38 })).toBe(
      'Un ami a réussi la casse n°3 en 2 essais · 38 ticks. À toi.',
    );
    i18n.setLocale('en');
    expect(i18n.t('challenge.anonymous', { day: 3, attempts: 2, ticks: 38 })).toBe(
      'A friend cleared heist #3 in 2 attempts · 38 ticks. Your turn.',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    const i18n = new YapI18n('en', null);
    expect(i18n.t('home.dailyHeist')).toBe('Daily heist #{day}');
  });

  it('throws on an unknown key at runtime', () => {
    const i18n = new YapI18n('en', null);
    expect(() => i18n.t('nope.nope' as YapKey)).toThrow(/nope\.nope/);
  });

  it('rejects unknown keys at compile time', () => {
    const i18n = new YapI18n('en', null);
    // @ts-expect-error — a key outside YapKey must not compile
    expect(() => i18n.t('settings.nope')).toThrow();
  });

  it('resolves every key of the dictionary in both locales', () => {
    const paths = leafPaths(en) as YapKey[];
    expect(paths.length).toBeGreaterThan(20);
    for (const locale of YAP_LOCALES) {
      const i18n = new YapI18n(locale, null);
      for (const path of paths) {
        expect(i18n.t(path).trim().length, `${locale}:${path}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('no hard-coded UI strings outside the dictionaries', () => {
  // Displayed text may only live in src/app/i18n/. This guard scans the
  // UI-bearing source — the Phaser scenes (src/game) and the app modules
  // (src/app) — for string literals that look like player-facing copy:
  // multi-word phrases, Capitalized words ("Share") or ALL-CAPS words
  // ("PLAY"). Technical literals — scene keys ('yap-boot'), colours
  // ('#0b0e14'), event names ('yap.win'), storage prefixes — are
  // lowercase/kebab/hex and never match. src/core is NOT scanned: it renders
  // nothing, its parser errors are developer/CI-facing diagnostics, and the
  // UI maps failure causes to dictionary keys. src/app/i18n (the
  // dictionaries) and src/app/brand.ts (brand constants, not UI copy —
  // docs/NAMING.md) are excluded, as is the boot file src/main.ts whose
  // Phaser config title is never rendered.
  const SRC_ROOT = new URL('../../src/', import.meta.url);
  const SCAN_DIRS = ['game', 'app'];
  const SKIP_DIRS = new Set(['i18n']);
  const SKIP_FILES = new Set(['brand.ts']);

  function listSources(dir: URL): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) out.push(...listSources(child));
      } else if (entry.name.endsWith('.ts') && !SKIP_FILES.has(entry.name)) {
        out.push(child.pathname);
      }
    }
    return out;
  }

  function allSources(): string[] {
    const out: string[] = [];
    for (const dir of SCAN_DIRS) {
      const url = new URL(`${dir}/`, SRC_ROOT);
      try {
        out.push(...listSources(url));
      } catch {
        // directory not created yet (e.g. src/game before Epic C)
      }
    }
    return out;
  }

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:`'"])\/\/[^\n]*/g, '$1');
  }

  function uiLikeLiterals(source: string): string[] {
    const found: string[] = [];
    const literal = /'([^'\\\n]|\\.)*'|"([^"\\\n]|\\.)*"|`([^`\\]|\\.)*`/g;
    for (const match of stripComments(source).matchAll(literal)) {
      const raw = match[0];
      const text = raw.slice(1, -1);
      if (!/[A-Za-z]/.test(text)) continue;
      const looksLikeCopy =
        /[A-Za-z]\s+[A-Za-z]/.test(text) || /^[A-Z][a-z]+$/.test(text) || /^[A-Z]{3,}$/.test(text);
      if (looksLikeCopy) found.push(`${raw} (${text})`);
    }
    return found;
  }

  it('finds no UI-like string literal outside src/app/i18n', () => {
    const offenders: string[] = [];
    for (const file of allSources()) {
      const rel = file.replace(SRC_ROOT.pathname, 'src/');
      for (const literal of uiLikeLiterals(readFileSync(file, 'utf8'))) {
        offenders.push(`${rel}: ${literal}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the guard itself actually detects hard-coded copy', () => {
    const probe =
      "const label = 'Grab the diamond, then get out';\n// 'Share' in a comment\nconst b = 'PLAY';\nconst c = 'Copied';\nconst key = 'yap-boot';\nconst color = '#0b0e14';\n";
    const found = uiLikeLiterals(probe);
    expect(found.some((f) => f.includes('Grab the diamond'))).toBe(true);
    expect(found.some((f) => f.includes('PLAY'))).toBe(true);
    expect(found.some((f) => f.includes('Copied'))).toBe(true);
    expect(found.some((f) => f.includes('yap-boot'))).toBe(false);
    expect(found.some((f) => f.includes('#0b0e14'))).toBe(false);
    expect(found.some((f) => f.includes('Share'))).toBe(false); // comment stripped
  });
});
