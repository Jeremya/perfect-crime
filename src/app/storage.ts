// Safe local storage wrapper (story A2). In private browsing — or when the
// storage quota is full — localStorage can throw on *any* access, including
// reading the `localStorage` property itself. Every operation below is
// wrapped so the game never crashes: when the persistent backend is missing
// or throws, values fall back to an in-memory map for the session.
// All keys are prefixed with YAP_CORP.storagePrefix (`yapcorp:`).
import { YAP_CORP } from './brand';

/** The subset of the Web Storage API the wrapper relies on. */
export interface YapStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Read `globalThis.localStorage` without ever throwing (it can, in sandboxed frames). */
function detectLocalStorage(): YapStorageBackend | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Probe a backend with a write+remove: some private modes accept reads but
 * throw on write. Returns false when the backend is not actually usable.
 */
function probeBackend(candidate: YapStorageBackend): boolean {
  try {
    const probe = `${YAP_CORP.storagePrefix}__probe__`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export class YapStorage {
  private readonly backend: YapStorageBackend | null;
  private readonly memory = new Map<string, string>();

  /**
   * @param backend `undefined` = auto-detect `globalThis.localStorage`,
   *   `null` = force the in-memory fallback (tests, private browsing).
   *   A backend that throws on write is probed and treated as unusable.
   */
  constructor(backend?: YapStorageBackend | null) {
    const candidate = backend === undefined ? detectLocalStorage() : backend;
    this.backend = candidate !== null && probeBackend(candidate) ? candidate : null;
  }

  /** True when a real persistent backend is in use (false in private browsing). */
  get persistent(): boolean {
    return this.backend !== null;
  }

  /** Full storage key, always under the `yapcorp:` prefix. */
  key(name: string): string {
    return `${YAP_CORP.storagePrefix}${name}`;
  }

  get(name: string): string | null {
    const key = this.key(name);
    try {
      const value = this.backend?.getItem(key);
      if (value !== null && value !== undefined) return value;
    } catch {
      // Private browsing / disabled storage: fall through to the session copy.
    }
    return this.memory.get(key) ?? null;
  }

  /** Never throws: a failing backend is mirrored into the in-memory map. */
  set(name: string, value: string): void {
    const key = this.key(name);
    this.memory.set(key, value);
    try {
      this.backend?.setItem(key, value);
    } catch {
      // Quota full or private mode: the memory copy above keeps the session working.
    }
  }

  remove(name: string): void {
    const key = this.key(name);
    this.memory.delete(key);
    try {
      this.backend?.removeItem(key);
    } catch {
      // Ignore: the session copy is already gone.
    }
  }

  /** Parses a stored JSON value; returns `fallback` when missing or corrupted. */
  getJson<T>(name: string, fallback: T): T {
    const raw = this.get(name);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /** Never throws, even on circular structures. */
  setJson(name: string, value: unknown): void {
    let raw: string;
    try {
      raw = JSON.stringify(value);
    } catch {
      return;
    }
    this.set(name, raw);
  }
}

/** Shared instance used by the app (auto-detects localStorage). */
export const yapStorage = new YapStorage();
