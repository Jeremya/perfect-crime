// English dictionary — canonical shape of every displayed string.
// `as const` gives literal types; YapDictionary widens them to string so the
// French dictionary can be checked against this structure (see ./index.ts).
// Story A3: no displayed string may exist outside src/app/i18n/.
export const en = {
  meta: {
    languageName: 'English',
  },
  app: {
    // Displayed game name — a product decision, identical in every language
    // (docs/NAMING.md).
    title: 'Perfect Crime',
  },
  common: {
    ok: 'OK',
    noThanks: 'No thanks',
    learnMore: 'Learn more',
    back: 'Back',
    close: 'Close',
    clear: 'Clear',
    copied: 'Copied',
    share: 'Share',
    play: 'Play',
  },
  consent: {
    message:
      'This prototype measures your games anonymously to decide whether it deserves to exist. No personal data.',
    accept: 'OK',
    decline: 'No thanks',
  },
  home: {
    dailyHeist: 'Daily heist #{day}',
    statusToDo: 'To do',
    statusCleared: 'Cleared in {attempts} attempts',
    streak: 'Streak: {count} days',
    nextHeistIn: 'Next heist in {time}',
    play: 'Play',
    share: 'Share',
    archive: 'Archive',
    tutorial: 'Tutorial',
    settings: 'Settings',
  },
  planning: {
    planTicks: 'Plan: {ticks} ticks',
    par: 'Par: {par}',
    pausesLeft: 'Pauses left: {count}',
    clear: 'Clear',
    play: 'PLAY',
    hint: 'Hint',
    grabDiamond: 'Grab the diamond, then get out',
  },
  execution: {
    stop: 'Stop',
    speed: '×{speed}',
  },
  failure: {
    spottedByGuard: 'Spotted by the guard',
    attempt: 'Attempt {n}',
    tapToReturn: 'Tap to return to your plan',
  },
  win: {
    title: 'Heist cleared!',
    attempts: 'Attempts',
    ticks: 'Ticks',
    par: 'Par',
    stars: 'Stars',
    share: 'Share',
    improve: 'Improve my score',
    home: 'Home',
  },
  challenge: {
    withNickname:
      '{nickname} cleared heist #{day} in {attempts} attempts · {ticks} ticks. Your turn.',
    anonymous: 'A friend cleared heist #{day} in {attempts} attempts · {ticks} ticks. Your turn.',
    takeChallenge: 'Take the challenge',
    later: 'Later',
  },
  comparison: {
    title: 'Comparison',
    seeTheirPlan: 'See their plan',
    shareMyResult: 'Share my result',
    home: 'Home',
  },
  archive: {
    title: 'Archive',
    playPastDay: 'Play a past day — no effect on the streak',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    sound: 'Sound',
    vibration: 'Vibration',
    nickname: 'Nickname',
    consent: 'Consent',
    privacy: 'Privacy',
    version: 'Version {version}',
  },
  viewer: {
    title: 'Dev viewer',
    tick: 'Tick {tick}/{max}',
    ticks: 'Ticks: {count}',
    tension: 'Tension: {count}',
    minPauses: 'Min pauses: {count}',
    plans: 'Optimal plans: {count}',
    pause: 'Pause',
    prevTick: '◀',
    nextTick: '▶',
    openFile: 'Open .lvl…',
    error: 'Cannot open this level: {message}',
    unsolved: 'Not clearable within {max} ticks',
    noBundled: 'No .lvl file bundled',
  },
  // Story C3 — Execution screen (playback of the plan).
  executionPlayback: {
    tick: 'Tick {tick}/{max}',
  },
  // Story C4 — Failure screen (slow-motion replay, written cause, retry).
  failureReplay: {
    spottedByCamera: 'Spotted by the camera',
    spottedByLaser: 'Caught in the laser beam',
  },
} as const;

/** The dictionary contract: same shape as `en`, every leaf widened to string. */
type YapWiden<T> = T extends string ? string : { [K in keyof T]: YapWiden<T[K]> };
export type YapDictionary = YapWiden<typeof en>;
