# X8 — Intégration des sprites Kenney UI Pack (plan X8b)

- **Pack** : Kenney **UI Pack** (v2), CC0 — https://kenney-assets.itch.io/ui-pack
  (430+ sprites, 5 familles de couleur, PNG en deux tailles `Default` 64 px et
  `Double` 128 px, + SVG). Noms de fichiers vérifiés sur le miroir GitHub
  `shorepine/kenney` (`ui/UI Pack/PNG/<Color>/<Default|Double>/…`).
- **Licence** : CC0, crédit optionnel ; poser `LICENSE.txt` du pack à côté des sprites.
- **Règle** (`docs/UI-DESIGN.md`) : une seule famille de couleur pour les
  actions primaires (PLAY, Share), une famille neutre pour les secondaires.
  Le plateau et les menaces restent dessinés en code.

## 0. Point de décision produit (bloquant pour X8b)

La direction approuvée le 2026-10-30 (`docs/design/2026-10-30-plan-style-design.md`
§2, §11) avait décidé de **ne pas** utiliser le Kenney UI Pack ("controls are
drawn in code instead of the Kenney UI Pack"). X8 "fancy" propose de le
réintégrer pour le chrome. **X8b ne démarre que si le product owner tranche en
faveur de "fancy"** (ou d'un mix : plateau "plan d'architecte", chrome "fancy").

## 1. Sprites exacts à récupérer et où les poser

Destination : `public/assets/kenney/ui/` (nouveau dossier, créé par X8b — X8 ne
touche pas à `public/assets/`). On ne prend que la taille `Default` (64 px,
suffisant à DPR ≤ 3 pour des contrôles de 44–52 px) — le `Double` n'est utile
que si un contrôle dépasse 128 px, ce qui n'arrive pas.

| Fichier source dans le pack | Copier vers | Rôle |
|---|---|---|
| `PNG/Blue/Default/button_rectangle_depth_gradient.png` | `public/assets/kenney/ui/button-primary.png` | bouton primary (PLAY, Share, Relever le défi) |
| `PNG/Blue/Default/button_rectangle_depth_flat.png` | `public/assets/kenney/ui/button-primary-pressed.png` | état pressé (120 ms) |
| `PNG/Grey/Default/button_rectangle_line.png` | `public/assets/kenney/ui/button-secondary.png` | bouton secondary (Clear, Later, Home, Tutorial, Improve my score) |
| `PNG/Grey/Default/button_rectangle_flat.png` | `public/assets/kenney/ui/button-secondary-pressed.png` | état pressé |
| `PNG/Blue/Default/button_square_depth_gradient.png` | `public/assets/kenney/ui/button-icon-primary.png` | boutons icône carrés (×2, Stop) |
| `PNG/Grey/Default/button_square_line.png` | `public/assets/kenney/ui/button-icon-secondary.png` | boutons icône secondaires (son, fermer) |
| `PNG/Blue/Default/button_round_depth_gradient.png` | `public/assets/kenney/ui/button-round.png` | boutons ronds (pause overlay, fermer bannière) |
| `PNG/Yellow/Default/star.png` | `public/assets/kenney/ui/star.png` | étoile gagnée (win X5, animée) |
| `PNG/Yellow/Default/star_outline.png` | `public/assets/kenney/ui/star-outline.png` | étoile non gagnée |
| `PNG/Green/Default/check_square_color_checkmark.png` | `public/assets/kenney/ui/check.png` | cases cochées (comparaison E4, jours de streak) |
| `PNG/Blue/Default/icon_checkmark.png` | `public/assets/kenney/ui/icon-checkmark.png` | toasts "Copié" |
| `PNG/Red/Default/icon_cross.png` | `public/assets/kenney/ui/icon-cross.png` | toasts d'erreur, état pris |
| `PNG/Red/Default/button_round_depth_border.png` | `public/assets/kenney/ui/seal.png` | base du sceau de cire (carte défi E4) |
| `PNG/Grey/Default/slide_horizontal_grey.png` + `PNG/Blue/Default/slide_hangle.png` | `public/assets/kenney/ui/slider-track.png`, `slider-handle.png` | sliders (volume, vibration) dans Settings |
| `PNG/Blue/Default/arrow_basic_e.png` (et `_n/_s/_w`) | `public/assets/kenney/ui/arrow-e.png` … | navigation (archive, next level) — optionnel |
| `LICENSE.txt` (racine du pack) | `public/assets/kenney/ui/LICENSE-ui-pack.txt` | licence CC0 |

Taille estimée : ~15 PNG de 64 px ≈ **30–60 Ko** au total — négligeable dans le
budget 3 Mo (OBSERVED : PNG 64 px du pack pèsent chacun ~1–4 Ko).

**Famille primaire** : Blue du pack. Conséquence : le token `action-primary`
`#176B78` (teal) ne correspond à aucune famille du pack. Deux options, à
trancher en X8b : (a) adopter le bleu du pack pour le primaire et faire évoluer
`action-primary` (prélever le hex exact sur le sprite, HYPOTHESIS ≈ #4A90D9) ;
(b) garder le teal et teinter le sprite (`setTint`) — rendu plus sombre, à
tester. Recommandation : (a), la cohérence "une famille" prime
(`docs/UI-DESIGN.md` asset guidance).

**Option main animée** : le Kenney **Cursor Pack** (CC0, pack séparé) fournit
`PNG/Basic/Default/hand_point.png` / `hand_open.png` / `hand_closed.png` —
utilisable pour la main du premier lancement (voir `first-launch-hand.md`) ;
sinon la main est dessinée en code (recommandé, cohérent avec le plateau).

## 2. Plan X8b — fichiers `src/` touchés, dans l'ordre

> **Conflit X3** : X3 (plan preview, `docs/design/experience.md` §5) touche
> `src/game/level-scene.ts`, `src/game/execution.ts`, `src/game/ghost.ts`.
> **X8b passe APRÈS le merge de X3** pour ne pas réécrire les mêmes lignes de
> `level-scene.ts`. Ne jamais merger X8b avant X3.

Ordre proposé (un PR par étape, chaque PR green sur les 5 checks) :

1. **Assets + loader** : poser les sprites dans `public/assets/kenney/ui/`,
   charger dans le boot (`src/game/level-scene.ts` `preload`, là où
   `yap-thief`/`yap-guard` sont chargés — ou mieux, un loader commun si le boot
   existe, à vérifier en X8b) + `tests/` snapshot des clés de texture.
2. **Kit de composants UI** (nouveau module, ex. `src/game/ui-kit.ts`) :
   `yapButton(scene, {x, y, w, h, label, variant: 'primary'|'secondary', onTap})`
   qui pose le sprite Kenney (9-slice via `add.nineslice`) + glow (ombre
   colorée Phaser) + press 120 ms + cible ≥ 44 px. Remplace les helpers
   boutons dispersés (audit C1 : 4 helpers `level`/`home`/`challenge`/`consent`).
   Fichiers : `src/game/ui-kit.ts` (new), puis un consommateur par scène.
3. **Home** : `src/game/home-scene.ts` — boutons Play/Share/Tutorial/Archive via
   `yapButton`, pills streak/étoiles, carte du jour avec ombre douce + rayon 18.
4. **Level scene (planning + exécution + failure)** : `src/game/level-scene.ts`
   — top bar pills, bottom bar Clear/PLAY/Hint via `yapButton`, badge 💡
   (`src/game/hints.ts` pour la pose), pause badges. **Après X3.**
5. **Win** : `src/game/level-scene.ts` (overlay win) + `src/game/win.ts` (modèle
   de timing des étoiles, X5) — étoiles `star.png` animées + Share primary.
6. **Challenge E4** : `src/game/challenge-scene.ts` — carte mémo remplie,
   comparaison, sceau `seal.png`, boutons via `yapButton`.
7. **Consent / toasts** : `src/game/consent-scene.ts` — note papier + boutons
   `yapButton` + icônes check/cross.
8. **Settings** : sliders via `slider-track.png`/`slider-handle.png`.
9. **Board** : **inchangé** — cones, lasers, route, sprites thief/guard restent
   tels quels (règles de lisibilité). Seul le *cadre* de la carte board reçoit
   l'ombre douce + rayon 18.
10. **Nettoyage** : si la direction "fancy" est confirmée, `docs/UI-DESIGN.md`
    est mis à jour (section asset guidance) dans une PR doc à part.

## 3. Garde-fous X8b

- Aucun sprite ne définit walkabilité/danger (règles `docs/UI-DESIGN.md`).
- `npm run validate && npm run test && npm run typecheck && npm run lint &&
  npm run build` green à chaque PR ; `tests/e2e/share.spec.ts` (positions PLAY
  et Share codées en dur) à mettre à jour si les boutons bougent.
- Budget 3 Mo : +~50 Ko, OK. Pas de nouvelle dépendance.
- Textes des boutons : dictionnaires FR/EN (`src/app/i18n/`) inchangés dans
  leur wording (spec).
