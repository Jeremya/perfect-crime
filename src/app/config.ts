// Typed configuration (story A2): test-week start date, public domain and the
// feature flags. A flag can be forced through the URL (`?flag=ghost:0`), is
// then remembered in the stored profile, and `?internal=1` marks internal
// testers (excluded from the analytics indicators). Everything is persisted
// under the `yapcorp:` prefix through YapStorage, which never throws — so this
// module is safe in private browsing too.
import { YapStorage } from './storage';

/** Bump when the profile shape changes; older stored profiles are discarded. */
export const YAP_PROFILE_SCHEMA = 1;
/** Profile storage key, relative — YapStorage adds the `yapcorp:` prefix. */
export const YAP_PROFILE_KEY = 'profile';

/** First day of the test week (TEST_START_DATE in the spec), ISO yyyy-mm-dd. */
export const YAP_TEST_START_DATE = '2025-11-03';
/** Public domain used to build share links (Cloudflare Pages project). */
export const YAP_DOMAIN = 'yap-corp-perfect-crime.pages.dev';

/** Feature flags. `ghost` (ghost preview while drawing) is on by default. */
export interface YapFlags {
  ghost: boolean;
}
export type YapFlagName = keyof YapFlags;

export const YAP_DEFAULT_FLAGS: YapFlags = { ghost: true };

/** Persisted player profile (spec: anonId, internal marker, flags, schema). */
export interface YapProfile {
  schema: number;
  anonId: string;
  internal: boolean;
  flags: YapFlags;
}

/** Resolved runtime configuration. */
export interface YapConfig {
  startDate: string;
  domain: string;
  anonId: string;
  internal: boolean;
  flags: YapFlags;
}

const FLAG_PARAM = /^(?<name>[a-z][a-z0-9-]*):(?<value>[01])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse `?flag=ghost:0` (repeatable, comma-separated) into known flags only.
 * `search` is the query string, with or without the leading `?`.
 */
export function parseFlagsFromSearch(search: string): Partial<YapFlags> {
  const params = new URLSearchParams(search);
  const parsed: Partial<YapFlags> = {};
  for (const raw of params.getAll('flag')) {
    for (const part of raw.split(',')) {
      const match = FLAG_PARAM.exec(part.trim());
      const name = match?.groups?.name;
      const value = match?.groups?.value;
      if (name === undefined || value === undefined) continue;
      if (!(name in YAP_DEFAULT_FLAGS)) continue;
      parsed[name as YapFlagName] = value === '1';
    }
  }
  return parsed;
}

/** `?internal=1` marks an internal tester. */
export function parseInternalFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('internal') === '1';
}

/** New anonymous ID: UUID v4 when the platform provides it. */
export function createAnonId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  // Fallback for old webviews without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Keep only known flag names with boolean values from an untrusted object. */
function sanitizeFlags(raw: unknown): Partial<YapFlags> {
  const out: Partial<YapFlags> = {};
  if (raw === null || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  for (const name of Object.keys(YAP_DEFAULT_FLAGS) as YapFlagName[]) {
    const value = record[name];
    if (typeof value === 'boolean') out[name] = value;
  }
  return out;
}

/**
 * Read the profile, apply the URL overrides (`?flag=…`, `?internal=1`) and
 * persist them so they are remembered on the next visit. Never throws, even
 * in private browsing: YapStorage falls back to memory.
 */
export function loadYapProfile(storage: YapStorage, search = ''): YapProfile {
  const raw: unknown = storage.getJson<unknown>(YAP_PROFILE_KEY, null);
  const stored: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const storedUsable = stored.schema === YAP_PROFILE_SCHEMA;
  const flags: YapFlags = {
    ...YAP_DEFAULT_FLAGS,
    ...(storedUsable ? sanitizeFlags(stored.flags) : {}),
    ...parseFlagsFromSearch(search),
  };
  const internal = parseInternalFromSearch(search) || (storedUsable && stored.internal === true);
  const storedAnonId = storedUsable && typeof stored.anonId === 'string' ? stored.anonId : '';
  const anonId = UUID_PATTERN.test(storedAnonId) ? storedAnonId : createAnonId();
  const profile: YapProfile = { schema: YAP_PROFILE_SCHEMA, anonId, internal, flags };
  storage.setJson(YAP_PROFILE_KEY, profile);
  return profile;
}

/** Anonymous ID of this device, creating and persisting it on first run. */
export function getAnonId(storage: YapStorage): string {
  return loadYapProfile(storage).anonId;
}

/** Full runtime config: constants plus the profile (flags, internal, anonId). */
export function loadYapConfig(storage: YapStorage, search = ''): YapConfig {
  const profile = loadYapProfile(storage, search);
  return {
    startDate: YAP_TEST_START_DATE,
    domain: YAP_DOMAIN,
    anonId: profile.anonId,
    internal: profile.internal,
    flags: profile.flags,
  };
}
