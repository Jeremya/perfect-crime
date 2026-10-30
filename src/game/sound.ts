// Minimal sounds and vibration (story C8). Six short self-made sounds
// (public/sounds/) wired to the Level scene's events, plus a vibration only
// where the browser has navigator.vibrate (Android Chrome; a no-op on iOS
// Safari and desktop). Both are toggleable and remembered through the A2
// storage (`yapcorp:sound`, `yapcorp:vibration`, on by default); a later
// Settings screen calls yapSoundSettings.
//
// | Cue    | Scene event                         | Vibration (ms)          |
// |--------|-------------------------------------|-------------------------|
// | step   | yap-path-step (a new path cell)     | 8 (Gate 1 spec)         |
// | tap    | yap-ui-tap (any chrome button)      | —                       |
// | play   | yap-play                            | —                       |
// | loot   | yap-execution-tick, hasLoot flips   | 20                      |
// | caught | yap-execution-end, detected         | 60, 40, 120             |
// | win    | yap-execution-end, won              | 30, 40, 30, 40, 60      |
//
// With prefers-reduced-motion, only the 8 ms drawing tick vibrates: the
// longer buzzes are skipped, like the screen shake (Gate 1 spec).
//
// Playback goes through Phaser's sound manager, which unlocks WebAudio on the
// first user gesture; until then (and with noAudio) cues are silently
// skipped, never queued. Everything below the Phaser adapter is pure and
// unit-tested with fakes (tests/unit/sound.test.ts); Phaser is type-only here.
import type Phaser from 'phaser';
import { yapStorage, type YapStorage } from '../app/storage';

/** The six sound cues. */
export type YapSoundCue = 'step' | 'tap' | 'play' | 'loot' | 'caught' | 'win';

export const YAP_SOUND_CUES: readonly YapSoundCue[] = [
  'step',
  'tap',
  'play',
  'loot',
  'caught',
  'win',
];

/** Public URL of each cue's file (served from public/sounds/). */
export const YAP_SOUND_FILES: Readonly<Record<YapSoundCue, string>> = {
  step: '/sounds/step.wav',
  tap: '/sounds/tap.wav',
  play: '/sounds/play.wav',
  loot: '/sounds/loot.wav',
  caught: '/sounds/caught.wav',
  win: '/sounds/win.wav',
};

/** Playback volume per cue: the per-cell step stays discreet. */
const YAP_SOUND_VOLUME: Readonly<Record<YapSoundCue, number>> = {
  step: 0.35,
  tap: 0.5,
  play: 0.6,
  loot: 0.6,
  caught: 0.7,
  win: 0.7,
};

/** Phaser audio cache key of a cue. */
export function yapSoundKey(cue: YapSoundCue): string {
  return `yap-sound-${cue}`;
}

// Scene events. The first two already exist in level-scene.ts (same strings);
// the last three are emitted there for this story.
/** Emitted with the plan when PLAY is pressed. */
export const YAP_PLAY_EVENT = 'yap-play';
/** Emitted with the outcome when the playback reaches its end. */
export const YAP_EXECUTION_END_EVENT = 'yap-execution-end';
/** Emitted when the drawn path gains a cell. */
export const YAP_PATH_STEP_EVENT = 'yap-path-step';
/** Emitted when a chrome button is pressed. */
export const YAP_UI_TAP_EVENT = 'yap-ui-tap';
/** Emitted with the displayed frame at every playback tick. */
export const YAP_EXECUTION_TICK_EVENT = 'yap-execution-tick';

/** A UI tap right after another cue (PLAY's own button press) is not doubled. */
const YAP_TAP_MERGE_MS = 50;

// ---------------------------------------------------------------------------
// Settings: sound on/off, vibration on/off — remembered, never throwing
// ---------------------------------------------------------------------------

const YAP_SOUND_SETTING_KEY = 'sound';
const YAP_VIBRATION_SETTING_KEY = 'vibration';

/** Sound and vibration toggles, persisted through YapStorage (default on). */
export class YapSoundSettings {
  constructor(private readonly storage: YapStorage = yapStorage) {}

  yapSoundEnabled(): boolean {
    return this.yapRead(YAP_SOUND_SETTING_KEY);
  }

  yapSetSoundEnabled(on: boolean): void {
    this.storage.set(YAP_SOUND_SETTING_KEY, on ? 'on' : 'off');
  }

  yapVibrationEnabled(): boolean {
    return this.yapRead(YAP_VIBRATION_SETTING_KEY);
  }

  yapSetVibrationEnabled(on: boolean): void {
    this.storage.set(YAP_VIBRATION_SETTING_KEY, on ? 'on' : 'off');
  }

  /** Only an explicit 'off' disables: missing or corrupted means on. */
  private yapRead(name: string): boolean {
    return this.storage.get(name) !== 'off';
  }
}

/** Shared settings instance (the Settings screen toggles these). */
export const yapSoundSettings = new YapSoundSettings();

// ---------------------------------------------------------------------------
// Pure helpers: vibration guard, patterns, outcome mapping
// ---------------------------------------------------------------------------

/** The part of Navigator used here; `vibrate` is missing on iOS and desktop Safari. */
export interface YapVibrateTarget {
  vibrate?(pattern: number | number[]): boolean;
}

/** Calls navigator.vibrate when it exists; never throws. True if it was called. */
export function yapVibrate(
  nav: YapVibrateTarget | null | undefined,
  pattern: number | number[],
): boolean {
  if (nav === null || nav === undefined || typeof nav.vibrate !== 'function') return false;
  try {
    nav.vibrate(pattern); // called on the navigator itself: no illegal invocation
    return true;
  } catch {
    return false;
  }
}

/** Short vibration of a cue (null = none). Reduced motion keeps only the 8 ms tick. */
export function yapVibrationPattern(
  cue: YapSoundCue,
  reducedMotion: boolean,
): number | number[] | null {
  if (cue === 'step') return 8; // Gate 1 spec: each new cell, 8 ms
  if (reducedMotion) return null;
  switch (cue) {
    case 'loot':
      return 20;
    case 'caught':
      return [60, 40, 120];
    case 'win':
      return [30, 40, 30, 40, 60];
    default:
      return null;
  }
}

/** The cue of an execution outcome: won -> win, detected -> caught. */
export function yapCueForOutcome(outcome: unknown): YapSoundCue | null {
  if (typeof outcome !== 'object' || outcome === null || !('kind' in outcome)) return null;
  if (outcome.kind === 'won') return 'win';
  if (outcome.kind === 'detected') return 'caught';
  return null;
}

function yapHasLoot(frame: unknown): boolean {
  return (
    typeof frame === 'object' && frame !== null && 'hasLoot' in frame && frame.hasLoot === true
  );
}

// ---------------------------------------------------------------------------
// YapSound: scene events -> sounds and vibration
// ---------------------------------------------------------------------------

/** Audio output (Phaser in the game, a fake in tests). */
export interface YapSoundPlayer {
  /** False while audio is locked (before the first gesture) or the file is missing. */
  canPlay(key: string): boolean;
  play(key: string, volume: number): void;
}

/** The on/off shape of Phaser's scene.events. */
export interface YapSoundEventSource {
  on(event: string, fn: (...args: unknown[]) => void): unknown;
  off(event: string, fn: (...args: unknown[]) => void): unknown;
}

export interface YapSoundOptions {
  readonly settings?: YapSoundSettings;
  readonly player?: YapSoundPlayer | null;
  /** Defaults to globalThis.navigator. */
  readonly navigator?: YapVibrateTarget | null;
  /** Defaults to the prefers-reduced-motion media query. */
  readonly reducedMotion?: () => boolean;
  /** Milliseconds clock; defaults to performance.now. */
  readonly now?: () => number;
}

function yapDefaultNavigator(): YapVibrateTarget | null {
  try {
    return globalThis.navigator ?? null;
  } catch {
    return null;
  }
}

function yapDefaultReducedMotion(): boolean {
  try {
    return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function yapDefaultNow(): number {
  try {
    return performance.now();
  } catch {
    return 0;
  }
}

export class YapSound {
  private readonly settings: YapSoundSettings;
  private readonly player: YapSoundPlayer | null;
  private readonly nav: YapVibrateTarget | null;
  private readonly reducedMotion: () => boolean;
  private readonly now: () => number;
  private source: YapSoundEventSource | null = null;
  /** Loot state of the last playback tick (the pickup is its false -> true edge). */
  private hadLoot = false;
  /** Clock of the last non-tap cue, to merge a button's tap into it. */
  private lastCueAt = Number.NEGATIVE_INFINITY;

  constructor(options: YapSoundOptions = {}) {
    this.settings = options.settings ?? yapSoundSettings;
    this.player = options.player ?? null;
    this.nav = options.navigator === undefined ? yapDefaultNavigator() : options.navigator;
    this.reducedMotion = options.reducedMotion ?? yapDefaultReducedMotion;
    this.now = options.now ?? yapDefaultNow;
  }

  /** Plays a cue's sound and vibration, each only when its setting is on. Never throws. */
  yapCue(cue: YapSoundCue): void {
    const at = this.now();
    if (cue === 'tap') {
      if (at - this.lastCueAt < YAP_TAP_MERGE_MS) return;
    } else {
      this.lastCueAt = at;
    }
    if (this.settings.yapSoundEnabled() && this.player !== null) {
      const key = yapSoundKey(cue);
      try {
        if (this.player.canPlay(key)) this.player.play(key, YAP_SOUND_VOLUME[cue]);
      } catch {
        // audio is optional: a broken context must never break the game
      }
    }
    if (this.settings.yapVibrationEnabled()) {
      const pattern = yapVibrationPattern(cue, this.reducedMotion());
      if (pattern !== null) yapVibrate(this.nav, pattern);
    }
  }

  /** Listens to the Level scene's events (detaches from any previous source). */
  yapAttach(source: YapSoundEventSource): void {
    this.yapDetach();
    this.source = source;
    source.on(YAP_PATH_STEP_EVENT, this.yapOnStep);
    source.on(YAP_UI_TAP_EVENT, this.yapOnTap);
    source.on(YAP_PLAY_EVENT, this.yapOnPlay);
    source.on(YAP_EXECUTION_TICK_EVENT, this.yapOnTick);
    source.on(YAP_EXECUTION_END_EVENT, this.yapOnEnd);
  }

  yapDetach(): void {
    const source = this.source;
    if (source === null) return;
    source.off(YAP_PATH_STEP_EVENT, this.yapOnStep);
    source.off(YAP_UI_TAP_EVENT, this.yapOnTap);
    source.off(YAP_PLAY_EVENT, this.yapOnPlay);
    source.off(YAP_EXECUTION_TICK_EVENT, this.yapOnTick);
    source.off(YAP_EXECUTION_END_EVENT, this.yapOnEnd);
    this.source = null;
  }

  private readonly yapOnStep = (): void => this.yapCue('step');

  private readonly yapOnTap = (): void => this.yapCue('tap');

  private readonly yapOnPlay = (): void => {
    this.hadLoot = false; // a new attempt starts without the diamond
    this.yapCue('play');
  };

  private readonly yapOnTick = (frame: unknown): void => {
    const hasLoot = yapHasLoot(frame);
    if (hasLoot && !this.hadLoot) this.yapCue('loot');
    this.hadLoot = hasLoot;
  };

  private readonly yapOnEnd = (outcome: unknown): void => {
    const cue = yapCueForOutcome(outcome);
    if (cue !== null) this.yapCue(cue);
  };
}

// ---------------------------------------------------------------------------
// Phaser adapter
// ---------------------------------------------------------------------------

/** Plays through the game's sound manager; skips while locked or not loaded. */
class YapPhaserSoundPlayer implements YapSoundPlayer {
  constructor(private readonly scene: Phaser.Scene) {}

  canPlay(key: string): boolean {
    const sound = this.scene.sound;
    return !sound.locked && this.scene.cache.audio.exists(key);
  }

  play(key: string, volume: number): void {
    this.scene.sound.play(key, { volume });
  }
}

/**
 * Attaches the sounds to a scene: loads the six files once (the audio cache
 * outlives scene restarts), listens to the scene's events and detaches on
 * shutdown. Never throws: without audio the game simply stays silent.
 */
export function yapAttachSound(scene: Phaser.Scene): YapSound {
  const sound = new YapSound({ player: new YapPhaserSoundPlayer(scene) });
  try {
    const missing = YAP_SOUND_CUES.filter((cue) => !scene.cache.audio.exists(yapSoundKey(cue)));
    if (missing.length > 0) {
      for (const cue of missing) scene.load.audio(yapSoundKey(cue), YAP_SOUND_FILES[cue]);
      scene.load.start(); // create() runs after preload: start this small batch now
    }
  } catch {
    // no loader or no audio support: cues are skipped by canPlay
  }
  sound.yapAttach(scene.events);
  scene.events.once('shutdown', () => sound.yapDetach());
  return sound;
}
