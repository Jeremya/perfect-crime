// French dictionary — must satisfy YapDictionary (same keys as ./en.ts, checked
// at compile time). Story A3: no displayed string may exist outside
// src/app/i18n/.
import type { YapDictionary } from './en';

export const fr: YapDictionary = {
  meta: {
    languageName: 'Français',
  },
  app: {
    // Displayed game name — a product decision, identical in every language
    // (docs/NAMING.md).
    title: 'Perfect Crime',
  },
  common: {
    ok: 'OK',
    noThanks: 'Non merci',
    learnMore: 'En savoir plus',
    back: 'Retour',
    close: 'Fermer',
    clear: 'Effacer',
    copied: 'Copié',
    share: 'Partager',
    play: 'Jouer',
  },
  consent: {
    message:
      "Ce prototype mesure tes parties de façon anonyme pour décider s'il mérite d'exister. Aucune donnée personnelle.",
    accept: 'OK',
    decline: 'Non merci',
  },
  home: {
    dailyHeist: 'Casse du jour n°{day}',
    statusToDo: 'À faire',
    statusCleared: 'Réussi en {attempts} essais',
    streak: 'Série : {count} jours',
    nextHeistIn: 'Prochaine casse dans {time}',
    play: 'Jouer',
    share: 'Partager',
    archive: 'Archives',
    tutorial: 'Tutoriel',
    settings: 'Réglages',
  },
  planning: {
    planTicks: 'Plan : {ticks} ticks',
    par: 'Par : {par}',
    pausesLeft: 'Pauses restantes : {count}',
    clear: 'Effacer',
    play: 'PLAY',
    hint: 'Indice',
    grabDiamond: 'Prends le diamant, puis sors',
  },
  execution: {
    stop: 'Stop',
    speed: '×{speed}',
  },
  failure: {
    spottedByGuard: 'Repéré par le garde',
    attempt: 'Essai n°{n}',
    tapToReturn: "Touche l'écran pour revenir à ton plan",
  },
  win: {
    title: 'Casse réussie !',
    attempts: 'Essais',
    ticks: 'Ticks',
    par: 'Par',
    stars: 'Étoiles',
    share: 'Partager',
    improve: 'Améliorer mon score',
    home: 'Accueil',
  },
  challenge: {
    withNickname:
      '{nickname} a réussi la casse n°{day} en {attempts} essais · {ticks} ticks. À toi.',
    anonymous: 'Un ami a réussi la casse n°{day} en {attempts} essais · {ticks} ticks. À toi.',
    takeChallenge: 'Relever le défi',
    later: 'Plus tard',
  },
  comparison: {
    title: 'Comparaison',
    seeTheirPlan: 'Voir son plan',
    shareMyResult: 'Partager mon résultat',
    home: 'Accueil',
  },
  archive: {
    title: 'Archives',
    playPastDay: 'Rejouer un jour passé — sans effet sur la série',
  },
  settings: {
    title: 'Réglages',
    language: 'Langue',
    sound: 'Son',
    vibration: 'Vibration',
    nickname: 'Surnom',
    consent: 'Consentement',
    privacy: 'Confidentialité',
    version: 'Version {version}',
  },
  viewer: {
    title: 'Visionneur dev',
    tick: 'Tick {tick}/{max}',
    ticks: 'Ticks : {count}',
    tension: 'Tension : {count}',
    minPauses: 'Pauses min : {count}',
    plans: 'Plans optimaux : {count}',
    pause: 'Pause',
    prevTick: '◀',
    nextTick: '▶',
    openFile: 'Ouvrir un .lvl…',
    error: "Ce niveau ne s'ouvre pas : {message}",
    unsolved: 'Pas terminable en {max} ticks',
    noBundled: 'Aucun fichier .lvl embarqué',
  },
  // Story C3 — écran d'exécution (rejeu du plan).
  executionPlayback: {
    tick: 'Tick {tick}/{max}',
  },
  // Story C4 — écran d'échec (rejeu au ralenti, cause écrite, réessayer).
  failureReplay: {
    spottedByCamera: 'Repéré par la caméra',
    spottedByLaser: 'Pris dans le faisceau laser',
  },
  // Story C6 — aperçu fantôme pendant le tracé (derrière ?flag=ghost:) :
  // badge de tick compact affiché sur la cellule sous le doigt.
  ghost: {
    tickBadge: 't{tick}',
  },
  // Story C5 — panneau de l'écran de victoire (src/game/win.ts) : label de
  // l'aperçu de la ligne d'emojis qui ira dans le partage.
  winScreen: {
    sharePreview: 'Aperçu du partage',
  },
  // Story G2 — bannière de consentement (premier lancement, bandeau haut non bloquant).
  consentBanner: {
    learnMore: 'En savoir plus',
    detail:
      'Événements anonymes uniquement (identifiant aléatoire), hébergés dans l’UE et supprimés à la fin de la Gate 2. Aucune pub, aucune revente.',
  },
  // Story D2 — écran d'accueil et enchaînement (src/game/home-scene.ts) :
  // tutoriel enchaîné, compte à rebours avec jours, accueil avant / après la
  // semaine de test.
  homeFlow: {
    nextLevel: 'Niveau suivant',
    countdownWithDays: '{days} j {clock}',
    lastHeist: 'Dernière casse de la semaine',
    beforeTitle: 'La semaine des casses commence bientôt',
    beforeHint: 'Entraîne-toi avec le tutoriel en attendant.',
    firstHeistIn: 'Première casse dans {time}',
    afterTitle: 'La semaine de test est terminée',
    afterMessage: 'Merci d’avoir fait cette semaine de casses avec nous !',
    bestStreak: 'Meilleure série : {count} jours',
  },
  // Story E2 — le texte partagé (spec Gate 1, « Ce qui part ») : ligne titre,
  // ligne score ({emoji} = la ligne d'emojis de l'écran de victoire, {stars} =
  // une ⭐ par étoile), puis la ligne du lien. Une victoire de tutoriel n'a pas
  // de numéro de casse du jour : elle partage une invitation au jeu
  // (src/app/share.ts). « Copié » réutilise common.copied.
  share: {
    title: 'Casse du jour n°{day} 🕵️ réussi en {attempts} essais',
    titleOne: 'Casse du jour n°{day} 🕵️ réussi en 1 essai',
    tutorialTitle: '{game} 🕵️ tutoriel réussi en {attempts} essais',
    tutorialTitleOne: '{game} 🕵️ tutoriel réussi en 1 essai',
    score: '{emoji} · {ticks} ticks {stars}',
    yourTurn: 'À toi : {link}',
    failed: 'Partage impossible',
  },
};
