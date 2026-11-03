# X8 — Storyboard : la main animée au premier lancement de T1

Gap connu : `docs/UI-DESIGN.md` écran 1 « First launch / T1 » — "start directly
in the tutorial, with an **animated hand** demonstrating a route and a
non-blocking consent banner". Aucun storyboard n'existait. Celui-ci le définit.

- **Status** : HYPOTHESIS (jamais vu in-game).
- **Contrainte absolue** : `prefers-reduced-motion: reduce` → main statique
  (une seule image, pas de boucle). La bannière de consentement reste
  non-bloquante et ne couvre aucune cellule clé du plateau.

## 1. Les 4 champs

1. **Game intention** — au tout premier lancement, le joueur comprend en 3 s
   le geste central du jeu (tracer une route) sans lire un tutoriel texte.
2. **Expected solution / behavior** — sur T1, une main animée dessine en boucle
   la route solution (ou un extrait de 4–5 cellules) depuis la position du
   voleur, en ~1,6 s, marque une pause de ~0,8 s, puis recommence, **jusqu'au
   premier toucher** du joueur. Dès le premier pointerdown sur le plateau, la
   boucle s'arrête et la main disparaît (le joueur a compris).
3. **Possible failure modes** — (a) la main masque les cellules du plateau
   (elle doit passer *sur* le plateau mais rester translucide, ~85 % d'opacité,
   et ne jamais couvrir le diamant ni la sortie) ; (b) la boucle fatigue ou
   distrait pendant la planification (d'où l'arrêt au premier toucher) ;
   (c) sous `prefers-reduced-motion`, une main figée peut être prise pour un
   bug → la figer **ouverte au-dessus du premier segment**, pas en plein tracé ;
   (d) la bannière de consentement + la main + le texte d'indice = trop
   d'info à la fois (une seule phrase d'indice, tap-to-dismiss).
4. **Playtest criterion** — preview du PR à 390×844, premier lancement frais
   (localStorage `yapcorp:` vide) : 5 testeurs naïfs décrivent le geste attendu
   sans aide ("qu'est-ce que le jeu vous demande de faire ?"). Keep si ≥ 4/5
   répondent "tracer un chemin" spontanément, et si aucun ne décrit la main
   comme gênante après 10 s.

## 2. Storyboard (6 plans, boucle)

Décor : T1, plateau 8×12, bannière consentement en haut (note papier,
non bloquante), top bar 64 px, bottom bar 96 px avec PLAY désactivé
("Draw your route" / « Trace ton chemin »).

| Plan | Durée | Action | Détail visuel |
|---|---|---|---|
| 1 | 0–0,3 s | La main (pointeur index) apparaît près du voleur, translucide | main 48 px, opacité 0 → .85, légère ombre portée |
| 2 | 0,3–1,3 s | Le doigt **trace** le premier segment de la route | la route se dessine derrière le doigt (ligne `path-light` 5,5 px + contour `path-outline`), le doigt glisse cellule par cellule (snap exact sur les cellules, jamais entre deux) |
| 3 | 1,3–1,6 s | Le doigt atteint la 4ᵉ/5ᵉ cellule, la route complète apparaît en pointillés fantômes jusqu'à la sortie | la partie non encore tracée = fantôme pointillé (comme le ghost C6), pour suggérer la destination |
| 4 | 1,6–2,4 s | Pause : la main se **referme** (geste "saisie") 200 ms puis se rouvre | feedback tactile visuel ; route tracée reste affichée 300 ms |
| 5 | 2,4–2,7 s | La route tracée **s'efface** en fondu (200 ms), la main revient près du voleur | reset de la boucle |
| 6 | 2,7–3,5 s | Boucle sur le plan 1 | — |

- Premier `pointerdown` sur le plateau → fondu 150 ms de la main + arrêt de
  la boucle ; le tracé fantôme s'efface aussi (le joueur trace le sien).
- Bannière consentement : note papier en haut, boutons OK (primary) / No
  thanks (secondary) ≥ 44 px ; elle pousse le header/plateau vers le bas sans
  couvrir de cellule (comportement déjà exigé par `docs/UI-DESIGN.md`).

## 3. Implémentation (pour X8b / tâche dédiée)

- Main **drawn in code** (recommandé) : forme de main simplifiée (paume +
  index) en `path-outline` avec remplissage `surface-panel`, contour 2 px —
  cohérent avec le plateau, zéro asset. Alternative : sprite
  `PNG/Basic/Default/hand_point.png` du Kenney **Cursor Pack** (CC0, pack
  séparé) — uniquement si le product owner préfère un curseur réaliste.
- Animation : timeline Phaser (`this.tweens`) sur les positions **snapées aux
  centres de cellules** du plan de T1 (mêmes coordonnées que `path-input.ts`),
  boucle `repeat: -1`, stoppée au premier événement pointerdown du plateau.
- Fichier pressenti : `src/game/level-scene.ts` (overlay tutoriel) ou
  `src/game/hints.ts` — à découper en tâche dédiée (X8b ou X9), **après X3**
  (même fichier que X3).
- i18n : la phrase d'indice ("Trace un chemin du voleur à la sortie") va dans
  `src/app/i18n/fr.ts` et `en.ts`.
