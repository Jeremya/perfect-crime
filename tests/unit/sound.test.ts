// Unit tests for story C8 — minimal sounds and vibration (src/game/sound.ts).
// Settings (sound on/off, vibration on/off) remembered through the A2 storage
// and never throwing; the six cues and their files in public/sounds/; the
// event -> cue mapping (path step, UI tap, PLAY, loot pickup, detected, won);
// and the vibration guard: navigator.vibrate only where the browser has it,
// only when the setting is on, short patterns, trimmed on reduced motion.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YapStorage, type YapStorageBackend } from '../../src/app/storage';
import {
  YAP_EXECUTION_END_EVENT,
  YAP_EXECUTION_TICK_EVENT,
  YAP_PATH_STEP_EVENT,
  YAP_PLAY_EVENT,
  YAP_SOUND_CUES,
  YAP_SOUND_FILES,
  YAP_UI_TAP_EVENT,
  YapSound,
  YapSoundSettings,
  yapCueForOutcome,
  yapSoundKey,
  yapVibrate,
  yapVibrationPattern,
  type YapSoundCue,
  type YapSoundEventSource,
  type YapSoundPlayer,
  type YapVibrateTarget,
} from '../../src/game/sound';

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

/** Backend that throws on every access (private mode, disabled storage). */
class ThrowingBackend implements YapStorageBackend {
  getItem(): string | null {
    throw new Error('denied');
  }
  setItem(): void {
    throw new Error('denied');
  }
  removeItem(): void {
    throw new Error('denied');
  }
}

/** Records the keys played; `locked` mimics audio before the first gesture. */
class FakePlayer implements YapSoundPlayer {
  readonly played: string[] = [];
  locked = false;
  throws = false;
  canPlay(): boolean {
    return !this.locked;
  }
  play(key: string): void {
    if (this.throws) throw new Error('audio exploded');
    this.played.push(key);
  }
}

/** A navigator with vibrate, recording patterns (and checking `this`). */
class FakeNavigator implements YapVibrateTarget {
  readonly patterns: (number | number[])[] = [];
  vibrate(pattern: number | number[]): boolean {
    if (!(this instanceof FakeNavigator)) throw new TypeError('Illegal invocation');
    this.patterns.push(pattern);
    return true;
  }
}

/** Minimal event emitter with the on/off shape of Phaser's scene.events. */
class FakeEvents implements YapSoundEventSource {
  private readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  on(event: string, fn: (...args: unknown[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  off(event: string, fn: (...args: unknown[]) => void): this {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((h) => h !== fn),
    );
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
  count(): number {
    let n = 0;
    for (const list of this.handlers.values()) n += list.length;
    return n;
  }
}

interface YapRig {
  readonly sound: YapSound;
  readonly settings: YapSoundSettings;
  readonly player: FakePlayer;
  readonly nav: FakeNavigator;
  readonly events: FakeEvents;
  readonly clock: { now: number };
}

function rig(reducedMotion = false): YapRig {
  const settings = new YapSoundSettings(new YapStorage(new FakeBackend()));
  const player = new FakePlayer();
  const nav = new FakeNavigator();
  const events = new FakeEvents();
  const clock = { now: 1000 };
  const sound = new YapSound({
    settings,
    player,
    navigator: nav,
    reducedMotion: () => reducedMotion,
    now: () => clock.now,
  });
  sound.yapAttach(events);
  return { sound, settings, player, nav, events, clock };
}

describe('YapSoundSettings — sound and vibration, remembered', () => {
  it('defaults to sound on and vibration on', () => {
    const settings = new YapSoundSettings(new YapStorage(new FakeBackend()));
    expect(settings.yapSoundEnabled()).toBe(true);
    expect(settings.yapVibrationEnabled()).toBe(true);
  });

  it('persists both settings under yapcorp:sound and yapcorp:vibration', () => {
    const backend = new FakeBackend();
    const settings = new YapSoundSettings(new YapStorage(backend));
    settings.yapSetSoundEnabled(false);
    settings.yapSetVibrationEnabled(false);
    expect(backend.entries.get('yapcorp:sound')).toBe('off');
    expect(backend.entries.get('yapcorp:vibration')).toBe('off');
    // a later session (new storage instance on the same backend) remembers
    const again = new YapSoundSettings(new YapStorage(backend));
    expect(again.yapSoundEnabled()).toBe(false);
    expect(again.yapVibrationEnabled()).toBe(false);
    again.yapSetSoundEnabled(true);
    expect(new YapSoundSettings(new YapStorage(backend)).yapSoundEnabled()).toBe(true);
  });

  it('falls back to the defaults on corrupted values', () => {
    const backend = new FakeBackend();
    backend.entries.set('yapcorp:sound', 'banana');
    backend.entries.set('yapcorp:vibration', '');
    const settings = new YapSoundSettings(new YapStorage(backend));
    expect(settings.yapSoundEnabled()).toBe(true);
    expect(settings.yapVibrationEnabled()).toBe(true);
  });

  it('never throws when storage is unavailable, and keeps the session value', () => {
    const settings = new YapSoundSettings(new YapStorage(new ThrowingBackend()));
    expect(settings.yapSoundEnabled()).toBe(true);
    expect(() => settings.yapSetSoundEnabled(false)).not.toThrow();
    expect(settings.yapSoundEnabled()).toBe(false);
    expect(() => settings.yapSetVibrationEnabled(false)).not.toThrow();
    expect(settings.yapVibrationEnabled()).toBe(false);
  });
});

describe('the six sounds', () => {
  it('has exactly six distinct cues, each with its own file', () => {
    expect(YAP_SOUND_CUES).toHaveLength(6);
    const files = YAP_SOUND_CUES.map((c) => YAP_SOUND_FILES[c]);
    expect(new Set(files).size).toBe(6);
    expect(new Set(YAP_SOUND_CUES.map(yapSoundKey)).size).toBe(6);
    for (const cue of YAP_SOUND_CUES) expect(yapSoundKey(cue)).toMatch(/^yap-sound-/);
  });

  it('ships six small WAV files in public/sounds with a provenance README', () => {
    const publicDir = new URL('../../public/', import.meta.url);
    let total = 0;
    for (const cue of YAP_SOUND_CUES) {
      const url = YAP_SOUND_FILES[cue];
      expect(url).toMatch(/^\/sounds\/[a-z-]+\.wav$/);
      const file = new URL(url.slice(1), publicDir);
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
      const size = statSync(file).size;
      expect(size).toBeLessThan(24 * 1024);
      total += size;
    }
    // a tiny slice of the 3 MB initial-download budget
    expect(total).toBeLessThan(64 * 1024);
    expect(existsSync(new URL('sounds/README.md', publicDir))).toBe(true);
  });
});

describe('yapVibrate — safe guard around navigator.vibrate', () => {
  it('calls vibrate on the navigator itself (no illegal invocation)', () => {
    const nav = new FakeNavigator();
    expect(yapVibrate(nav, [30, 40, 30])).toBe(true);
    expect(nav.patterns).toEqual([[30, 40, 30]]);
  });

  it('is a no-op where the browser has no vibrate (iOS Safari, desktop)', () => {
    expect(yapVibrate({}, 8)).toBe(false);
    expect(yapVibrate(null, 8)).toBe(false);
    expect(yapVibrate(undefined, 8)).toBe(false);
  });

  it('swallows errors thrown by vibrate', () => {
    const nav: YapVibrateTarget = {
      vibrate: () => {
        throw new Error('blocked by permissions policy');
      },
    };
    expect(yapVibrate(nav, 8)).toBe(false);
  });
});

describe('yapVibrationPattern', () => {
  it('gives the spec 8 ms tick per new cell and short patterns elsewhere', () => {
    expect(yapVibrationPattern('step', false)).toBe(8);
    for (const cue of YAP_SOUND_CUES) {
      const p = yapVibrationPattern(cue, false);
      if (p === null) continue;
      const total = typeof p === 'number' ? p : p.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(250);
    }
    expect(yapVibrationPattern('caught', false)).not.toBeNull();
    expect(yapVibrationPattern('win', false)).not.toBeNull();
    expect(yapVibrationPattern('tap', false)).toBeNull();
    expect(yapVibrationPattern('play', false)).toBeNull();
  });

  it('keeps only the 8 ms drawing tick when reduced motion is requested', () => {
    expect(yapVibrationPattern('step', true)).toBe(8);
    for (const cue of YAP_SOUND_CUES) {
      if (cue !== 'step') expect(yapVibrationPattern(cue, true)).toBeNull();
    }
  });
});

describe('yapCueForOutcome', () => {
  it('maps won to the win sound and detected to the caught sound', () => {
    expect(yapCueForOutcome({ kind: 'won', tick: 12 })).toBe('win');
    expect(yapCueForOutcome({ kind: 'detected', cause: 'laser', by: 'L1', tick: 3 })).toBe(
      'caught',
    );
    expect(yapCueForOutcome({ kind: 'running' })).toBeNull();
    expect(yapCueForOutcome(undefined)).toBeNull();
    expect(yapCueForOutcome('won')).toBeNull();
  });
});

describe('YapSound — scene events to sounds and vibration', () => {
  const key = (cue: YapSoundCue): string => yapSoundKey(cue);

  it('path step: short sound and the 8 ms vibration', () => {
    const { player, nav, events } = rig();
    events.emit(YAP_PATH_STEP_EVENT);
    expect(player.played).toEqual([key('step')]);
    expect(nav.patterns).toEqual([8]);
  });

  it('PLAY plays its sound; the UI tap of the same press is not doubled', () => {
    const { player, events, clock } = rig();
    events.emit(YAP_PLAY_EVENT, { steps: [] });
    events.emit(YAP_UI_TAP_EVENT); // the button tap of the same press
    expect(player.played).toEqual([key('play')]);
    clock.now += 500;
    events.emit(YAP_UI_TAP_EVENT); // a later button press (Stop)
    expect(player.played).toEqual([key('play'), key('tap')]);
  });

  it('loot pickup: once, on the tick the diamond is taken; reset by a new PLAY', () => {
    const { player, events, clock } = rig();
    events.emit(YAP_PLAY_EVENT, {});
    clock.now += 1000;
    events.emit(YAP_EXECUTION_TICK_EVENT, { hasLoot: false });
    events.emit(YAP_EXECUTION_TICK_EVENT, { hasLoot: true });
    events.emit(YAP_EXECUTION_TICK_EVENT, { hasLoot: true });
    expect(player.played).toEqual([key('play'), key('loot')]);
    events.emit(YAP_PLAY_EVENT, {});
    events.emit(YAP_EXECUTION_TICK_EVENT, { hasLoot: true });
    expect(player.played).toEqual([key('play'), key('loot'), key('play'), key('loot')]);
    events.emit(YAP_EXECUTION_TICK_EVENT, 'garbage');
    expect(player.played).toHaveLength(4);
  });

  it('execution end: win and caught sounds with their vibration', () => {
    const { player, nav, events } = rig();
    events.emit(YAP_EXECUTION_END_EVENT, { kind: 'detected', cause: 'guard', by: 'G1', tick: 4 });
    events.emit(YAP_EXECUTION_END_EVENT, { kind: 'won', tick: 9 });
    expect(player.played).toEqual([key('caught'), key('win')]);
    expect(nav.patterns).toEqual([
      yapVibrationPattern('caught', false),
      yapVibrationPattern('win', false),
    ]);
  });

  it('reduced motion: sounds stay, only the drawing tick vibrates', () => {
    const { player, nav, events } = rig(true);
    events.emit(YAP_EXECUTION_END_EVENT, { kind: 'won', tick: 9 });
    events.emit(YAP_PATH_STEP_EVENT);
    expect(player.played).toEqual([key('win'), key('step')]);
    expect(nav.patterns).toEqual([8]);
  });

  it('sound off: silent but still vibrates; vibration off: plays but never vibrates', () => {
    const a = rig();
    a.settings.yapSetSoundEnabled(false);
    a.events.emit(YAP_PATH_STEP_EVENT);
    expect(a.player.played).toEqual([]);
    expect(a.nav.patterns).toEqual([8]);

    const b = rig();
    b.settings.yapSetVibrationEnabled(false);
    b.events.emit(YAP_PATH_STEP_EVENT);
    expect(b.player.played).toEqual([key('step')]);
    expect(b.nav.patterns).toEqual([]);
  });

  it('locked or failing audio never throws (no sound before the first gesture)', () => {
    const { player, nav, events } = rig();
    player.locked = true;
    expect(() => events.emit(YAP_PATH_STEP_EVENT)).not.toThrow();
    expect(player.played).toEqual([]);
    expect(nav.patterns).toEqual([8]); // vibration does not depend on audio
    player.locked = false;
    player.throws = true;
    expect(() => events.emit(YAP_EXECUTION_END_EVENT, { kind: 'won', tick: 1 })).not.toThrow();
  });

  it('works with no audio and no navigator at all (Node, noAudio)', () => {
    const events = new FakeEvents();
    const sound = new YapSound({
      settings: new YapSoundSettings(new YapStorage(null)),
      player: null,
      navigator: null,
    });
    sound.yapAttach(events);
    expect(() => {
      events.emit(YAP_PATH_STEP_EVENT);
      events.emit(YAP_PLAY_EVENT, {});
      events.emit(YAP_EXECUTION_TICK_EVENT, { hasLoot: true });
      events.emit(YAP_EXECUTION_END_EVENT, { kind: 'won', tick: 1 });
      events.emit(YAP_UI_TAP_EVENT);
    }).not.toThrow();
  });

  it('detach removes every listener it added', () => {
    const { sound, events, player } = rig();
    expect(events.count()).toBe(5);
    sound.yapDetach();
    expect(events.count()).toBe(0);
    events.emit(YAP_PATH_STEP_EVENT);
    expect(player.played).toEqual([]);
  });

  it('listens to the scene event names the Level scene emits', () => {
    expect(YAP_PLAY_EVENT).toBe('yap-play');
    expect(YAP_EXECUTION_END_EVENT).toBe('yap-execution-end');
    const levelScene = readFileSync(
      new URL('../../src/game/level-scene.ts', import.meta.url),
      'utf8',
    );
    expect(levelScene).toContain("const YAP_PLAY_EVENT = 'yap-play'");
    expect(levelScene).toContain("const YAP_EXECUTION_END_EVENT = 'yap-execution-end'");
    for (const name of ['YAP_PATH_STEP_EVENT', 'YAP_UI_TAP_EVENT', 'YAP_EXECUTION_TICK_EVENT']) {
      expect(levelScene).toContain(`this.events.emit(${name}`);
    }
    expect(levelScene).toContain('yapAttachSound(this)');
  });
});
