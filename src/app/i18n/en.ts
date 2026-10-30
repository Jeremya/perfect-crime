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
    // C1 visual pass: one compact stats line under the level name.
    statsTicks: '{ticks} ticks',
    statsPar: 'par {par}',
    statsPauses: '{count} pauses',
    statsSeparator: ' · ',
    drawRoute: 'Draw your route',
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
  // Story C6 — Ghost preview while drawing (behind the ?flag=ghost: switch):
  // compact tick badge shown at the cell under the finger.
  ghost: {
    tickBadge: 't{tick}',
  },
  // Story C5 — Win screen panel (src/game/win.ts): label of the emoji-line
  // preview that will go into the share.
  winScreen: {
    sharePreview: 'Share preview',
  },
  // Story G2 — consent banner (first launch, non-blocking top strip).
  consentBanner: {
    learnMore: 'Learn more',
    detail:
      'Anonymous events only (random ID), hosted in the EU and deleted at the end of Gate 2. No ads, no resale.',
  },
  // Story D2 — Home screen and app flow (src/game/home-scene.ts): tutorial
  // chaining, countdown with days, and Home before / after the test week.
  homeFlow: {
    nextLevel: 'Next level',
    countdownWithDays: '{days}d {clock}',
    lastHeist: 'Last heist of the week',
    beforeTitle: 'The heist week starts soon',
    beforeHint: 'Warm up with the tutorial in the meantime.',
    firstHeistIn: 'First heist in {time}',
    afterTitle: 'The test week is over',
    afterMessage: 'Thanks for pulling off this week of heists with us!',
    bestStreak: 'Best streak: {count} days',
  },
  // Story E2 — the share text (Gate 1 spec, "What gets sent"): title line,
  // score line ({emoji} = the Win screen emoji line, {stars} = one ⭐ per
  // star), then the link line. A tutorial win has no daily heist number, so
  // it shares an invitation to the game instead (src/app/share.ts). "Copied"
  // reuses common.copied.
  share: {
    title: 'Daily Heist #{day} 🕵️ cracked in {attempts} tries',
    titleOne: 'Daily Heist #{day} 🕵️ cracked in 1 try',
    tutorialTitle: '{game} 🕵️ tutorial cleared in {attempts} tries',
    tutorialTitleOne: '{game} 🕵️ tutorial cleared in 1 try',
    score: '{emoji} · {ticks} ticks {stars}',
    yourTurn: 'Your turn: {link}',
    failed: 'Could not share',
  },
  // Story E4 — link arrival (src/app/inbox.ts, src/game/challenge-scene.ts,
  // src/app/router.ts): the challenge card of a received link, its score
  // comparison and the friend's plan, hidden until the recipient has won or
  // taken the second hint. The card line and the actions reuse challenge.*
  // and comparison.* above.
  challengeFlow: {
    expressNote: 'New here? A quick 3-level tutorial comes first.',
    you: 'You',
    friend: 'Friend',
    hints: 'Hints',
    verdictBetter: 'You beat your friend!',
    verdictWorse: 'Your friend is ahead — rematch?',
    verdictTied: 'Dead heat!',
    planLocked: 'Their plan stays hidden until you clear this heist — or take the second hint.',
    planTitle: 'Their plan',
  },
} as const;

/** The dictionary contract: same shape as `en`, every leaf widened to string. */
type YapWiden<T> = T extends string ? string : { [K in keyof T]: YapWiden<T[K]> };
export type YapDictionary = YapWiden<typeof en>;
