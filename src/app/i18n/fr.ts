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
    back: 'Retour',
    close: 'Fermer',
    copied: 'Copié',
    play: 'Jouer',
  },
  consent: {
    message:
      "Ce prototype mesure tes parties de façon anonyme pour décider s'il mérite d'exister. Aucune donnée personnelle.",
    accept: 'OK',
    decline: 'Non merci',
  },
  home: {
    // Style plan 4/6 de C1 : le dossier du jour, son tampon, la série
    folderTab: 'Dossier nº {day} · {weekday}',
    dailyKicker: 'Casse du jour',
    status: 'Statut',
    stampToDo: 'À faire',
    stampCleared: 'Réussi · {attempts} {attempts|essai|essais}',
    stampClearedShort: 'Réussi',
    stampSoon: 'Bientôt',
    stampWeekOver: 'Semaine terminée',
    streakKicker: 'Série · {count} {count|jour|jours}',
    nextFile: 'Prochain dossier dans {time}',
    // Style plan de C1 : le surtitre de l'en-tête de l'accueil (en capitales)
    tagline: 'Un casse par jour · Yap Corp',
    dailyHeist: 'Casse du jour n°{day}',
    play: 'Jouer',
    share: 'Partager',
    archive: 'Archives',
    tutorial: 'Tutoriel',
  },
  planning: {
    par: 'Par : {par}',
    clear: 'Effacer',
    play: 'PLAY',
    // Passe visuelle C1 : le par dans le bloc de droite de l'en-tête de victoire.
    statsPar: 'par {par}',
    drawRoute: 'Trace ta route',
    grabDiamond: 'Prends le diamant, puis sors',
    // X1 : les objectifs d'étoiles, dans la légende du bas dès que le plan peut partir.
    starTargets: "★★★ à {par} ticks · ★★ jusqu'à {twoStarMax}",
  },
  execution: {
    stop: 'Stop',
    speed: '×{speed}',
  },
  failure: {
    // Style plan 4/6 de C1 : le tampon posé près de la case fatale
    stamp: 'Repéré',
    spottedByGuard: 'Repéré par le garde',
    attempt: 'Essai n°{n}',
    tapToReturn: "Touche l'écran pour revenir à ton plan",
  },
  win: {
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
      '{nickname} a réussi le casse n°{day} en {attempts} {attempts|essai|essais} · {ticks} ticks. À toi.',
    anonymous:
      'Un ami a réussi le casse n°{day} en {attempts} {attempts|essai|essais} · {ticks} ticks. À toi.',
    takeChallenge: 'Relever le défi',
    later: 'Plus tard',
  },
  comparison: {
    title: 'Comparaison',
    seeTheirPlan: 'Voir son plan',
    shareMyResult: 'Partager mon résultat',
    home: 'Accueil',
  },
  // Style plan 4/6 de C1 : les jours (dimanche = d0) et ce qu'un casse contient
  weekdays: {
    d0: 'dimanche',
    d1: 'lundi',
    d2: 'mardi',
    d3: 'mercredi',
    d4: 'jeudi',
    d5: 'vendredi',
    d6: 'samedi',
  },
  facts: {
    guard: 'Garde',
    camera: 'Caméra',
    laser: 'Laser',
  },
  archive: {
    rowTitle: 'Nº {day} · {weekday}',
    title: 'Archives',
    playPastDay: 'Rejouer un jour passé — sans effet sur la série',
  },
  settings: {
    title: 'Réglages',
    language: 'Langue',
    sound: 'Son',
    vibration: 'Vibration',
    nickname: 'Surnom',
    consent: 'Mesure anonyme',
    privacy: 'Confidentialité',
    version: 'Version {version}',
    on: 'Activé',
    off: 'Coupé',
    nicknameEmpty: 'Un ami',
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
  // Story C4 — écran d'échec (rejeu au ralenti, cause écrite, réessayer).
  failureReplay: {
    spottedByCamera: 'Repéré par la caméra',
    spottedByLaser: 'Pris dans le faisceau laser',
  },
  winScreen: {
    // Style plan 4/6 de C1 : le surtitre, le télégramme et le tampon du rapport
    report: "Rapport d'opération · nº {day}",
    telegram: 'À partager {line} · {ticks} ticks {stars}',
    stamp: 'Casse réussi',
  },
  // Story G2 — bannière de consentement (premier lancement, bandeau haut non bloquant).
  consentBanner: {
    learnMore: 'En savoir plus',
  },
  // Story D3 — la page de confidentialité.
  privacy: {
    kicker: 'Perfect Crime · {studio}',
    measuredHead: 'Ce qui est mesuré',
    measured:
      'Si tu réponds OK : tes parties (niveaux, essais, durée, étoiles, indices, partages), la langue, le type d’appareil, la version du jeu, les erreurs éventuelles et un identifiant aléatoire créé sur cet appareil.',
    notMeasuredHead: 'Ce qui ne l’est pas',
    notMeasured:
      'Ni nom, ni e-mail, ni contacts. Ton surnom ne voyage que dans les liens que tu partages toi-même.',
    whereHead: 'Où ça va',
    where:
      'Chez PostHog, hébergé dans l’Union européenne. Aucune pub, aucune revente. Tout est supprimé à la fin de la Gate 2, la phase de test suivante.',
    choiceHead: 'Ton choix',
    choice:
      'Avec Non merci, rien ne part. Tu peux changer d’avis à tout moment dans les Réglages. Ta progression reste sur cet appareil.',
    contactHead: 'Contact',
    contact: '{studio} : {contact}',
  },
  // Story D2 — écran d'accueil et enchaînement (src/game/home-scene.ts) :
  // tutoriel enchaîné, compte à rebours avec jours, accueil avant / après la
  // semaine de test.
  homeFlow: {
    nextLevel: 'Niveau suivant',
    countdownWithDays: '{days} j {clock}',
    lastHeist: 'Dernier casse de la semaine',
    beforeTitle: 'La semaine des casses commence bientôt',
    beforeHint: 'Entraîne-toi avec le tutoriel en attendant.',
    firstHeistIn: 'Premier casse dans {time}',
    afterTitle: 'La semaine de test est terminée',
    afterMessage: 'Merci d’avoir fait cette semaine de casses avec nous !',
    bestStreak: 'Meilleure série : {count} {count|jour|jours}',
  },
  // Story E2 — le texte partagé (spec Gate 1, « Ce qui part ») : ligne titre,
  // ligne score ({emoji} = la ligne d'emojis de l'écran de victoire, {stars} =
  // une ⭐ par étoile), puis la ligne du lien. Une victoire de tutoriel n'a pas
  // de numéro de casse du jour : elle partage une invitation au jeu
  // (src/app/share.ts). « Copié » réutilise common.copied.
  share: {
    title: 'Casse du jour n°{day} 🕵️ réussi en {attempts} {attempts|essai|essais}',
    titleOne: 'Casse du jour n°{day} 🕵️ réussi en 1 essai',
    tutorialTitle: '{game} 🕵️ tutoriel réussi en {attempts} {attempts|essai|essais}',
    tutorialTitleOne: '{game} 🕵️ tutoriel réussi en 1 essai',
    score: '{emoji} · {ticks} ticks {stars}',
    yourTurn: 'À toi : {link}',
    failed: 'Partage impossible',
  },
  // Story C7 — indices après 3 puis 6 échecs (src/game/hints.ts) : le bouton
  // Indice de la barre du bas (affiché seulement quand un indice est
  // disponible) et le badge compact à la fin du chemin fantôme révélé.
  hints: {
    button: '💡 Indice',
    badge: '💡 {shown}/{total}',
  },
  // Story E4 — arrivée par un lien (src/app/inbox.ts, src/game/challenge-scene.ts,
  // src/app/router.ts) : la carte de défi d'un lien reçu, sa comparaison de
  // scores et le plan de l'ami, caché jusqu'à la victoire du destinataire ou
  // jusqu'au deuxième indice. La ligne de la carte et les actions réutilisent
  // challenge.* et comparison.* ci-dessus.
  challengeFlow: {
    // Style plan 4/6 de C1 : le sceau du plan de l'ami et les tampons du verdict
    seal: 'Scellé',
    sealedTitle: 'Son plan est sous scellés',
    sealedNote: 'Ouvert après ta réussite ou au 2ᵉ indice',
    openTitle: 'Son plan est ouvert',
    stampBetter: 'Gagné',
    stampWorse: 'Ami devant',
    stampTied: 'Égalité',
    // Style plan de C1 : l'en-tête de l'écran défi (src/game/challenge-scene.ts)
    kicker: 'Message reçu · casse nº {day}',
    title: 'Défi lancé par {nickname}',
    titleAnonymous: 'Un défi',
    expressNote: 'Nouveau ici ? Un tutoriel rapide en 3 niveaux d’abord.',
    you: 'Toi',
    friend: 'Ami',
    hints: 'Indices',
    planTitle: 'Son plan',
  },
  // Story X3 — aperçu du plan, l’« arc en pointillés » d’Angry Birds
  // (docs/design/experience.md §3.1), derrière le commutateur ?flag=preview:
  // le bouton Aperçu de la barre du bas, affiché quand la route tracée est
  // complète, et l’indicateur de la barre du bas pendant le rejeu fantôme.
  preview: {
    button: '👁 Aperçu',
    running: 'Aperçu de ton plan…',
  },
  // Story X9 — l’Observer (tasks/X9.md) : la ronde avant la route, le plan pas à
  // pas jusqu’à sa première détection, et la bande de ticks pendant le tracé.
  observer: {
    button: '👁 Observer',
    round: 'Ronde : tout recommence tous les {cycle} ticks',
    running: 'Ton plan, tick par tick',
    back: '−1',
    forward: '+1',
    pause: 'Pause',
    resume: 'Lecture',
    close: 'Fermer',
    caughtGuard: 'Le garde t’arrête au tick {tick}.',
    caughtCamera: 'Au tick {tick}, la caméra voit cette case.',
    caughtLaser: 'Au tick {tick}, le laser coupe cette case.',
    won: 'Ce plan passe : sortie au tick {tick}.',
    bandExposed: 'Tick {tick} : {threats}',
    bandClear: 'Tick {tick} : aucun regard ni faisceau sur cette case',
    bandGuard: 'regard du garde',
    bandCamera: 'regard de la caméra',
    bandContact: 'contact avec le garde',
    bandLaser: 'faisceau laser',
  },
  // Passe visuelle 3 de C1 — l'en-tête de l'écran de niveau (src/game/kit.ts) :
  // le surtitre au-dessus du titre, que son rôle affiche en capitales, et les
  // stats du bloc de droite. Le compteur de ticks du rejeu sous `tick` n'est
  // fait que de chiffres (« 07/26 »).
  header: {
    tutorial: 'Tutoriel · {n} / 5',
    daily: 'Casse nº {day}',
    archive: 'Archives · nº {day}',
    challenge: 'Défi · nº {day}',
    running: '{kicker} — en cours',
    ticks: 'Ticks {ticks}/{par}',
    pauses: 'Pauses {count}',
    tick: 'Tick',
  },
  // Passe visuelle 3 de C1 — les titres des cinq niveaux du tutoriel : les noms
  // de leçon de la spec Gate 1. Les casses du jour ont les leurs sous `heists`.
  tutorialLessons: {
    t1: 'Le plan',
    t2: 'Le regard',
    t3: 'La ronde',
    t4: 'La pause',
    t5: 'La caméra',
  },
  // Story F3 — le nom affiché des sept casses du jour.
  heists: {
    d1: 'Première ronde',
    d2: 'Sous surveillance',
    d3: 'Le demi-tour',
    d4: 'Ligne rouge',
    d5: 'L’angle mort',
    d6: 'Le carrefour',
    d7: 'La relève',
  },
};
