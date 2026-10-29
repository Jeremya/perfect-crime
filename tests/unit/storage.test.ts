// Unit tests for story A2: safe storage wrapper (private browsing), typed
// config, anonymous ID, URL flags (?flag=ghost:0) and internal marker
// (?internal=1), all persisted under the `yapcorp:` prefix.
import { describe, expect, it } from 'vitest';
import { YAP_CORP } from '../../src/app/brand';
import {
  YAP_DEFAULT_FLAGS,
  YAP_DOMAIN,
  YAP_PROFILE_KEY,
  YAP_TEST_START_DATE,
  createAnonId,
  loadYapConfig,
  loadYapProfile,
  parseFlagsFromSearch,
  parseInternalFromSearch,
} from '../../src/app/config';
import { YapStorage, type YapStorageBackend } from '../../src/app/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_KEY = `${YAP_CORP.storagePrefix}${YAP_PROFILE_KEY}`;

/** In-memory backend that behaves like a healthy localStorage. */
class FakeBackend implements YapStorageBackend {
  readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

/** Backend that throws on every access, like localStorage in private browsing. */
class ThrowingBackend implements YapStorageBackend {
  getItem(_key: string): string | null {
    throw new Error('SecurityError: access denied');
  }
  setItem(_key: string, _value: string): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(_key: string): void {
    throw new Error('SecurityError: access denied');
  }
}

/** Old Safari private mode: reads work, writes throw. */
class WriteThrowingBackend extends FakeBackend {
  override setItem(_key: string, _value: string): void {
    throw new Error('QuotaExceededError');
  }
}

describe('YapStorage', () => {
  it('prefixes every key with the yapcorp: prefix', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    expect(storage.key('profile')).toBe(`${YAP_CORP.storagePrefix}profile`);
    storage.set('foo', 'bar');
    expect(backend.entries.get(`${YAP_CORP.storagePrefix}foo`)).toBe('bar');
    expect(storage.get('foo')).toBe('bar');
  });

  it('round-trips set/get/remove on a healthy backend', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    expect(storage.persistent).toBe(true);
    storage.set('a', '1');
    storage.set('b', '2');
    expect(storage.get('a')).toBe('1');
    storage.remove('a');
    expect(storage.get('a')).toBeNull();
    expect(backend.entries.has(`${YAP_CORP.storagePrefix}a`)).toBe(false);
    expect(storage.get('b')).toBe('2');
  });

  it('never crashes when the backend throws (private browsing) and keeps a session copy', () => {
    const storage = new YapStorage(new ThrowingBackend());
    expect(storage.persistent).toBe(false);
    expect(() => {
      storage.set('a', '1');
      storage.remove('b');
    }).not.toThrow();
    expect(storage.get('a')).toBe('1');
    storage.remove('a');
    expect(storage.get('a')).toBeNull();
  });

  it('falls back to memory when writes throw but reads work', () => {
    const storage = new YapStorage(new WriteThrowingBackend());
    expect(() => storage.set('a', '1')).not.toThrow();
    expect(storage.get('a')).toBe('1');
  });

  it('works with no backend at all (null forces the memory fallback)', () => {
    const storage = new YapStorage(null);
    expect(storage.persistent).toBe(false);
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
  });

  it('can be constructed with no arguments without crashing', () => {
    const storage = new YapStorage();
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
  });

  it('getJson returns the fallback for missing or corrupted values', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    expect(storage.getJson('missing', { ok: true })).toEqual({ ok: true });
    backend.entries.set(`${YAP_CORP.storagePrefix}broken`, '{not json');
    expect(storage.getJson('broken', { ok: true })).toEqual({ ok: true });
  });

  it('setJson/getJson round-trip objects', () => {
    const storage = new YapStorage(new FakeBackend());
    storage.setJson('obj', { ghost: false, n: 3 });
    expect(storage.getJson('obj', {})).toEqual({ ghost: false, n: 3 });
  });

  it('setJson never throws, even on circular structures', () => {
    const storage = new YapStorage(new FakeBackend());
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => storage.setJson('circular', circular)).not.toThrow();
    expect(storage.get('circular')).toBeNull();
  });
});

describe('URL flags parsing', () => {
  it('parses ?flag=ghost:0 and ?flag=ghost:1', () => {
    expect(parseFlagsFromSearch('?flag=ghost:0')).toEqual({ ghost: false });
    expect(parseFlagsFromSearch('?flag=ghost:1')).toEqual({ ghost: true });
    expect(parseFlagsFromSearch('flag=ghost:0')).toEqual({ ghost: false });
  });

  it('supports repeated and comma-separated flag params, last one wins', () => {
    expect(parseFlagsFromSearch('?flag=ghost:0&flag=ghost:1')).toEqual({ ghost: true });
    expect(parseFlagsFromSearch('?flag=ghost:0,unknown:1')).toEqual({ ghost: false });
  });

  it('ignores unknown flags and malformed values', () => {
    expect(parseFlagsFromSearch('?flag=hax:1')).toEqual({});
    expect(parseFlagsFromSearch('?flag=ghost:2')).toEqual({});
    expect(parseFlagsFromSearch('?flag=ghost')).toEqual({});
    expect(parseFlagsFromSearch('?flag=:1')).toEqual({});
    expect(parseFlagsFromSearch('')).toEqual({});
    expect(parseFlagsFromSearch('?src=discord')).toEqual({});
  });

  it('parses the internal marker only for internal=1', () => {
    expect(parseInternalFromSearch('?internal=1')).toBe(true);
    expect(parseInternalFromSearch('?internal=0')).toBe(false);
    expect(parseInternalFromSearch('?internal=yes')).toBe(false);
    expect(parseInternalFromSearch('')).toBe(false);
  });
});

describe('profile, anonymous ID and config', () => {
  it('creates a UUID anonId on first run and persists the profile under yapcorp:profile', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    const profile = loadYapProfile(storage);
    expect(profile.schema).toBe(1);
    expect(UUID_RE.test(profile.anonId)).toBe(true);
    expect(profile.internal).toBe(false);
    expect(profile.flags).toEqual(YAP_DEFAULT_FLAGS);
    expect(backend.entries.has(PROFILE_KEY)).toBe(true);
    const stored = JSON.parse(backend.entries.get(PROFILE_KEY) ?? '') as { anonId: string };
    expect(stored.anonId).toBe(profile.anonId);
  });

  it('keeps the same anonId across loads', () => {
    const storage = new YapStorage(new FakeBackend());
    const first = loadYapProfile(storage);
    const second = loadYapProfile(storage);
    expect(second.anonId).toBe(first.anonId);
  });

  it('remembers ?flag=ghost:0 and ?internal=1 on the next visit without the URL params', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    const first = loadYapProfile(storage, '?flag=ghost:0&internal=1');
    expect(first.flags.ghost).toBe(false);
    expect(first.internal).toBe(true);
    const second = loadYapProfile(storage, '');
    expect(second.flags.ghost).toBe(false);
    expect(second.internal).toBe(true);
    expect(second.anonId).toBe(first.anonId);
  });

  it('?flag=ghost:1 forces the flag back on and is remembered too', () => {
    const storage = new YapStorage(new FakeBackend());
    loadYapProfile(storage, '?flag=ghost:0');
    const profile = loadYapProfile(storage, '?flag=ghost:1');
    expect(profile.flags.ghost).toBe(true);
    expect(loadYapProfile(storage, '').flags.ghost).toBe(true);
  });

  it('ignores unknown URL flags and does not persist them', () => {
    const storage = new YapStorage(new FakeBackend());
    const profile = loadYapProfile(storage, '?flag=hax:1');
    expect(profile.flags).toEqual({ ghost: true });
    expect('hax' in profile.flags).toBe(false);
  });

  it('recovers from a corrupted stored profile', () => {
    const backend = new FakeBackend();
    backend.entries.set(PROFILE_KEY, '{not json');
    const storage = new YapStorage(backend);
    const profile = loadYapProfile(storage, '');
    expect(profile.flags).toEqual(YAP_DEFAULT_FLAGS);
    expect(UUID_RE.test(profile.anonId)).toBe(true);
  });

  it('discards a stored profile with an old schema', () => {
    const backend = new FakeBackend();
    backend.entries.set(
      PROFILE_KEY,
      JSON.stringify({
        schema: 999,
        anonId: 'not-a-uuid',
        internal: true,
        flags: { ghost: false },
      }),
    );
    const storage = new YapStorage(backend);
    const profile = loadYapProfile(storage, '');
    expect(profile.internal).toBe(false);
    expect(profile.flags.ghost).toBe(true);
    expect(UUID_RE.test(profile.anonId)).toBe(true);
  });

  it('loadYapConfig exposes start date, domain, flags, internal marker and anonId', () => {
    const storage = new YapStorage(new FakeBackend());
    const config = loadYapConfig(storage, '?flag=ghost:0&internal=1');
    expect(config.startDate).toBe(YAP_TEST_START_DATE);
    expect(config.domain).toBe(YAP_DOMAIN);
    expect(config.flags).toEqual({ ghost: false });
    expect(config.internal).toBe(true);
    expect(UUID_RE.test(config.anonId)).toBe(true);
  });

  it('never crashes in private browsing and still remembers flags for the session', () => {
    const storage = new YapStorage(new ThrowingBackend());
    let config: ReturnType<typeof loadYapConfig> | undefined;
    expect(() => {
      config = loadYapConfig(storage, '?flag=ghost:0&internal=1');
    }).not.toThrow();
    expect(config?.flags.ghost).toBe(false);
    expect(config?.internal).toBe(true);
    const again = loadYapConfig(storage, '');
    expect(again.flags.ghost).toBe(false);
    expect(again.internal).toBe(true);
    expect(again.anonId).toBe(config?.anonId);
  });

  it('createAnonId returns a UUID', () => {
    expect(UUID_RE.test(createAnonId())).toBe(true);
  });
});
