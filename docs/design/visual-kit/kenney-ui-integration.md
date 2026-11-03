# X8 — Kenney UI Pack : décision produit actée — **NON retenu (100% code)**

> **Décision du product owner (Jeremy), 2026-10-30 : 100% code.** La direction
> approuvée le 2026-10-30 (`docs/design/2026-10-30-plan-style-design.md` §2, §11)
> est **confirmée** : les contrôles (boutons, étoiles, toasts, sceau) restent
> **dessinés en code**, aucun sprite du Kenney UI Pack n'est intégré. Le kit
> "fancy" de X8b se limite au **style tile** (couleurs, typo, glow, ombres,
> états pressés dessinés) appliqué aux composants code existants.
>
> Le reste de ce document (liste des sprites, tailles, licence CC0) est conservé
> **à titre d'archive** : si la décision produit est réouverte plus tard, la
> liste ci-dessous est prête. Ne pas la traiter comme un plan actif.

- **Pack** : Kenney **UI Pack** (v2), CC0 — https://kenney-assets.itch.io/ui-pack
  (430+ sprites, 5 familles de couleur, PNG en deux tailles `Default` 64 px et
  `Double` 128 px, + SVG). Noms de fichiers vérifiés sur le miroir GitHub
  `shorepine/kenney` (`ui/UI Pack/PNG/<Color>/<Default|Double>/…`).
- **Licence** : CC0, crédit optionnel ; poser `LICENSE.txt` du pack à côté des sprites.
- **Règle** (`docs/UI-DESIGN.md`) : une seule famille de couleur pour les
  actions primaires (PLAY, Share), une famille neutre pour les secondaires.
  Le plateau et les menaces restent dessinés en code.

## 0. Point de décision produit — TRANCHÉ

Décision : **100% code** (voir en-tête). Conséquence pour X8b : pas de dossier
`public/assets/kenney/ui/`, pas de sprites UI ; le "fancy" vient du style tile
(dégradés, glow, ombres portées, états pressés) appliqué aux contrôles dessinés
en code.

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

## 2. Plan X8b — style tile 100% code (décision actée ci-dessus)

> X3 (plan preview) est **mergé** sur main : plus de conflit, X8b peut toucher
> `src/game/level-scene.ts` librement.

Aucun sprite UI n'est posé. X8b applique le **style tile** (`style-tile.md` +
`public/design/style-tile.svg`) aux composants **dessinés en code** existants :

1. **Tokens** : faire évoluer `YAP_PALETTE` selon le style tile (dégradés sur
   les primaires, glow doux sur les cones actifs, ombres portées sur les cartes),
   en gardant les règles de lisibilité non-négociables de `docs/UI-DESIGN.md`.
2. **Kit de composants code** (ex. `src/game/ui-kit.ts`) : `yapButton(...)` en
   dessin code (rectangle arrondi + dégradé + ombre + état pressé 120 ms +
   cible ≥ 44 px), unifiant les 4 helpers boutons dispersés (level / home /
   challenge / consent).
3. **Home** : `src/game/home-scene.ts` — boutons via `yapButton`, pills
   streak/étoiles, carte du jour avec ombre douce + rayon 18.
4. **Level scene** : `src/game/level-scene.ts` — top bar pills, bottom bar
   Clear/Preview/Hint/PLAY via `yapButton`, badge 💡, overlay win (étoiles
   dessinées animées = X5).
5. **Challenge E4** : `src/game/challenge-scene.ts` — carte remplie (combler le
   vide central), comparaison, sceau dessiné en code.
6. **Consent / toasts / settings** : mêmes composants code, icônes check/cross
   dessinées.
7. **Board** : inchangé (règles de lisibilité) — seul le cadre de la carte
   reçoit ombre douce + rayon 18.
8. **Doc** : `docs/UI-DESIGN.md` section asset guidance reste "100% code",
   aucune mise à jour nécessaire.

## 3. Garde-fous X8b

- Aucun sprite ne définit walkabilité/danger (règles `docs/UI-DESIGN.md`).
- `npm run validate && npm run test && npm run typecheck && npm run lint &&
  npm run build` green à chaque PR ; `tests/e2e/share.spec.ts` (positions PLAY
  et Share codées en dur) à mettre à jour si les boutons bougent.
- Budget 3 Mo : +~50 Ko, OK. Pas de nouvelle dépendance.
- Textes des boutons : dictionnaires FR/EN (`src/app/i18n/`) inchangés dans
  leur wording (spec).
