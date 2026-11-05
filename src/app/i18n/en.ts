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
    // C1 plan style 4/6: the folder of the day, its stamp, the streak
    folderTab: 'File No. {day} · {weekday}',
    dailyKicker: 'Daily heist',
    status: 'Status',
    stampToDo: 'To do',
    stampCleared: 'Cleared · {attempts} tries',
    stampClearedShort: 'Cleared',
    stampSoon: 'Soon',
    stampWeekOver: 'Week over',
    streakKicker: 'Streak · {count} days',
    nextFile: 'Next file in {time}',
    // C1 plan style: the kicker of Home's header (shown in capitals)
    tagline: 'One heist a day · Yap Corp',
    dailyHeist: 'Daily heist #{day}',
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
    // C1 visual pass: the par in the right block of the Win screen's header.
    statsPar: 'par {par}',
    drawRoute: 'Draw your route',
    hint: 'Hint',
    grabDiamond: 'Grab the diamond, then get out',
    // X1: the star targets, in the footer caption once the plan can run.
    starTargets: '★★★ at {par} ticks · ★★ up to {twoStarMax}',
  },
  execution: {
    stop: 'Stop',
    speed: '×{speed}',
  },
  failure: {
    // C1 plan style 4/6: the stamp that lands near the fatal cell
    stamp: 'Spotted',
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
  // C1 plan style 4/6: weekdays (Sunday = d0) and what a heist holds
  weekdays: {
    d0: 'Sunday',
    d1: 'Monday',
    d2: 'Tuesday',
    d3: 'Wednesday',
    d4: 'Thursday',
    d5: 'Friday',
    d6: 'Saturday',
  },
  facts: {
    guard: 'Guard',
    camera: 'Camera',
    laser: 'Laser',
  },
  archive: {
    rowTitle: 'No. {day} · {weekday}',
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
    // C1 plan style 4/6: the win report's kicker, telegram and stamp
    report: 'Operation report · No. {day}',
    telegram: 'To share {line} · {ticks} ticks {stars}',
    stamp: 'Heist pulled off',
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
  // Story C7 — hints after 3 then 6 failures (src/game/hints.ts): the Hint
  // button of the planning bottom bar (shown only when a hint is available)
  // and the compact badge at the end of the revealed ghost path.
  hints: {
    button: '💡 Hint',
    badge: '💡 {shown}/{total}',
  },
  // Story E4 — link arrival (src/app/inbox.ts, src/game/challenge-scene.ts,
  // src/app/router.ts): the challenge card of a received link, its score
  // comparison and the friend's plan, hidden until the recipient has won or
  // taken the second hint. The card line and the actions reuse challenge.*
  // and comparison.* above.
  challengeFlow: {
    // C1 plan style 4/6: the seal on the friend's plan and the verdict stamps
    seal: 'Sealed',
    sealedTitle: 'Their plan is sealed',
    sealedNote: 'Opened after your win or at the 2nd hint',
    openTitle: 'Their plan is open',
    stampBetter: 'You win',
    stampWorse: 'Friend ahead',
    stampTied: 'Tie',
    // C1 plan style: the challenge screen's header (src/game/challenge-scene.ts)
    kicker: 'Message received · heist No. {day}',
    title: 'A challenge from {nickname}',
    titleAnonymous: 'A challenge',
    expressNote: 'New here? A quick 3-level tutorial comes first.',
    you: 'You',
    friend: 'Friend',
    hints: 'Hints',
    planTitle: 'Their plan',
  },
  // Story X3 — plan preview, the Angry Birds "dotted arc"
  // (docs/design/experience.md §3.1), behind the ?flag=preview: switch
  // (default on): the Preview button of the planning bottom bar, shown once
  // the drawn route is complete, and the bottom-bar indicator while the ghost
  // replays the plan.
  preview: {
    button: '👁 Preview',
    running: 'Previewing your plan…',
    observe: '👁 Observe',
    round: 'Round: it all repeats every {cycle} ticks',
    back: '−1',
    forward: '+1',
    pause: 'Pause',
    resume: 'Play',
    close: 'Close',
    caughtGuard: 'The guard stops you at tick {tick}.',
    caughtCamera: 'At tick {tick}, the camera sees this cell.',
    caughtLaser: 'At tick {tick}, the laser cuts this cell.',
    won: 'This plan works: out at tick {tick}.',
    bandExposed: 'Tick {tick}: {threats}',
    bandClear: 'Tick {tick}: no sight or beam on this cell',
    bandGuard: 'guard sight',
    bandCamera: 'camera sight',
    bandContact: 'guard contact',
    bandLaser: 'laser beam',
  },
  // C1 visual pass 3 — the header of the level scene (src/game/kit.ts): the
  // kicker above the title, which the kicker role shows in capitals, and the
  // stats of the right block. The playback's tick counter under `tick` is
  // digits only ("07/26").
  header: {
    tutorial: 'Tutorial · {n} / 5',
    daily: 'Heist No. {day}',
    archive: 'Archive · No. {day}',
    challenge: 'Challenge · No. {day}',
    running: '{kicker} — running',
    ticks: 'Ticks {ticks}/{par}',
    pauses: 'Pauses {count}',
    tick: 'Tick',
  },
  // C1 visual pass 3 — the titles of the five tutorial levels: the lesson
  // names of the Gate 1 spec. Daily heists keep their level names.
  tutorialLessons: {
    t1: 'The plan',
    t2: 'The gaze',
    t3: 'The patrol',
    t4: 'The pause',
    t5: 'The camera',
  },
} as const;

/** The dictionary contract: same shape as `en`, every leaf widened to string. */
type YapWiden<T> = T extends string ? string : { [K in keyof T]: YapWiden<T[K]> };
export type YapDictionary = YapWiden<typeof en>;
