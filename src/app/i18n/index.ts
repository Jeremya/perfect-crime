// Story A3 — i18n for Perfect Crime (Yap Corp).
// Typed FR/EN dictionaries (./fr.ts, ./en.ts), navigator-based language
// detection, a persisted language choice (localStorage under the `yapcorp:`
// prefix) and a reactive store so the UI can switch language without a
// reload. Every displayed string lives in the dictionaries — nothing else in
// src/ may hold UI copy (guarded by tests/unit/i18n.test.ts).
import { YAP_CORP } from '../brand';
import { en } from './en';
import { fr } from './fr';
import type { YapDictionary } from './en';

export type { YapDictionary } from './en';

/** Locales shipped at Gate 1 (spec: French and English). */
export const YAP_LOCALES = ['fr', 'en'] as const;
export type YapLocale = (typeof YAP_LOCALES)[number];

/**
 * Fallback when neither the stored choice nor the navigator tells us
 * anything: the studio's language (Yap Corp is French, and the first test
 * wave is mostly French-speaking).
 */
export const YAP_DEFAULT_LOCALE: YapLocale = 'fr';

/** localStorage key of the language chosen in settings. */
export const YAP_LANGUAGE_STORAGE_KEY = `${YAP_CORP.storagePrefix}lang` as const;

const dictionaries: Record<YapLocale, YapDictionary> = { fr, en };

/** Dot-path of every leaf string in a dictionary, e.g. 'settings.title'. */
type YapLeafPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${YapLeafPaths<T[K]>}`;
    }[keyof T & string];
export type YapKey = YapLeafPaths<YapDictionary>;

/** The subset of Navigator we rely on (injectable for tests). */
export interface YapNavigatorLike {
  readonly languages?: readonly string[];
  readonly language?: string;
}

/** The subset of Storage we rely on (injectable for tests). */
export interface YapStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isYapLocale(value: string): value is YapLocale {
  return (YAP_LOCALES as readonly string[]).includes(value);
}

/**
 * Detects the UI language from the browser: first matching entry of
 * `navigator.languages`, then `navigator.language`, else the default locale.
 * Tags are normalised ('fr-FR' / 'fr_FR' → 'fr').
 */
export function yapDetectLocale(navigatorLike?: YapNavigatorLike): YapLocale {
  const nav = navigatorLike ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const candidates: readonly string[] = [
    ...(nav?.languages ?? []),
    ...(nav?.language !== undefined ? [nav.language] : []),
  ];
  for (const raw of candidates) {
    const tag = raw.toLowerCase().split(/[-_]/)[0] ?? '';
    if (tag !== '' && isYapLocale(tag)) return tag;
  }
  return YAP_DEFAULT_LOCALE;
}

function defaultStorage(): YapStorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // some browsers throw on mere access (private mode)
  }
}

/** Reads the persisted language choice, or null when absent/invalid. */
export function yapReadStoredLocale(
  storage: YapStorageLike | null = defaultStorage(),
): YapLocale | null {
  try {
    const raw = storage?.getItem(YAP_LANGUAGE_STORAGE_KEY);
    return raw !== null && raw !== undefined && isYapLocale(raw) ? raw : null;
  } catch {
    return null; // private browsing: behave as if nothing was stored
  }
}

/** Persists the language choice; never throws (private browsing). */
export function yapWriteStoredLocale(
  locale: YapLocale,
  storage: YapStorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(YAP_LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Private browsing: the choice simply lasts for the session.
  }
}

/** Display name of a locale in its own language, for the settings picker. */
export function yapLanguageLabel(locale: YapLocale): string {
  return dictionaries[locale].meta.languageName;
}

export type YapLocaleListener = (locale: YapLocale) => void;

/**
 * Reactive i18n store. `t()` always reads the current locale, so calling
 * `setLocale()` re-renders subscribed UI immediately — no reload. The choice
 * is persisted on every switch.
 */
export class YapI18n {
  private locale: YapLocale;
  private readonly listeners = new Set<YapLocaleListener>();

  constructor(
    initial: YapLocale,
    private readonly storage: YapStorageLike | null = defaultStorage(),
  ) {
    this.locale = initial;
  }

  getLocale(): YapLocale {
    return this.locale;
  }

  /** Current dictionary (e.g. to list every key in a dev screen). */
  getDictionary(): YapDictionary {
    return dictionaries[this.locale];
  }

  /**
   * Resolves a dot-path key ('settings.title') in the current locale and
   * interpolates `{placeholder}` tokens from `params`. Unknown placeholders
   * are left as-is; unknown keys throw.
   */
  t(key: YapKey, params?: Record<string, string | number>): string {
    const template = this.resolve(key);
    if (params === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
    );
  }

  /** Switches language live: updates state, persists, notifies subscribers. */
  setLocale(locale: YapLocale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    yapWriteStoredLocale(locale, this.storage);
    for (const listener of this.listeners) listener(locale);
  }

  /** Subscribes to language switches; returns the unsubscribe function. */
  onChange(listener: YapLocaleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private resolve(key: YapKey): string {
    let node: unknown = dictionaries[this.locale];
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null) break;
      node = (node as Record<string, unknown>)[part];
    }
    if (typeof node !== 'string') {
      throw new Error(`yap-i18n: unknown key "${key}" for locale "${this.locale}"`);
    }
    return node;
  }
}

export interface YapI18nOptions {
  storage?: YapStorageLike | null;
  navigator?: YapNavigatorLike;
}

/** Builds a store: stored choice → navigator detection → default locale. */
export function yapCreateI18n(options: YapI18nOptions = {}): YapI18n {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const initial = yapReadStoredLocale(storage) ?? yapDetectLocale(options.navigator);
  return new YapI18n(initial, storage);
}

/** Shared app instance. */
export const yapI18n: YapI18n = yapCreateI18n();
