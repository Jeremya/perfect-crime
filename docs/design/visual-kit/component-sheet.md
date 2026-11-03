# X8 — Component sheet "fancy"

Mapping de chaque composant UI vers un sprite **Kenney UI Pack** (CC0) ou
**"drawn in code"**, dans le style du style tile (`style-tile.md`). Les sprites
exacts et leur destination sont listés dans `kenney-ui-integration.md`.

> Règle : le plateau et tout ce qui touche aux règles (cones, lasers, route,
> patrouilles, émetteurs, marqueurs) reste **drawn in code** — un sprite ne doit
> jamais définir la walkabilité ou la danger. Le Kenney UI Pack habille
> uniquement le **chrome** (boutons, pills, badges, étoiles, curseur).

## 1. Boutons

| Composant | Rendu "fancy" | Sprite Kenney UI Pack (v2, `PNG/<Color>/<Default|Double>/`) | Fallback code |
|---|---|---|---|
| **Primary** (PLAY, Share, Relever le défi) — hauteur 52 px, rayon 14, label mono ≥ 14 px | sprite + glow `glow-primary` (ombre portée colorée en code) + pulse 1.6 s quand actif | `Blue/Default/button_rectangle_depth_gradient.png` (état normal), `Blue/Default/button_rectangle_depth_flat.png` (pressé, 120 ms) | dégradé `#1E8296→#125862` + contour 2 px `#0E4750` |
| **Primary désactivé** (PLAY sans route) | `action-primary-soft` aplati, sans glow | `Grey/Default/button_rectangle_depth_flat.png` teinté `action-primary-soft` | à plat |
| **Secondary** (Clear, Later, Home, Tutorial, Improve my score) | `Grey/Default/button_rectangle_line.png`, contour 1.5 px ink 25 %, ombre très légère | `Grey/Default/button_rectangle_line.png` (normal), `Grey/Default/button_rectangle_flat.png` (pressé) | `#EDEFEA` + contour |
| **Bouton icône carré** (×2, Stop, son on/off) — 44×44 min | `Blue/Default/button_square_depth_gradient.png` / `Grey/..._line.png` | idem | carré 14 px rayon |
| **Bouton rond icône** (fermer bannière, pause) | `button_round_depth_gradient.png` (Blue) | idem | cercle |

- **Intention** : un seul geste (le gros bouton brillant) = l'action principale,
  le pouce trouve PLAY sans regarder.
- **Échecs** : le glow du primaire vole l'attention du plateau (voir
  style-tile §1.4) ; les sprites Kenney en famille Blue cassent la teinte
  `action-primary` #176B78 → décision : adopter la famille Blue du pack pour
  le primaire et faire évoluer le token, ou teinter le sprite (HYPOTHESIS, à
  trancher en X8b, §3 de `kenney-ui-integration.md`) ; labels trop longs à
  360 px (réduire le tracking, jamais passer sous 14 px).
- **Playtest** : preview 360×640 — tous les labels tiennent sur une ligne à
  14 px min ; 5 testeurs trouvent PLAY en < 1 s sans regarder le label.

## 2. Pills de la top bar (planning / exécution)

- **TICKS n/par**, **PAUSES k**, **TENTATIVE nº**, **compteur 07/26** :
  pill `surface-panel` + ombre `shadow-soft` + rayon 999 + texte mono 14 px
  `text-primary` ; valeur en gras.
- Sprite : aucun — **drawn in code** (texte + forme), le pack n'a pas de pill
  texte. Le pack fournit les petites icônes d'appoint : `icon_checkmark.png`,
  `icon_cross.png` (Blue ou Grey selon le contexte).
- **Intention** : les stats de la top bar flottent au-dessus du plateau sans
  le toucher (64 px, `YAP_TOP_BAR_HEIGHT`).
- **Échecs** : pill trop large à 360 px et chevauche le titre ; chiffre non
  tabulaire qui "saute" pendant l'exécution.
- **Playtest** : à 360×640, aucun chevauchement top bar / plateau ; le compteur
  de ticks reste lisible pendant l'exécution ×2.

## 3. Badges 💡 (hint C7) et marqueurs de pause

- **Badge 💡 hint** : pastille `accent-gold` #E8B23A + glow doré + emoji 💡 16 px,
  posée sur la cellule d'indice (jamais sur toute la route — la route indice
  reste en pointillés graphite, `docs/UI-DESIGN.md`).
- **Badge pause `⏸ 2`** : pill papier, contour 2 px `danger-laser`-neutre, deux
  barres + compteur mono — **drawn in code** (forme de jeu).
- Sprite : `Yellow/Default/star.png` pour l'accent doré si besoin, sinon code.
- **Intention** : l'indice se remarque sans révéler la solution.
- **Échecs** : le badge 💡 est pris pour une menace (trop saturé) ; la pause
  confondue avec un danger.
- **Playtest** : 5 testeurs distinguent 💡, pause et cone de garde en
  grayscale sur D5 (check 3 s).

## 4. Carte défi E4 — combler le vide central

Problème OBSERVED (audit 2026-10-30, `2026-10-30-plan-style-design.md` §1.5) :
la carte défi est vide aux deux tiers et "Later" chevauche la bordure.

- **Intention** : la carte défi doit être un **mémo d'affaire** plein et
  équilibré : on y lit le défi, la comparaison, et le plan scellé.
- **Solution** (voir `public/design/mockup-challenge.svg`) :
  1. header : kicker "MESSAGE REÇU · CASSE Nº 3" + titre serif/sans "Un défi d'Alex" ;
  2. **fiche mémo** (carte `surface-panel`, ombre douce, rayon 18) : phrase du
     défi en mono 14 px + **grille de comparaison You / Alex** (2 colonnes,
     leader rows pointillés : tentatives, ticks, étoiles) — sprite
     `check_square_color_checkmark.png` (Green) pour les cases cochées ;
  3. **mini-carte du casse** (petit plateau sans menaces ni route, spoiler-free)
     + faits (par, éléments) — drawn in code ;
  4. **bloc scellé** : sceau de cire (cercle `stamp` #C74747 + ombre) + "Son plan
     est sous scellés" + "OUVERT APRÈS TA RÉUSSITE OU AU 2ᵉ INDICE" — sprite
     `Red/Default/button_round_depth_border.png` comme base du sceau, texte en code ;
  5. footer : **Relever le défi** (primary, glow) + **Later** (secondary) —
     Later ne chevauche plus la carte (marge 16 px).
- **Échecs** : la carte déborde à 360×640 (masquer la mini-carte, garder
  mémo + scellé) ; le sceau rouge est pris pour un état "perdu".
- **Playtest** : preview 390×844 et 360×640 — aucun chevauchement, aucun texte
  < 14 px, 5 testeurs comprennent "le plan de l'ami est scellé" sans explication.

## 5. Écran Win — étoiles animées (X5)

- **Intention** : la cérémonie de la victoire (Angry Birds) — les étoiles
  s'allument une par une, le score "monte".
- **Solution** (voir `public/design/mockup-win.svg`) : plateau final atténué
  (~28 %) derrière une **fiche rapport** (`surface-panel`, ombre douce, rayon
  18) : kicker "RAPPORT · CASSE Nº 5", titre du niveau, leader rows
  Tentatives / Ticks / Par, puis **3 étoiles** `Yellow/Default/star.png` qui
  poppent en séquence (scale 1.6 → 1 + glow doré, 240 ms chacune, décalées de
  350 ms ; étoiles gagnées pleines, non gagnées `star_outline.png`) ; bandeau
  "À PARTAGER <ligne emoji> · N ticks ⭐⭐⭐" sous une règle en tirets.
- Footer : **Share** (primary pleine largeur, glow), puis **Améliorer mon
  score** et **Home** (secondary).
- **Échecs** : animation perçue comme lente (X5 = S, garder ≤ 1,2 s au total) ;
  `star_outline` illisible sur fond atténué ; sous `prefers-reduced-motion`,
  étoiles statiques (règle absolue).
- **Playtest** : session feel `docs/feel/` — 5 testeurs trouvent la cérémonie
  "récompensante" sans la trouver longue (keep si ≥ 4/5 et durée mesurée ≤ 1,2 s).

## 6. Récapitulatif sprite vs code

| Élément | Source |
|---|---|
| Boutons primary/secondary/icônes | Kenney UI Pack (`kenney-ui-integration.md` §2) |
| Étoiles du win, checkmarks, croix, sceau | Kenney UI Pack (familles Yellow / Green / Red) |
| Pills top bar, badges 💡/pause, toasts | drawn in code |
| Plateau, cones, lasers, route, patrouilles, émetteurs, mini-cartes | drawn in code (règle absolue) |
| Thief / guards | sprites existants `public/assets/kenney/thief-hitman-stand.png`, `guard-man-brown-stand.png` (Top-down Shooter, CC0) — inchangés par X8 |
| Main animée du premier lancement | storyboard `first-launch-hand.md` (code, ou curseur Kenney optionnel) |
