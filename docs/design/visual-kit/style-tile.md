# X8 — Style tile "fancy"

- **Fichier visuel** : `mockups/style-tile.svg`
- **Base** : `YAP_PALETTE` (`src/game/board.ts`) + tokens de `docs/UI-DESIGN.md`
- **Status** : HYPOTHESIS (direction proposée, jamais encore vue in-game)

## 1. Intention, solution, échecs, playtest (format skill)

1. **Game intention** — que le jeu ait l'air d'un produit mobile soigné, pas d'un
   prototype : profondeur douce (ombres portées), surfaces vivantes (dégradés
   discrets), et un bouton d'action principal qui "brille" légèrement pour
   attirer le pouce. Le plateau, lui, reste un document lisible : le "fancy" va
   au chrome, jamais à la lisibilité du danger.
2. **Expected solution / behavior** — évolution de `YAP_PALETTE` : les tokens
   sémantiques existants gardent leur valeur (ou une valeur très proche) ;
   on ajoute des tokens de *présentation* (dégradés, ombre, glow, rayon) qui
   s'appliquent aux fonds de page, panneaux, boutons, pills et badges. Les
   cones de danger restent des cellules exactes teintées avec contour net —
   **aucun glow sur les cones** (règle non négociable de `docs/UI-DESIGN.md` :
   "never smooth, triangular, gradient, blurred, shadowed, or glowing cones").
   La demande initiale "glow sur les cones" est donc **refusée explicitement** ;
   remplacée par une variante motion optionnelle (impulsion d'opacité du
   contour du cone, §5) qui garde le remplissage et le contour exacts.
3. **Possible failure modes** — (a) le glow du bouton principal attire l'œil
   au détriment de la lecture du plateau en 3 s ; (b) les dégradés de page
   créent des bandes visibles sur certains écrans OLED ; (c) l'ombre douce
   sous les cartes alourdit le rendu sur Android milieu de gamme (jank) ;
   (d) un rayon trop grand fait "jouet" et contredit le ton braquage ;
   (e) l'impulsion de contour des cones est perçue comme un glow et dégrade
   la règle "pas de couleur seule" si l'icône manque.
4. **Playtest criterion** — capture d'écran du PR preview à 390×844 @DPR3 et
   360×640 @DPR2 (test le plus cheap qui décide, §3 du skill) : check grayscale
   + lecture 3 s sur D5/D7 (un joueur identifie cellules marchables, route,
   chaque menace active en ≤ 3 s), et check "le premier regard va-t-il au
   plateau ou au bouton ?" avec 5 testeurs (session `docs/feel/`). Keep si
   lecture 3 s conservée et ≥ 4/5 testeurs jugent le bouton principal
   "attrayant sans gêner".

## 2. Palette — évolution "fancy" de `YAP_PALETTE`

Les tokens sémantiques de `YAP_PALETTE` restent la base. Les valeurs "fancy"
ci-dessous sont des propositions de rendu (dégradés/ombres), pas de nouveaux
tokens sémantiques — sauf mention contraire, `src/game/board.ts` n'est pas
modifié par X8.

| Token | Valeur de base (YAP_PALETTE) | Évolution "fancy" proposée | Portée |
|---|---|---|---|
| `surface-page` | `#F4F2ED` | dégradé vertical `#F7F5F0` → `#ECE8DD` (token dérivé `surface-page-grad-end`) | fond de page, shell `index.html` |
| `surface-panel` | `#FFFFFF` | `#FFFFFF` + ombre douce `rgba(32,42,51,.10)` blur 18, y 6 + rayon 16 px (cartes) | cartes, panneaux, pills |
| `floor` | `#D9D8D2` | inchangé (lisibilité) | cellules marchables |
| `wall` | `#47515B` | inchangé | murs |
| `wall-detail` | `#77818A` | inchangé | détail des murs |
| `grid-line` | `#6F767B` | inchangé (3.2:1 sur le floor) | bordures de cellules |
| `text-primary` | `#202A33` | inchangé | texte principal |
| `text-secondary` | `#56616B` | inchangé | texte secondaire |
| `action-primary` | `#176B78` | dégradé de bouton `#1E8296` → `#125862` + **glow** `rgba(23,107,120,.38)` blur 14 (token dérivé `glow-primary`) ; en X8b, le remplissage vient du sprite Kenney (famille Blue) — voir `kenney-ui-integration.md` | PLAY, Share principal, "Relever le défi" |
| `action-secondary` | `#E6E8E6` | `#EDEFEA` + contour 1.5 px `rgba(32,42,51,.25)` + ombre très légère | Clear, Later, Home, Tutorial |
| `action-primary-soft` | `#D7E6E8` | inchangé (désactivé garde la teinte marque) | PLAY désactivé |
| `danger-guard` | `#D99B32` (fill ~30 %) | **inchangé** — cellule exacte, pas de glow | cones de garde |
| `danger-guard-outline` | `#8A5600` (dans le code ; `#D99B32` est la teinte) | contour 2 px net, impulsion d'opacité optionnelle 1 → .55 → 1 (1,2 s, désactivée sous `prefers-reduced-motion`) — HYPOTHESIS, §5 | cones de garde |
| `danger-camera` | `#8260A8` | inchangé + contour net | cones caméra |
| `danger-laser` | `#C74747` | inchangé | laser actif, état pris |
| `laser-off` | `#69727B` | inchangé (tirets) | laser inactif |
| `objective-diamond` | `#007F8D` | inchangé | diamant |
| `objective-exit` | `#32865A` | inchangé | sortie |
| `path-light` / `path-outline` | `#FFFFFF` / `#26313B` | inchangé (ligne épaisse, caps ronds) | route tracée |
| *(nouveau)* `accent-gold` | — | `#E8B23A` + glow `rgba(232,178,58,.45)` | étoiles (X5), badge 💡, streak 🔥 | chrome uniquement |
| *(nouveau)* `shadow-soft` | — | `rgba(32,42,51,.10)`, blur 18, y 6 | cartes, panneaux | chrome uniquement |
| *(nouveau)* `radius-control` / `radius-card` | 8 / 12 px (`UI-DESIGN.md`) | 14 / 18 px | boutons / cartes | chrome uniquement |

**Ce qui reste strictement interdit** (hérité de `docs/UI-DESIGN.md`) : glow,
flou, ombre, dégradé sur les cones de danger et tout effet qui adoucit la
frontière des cellules visibles ; thème sombre ; police web ; décoration sur
les cellules marchables.

## 3. Typographie

- Polices système uniquement (`docs/UI-DESIGN.md`) : stack sans-serif système
  pour le corps ; la direction "plan d'architecte" (2026-10-30) avait proposé
  serif + mono — **X8 fancy garde le sans-serif système** pour rester lisible
  à 14 px sur Android, avec graisse 600–700 pour les titres et labels de
  boutons. HYPOTHESIS : à confirmer en preview (les deux directions partagent
  la contrainte "system fonts only").
- Échelle de type `12 / 14 / 16 / 20 / 24 / 32 px` inchangée ; labels de
  boutons et texte essentiel ≥ 14 px ; kickers décoratifs 12 px autorisés.
- Boutons : label en capitales, tracking 0.08 em, mono tabulaire pour les
  chiffres (ticks, par, countdown).

## 4. Formes, ombres, motion

- Rayons : boutons 14 px, cartes 18 px, pills 999 px, badges 10 px.
- Ombre douce `shadow-soft` sur cartes et panneaux ; **ombre dure interdite**
  sur le plateau (le plateau reste une carte à frame net 2 px + ombre douce
  de carte, 6 px d'inset de page — `docs/UI-DESIGN.md` "Board and world
  rendering").
- Glow `glow-primary` réservé au bouton principal actif et aux étoiles ; jamais
  sur le plateau.
- Motion : 120 ms accusé de pression, 180 ms entrée (fade + rise 12 px)
  inchangés ; ajout d'un "pulse" doux (scale 1 → 1.03 → 1, 1,6 s) sur le bouton
  PLAY quand la route atteint la sortie — HYPOTHESIS ; tout statique sous
  `prefers-reduced-motion`.

## 5. Variante motion des cones (remplace le "glow sur les cones" demandé)

- **Intention** : donner au danger un côté "vivant" sans jamais flouter les
  cellules exactes.
- **Solution** : le remplissage teinté et le contour 2 px restent exacts ; seule
  l'opacité du contour pulse (1 → 0.55 → 1 sur 1,2 s, ease-in-out), désactivée
  sous `prefers-reduced-motion`. Aucun blur, aucun halo.
- **Échecs** : perçu comme un glow → viol de la règle non négociable ; fatigue
  visuelle sur les niveaux chargés (D7) ; confondu avec l'état "pris".
- **Playtest** : preview 390×844, D5 et D7, check grayscale + 3 s read avec 5
  testeurs ; keep si aucun testeur ne décrit les cones comme "flous/glow" et
  si la lecture 3 s tient. Sinon, on reste sur le contour statique (état actuel).

## 6. Plan d'architecte vs fancy

La direction approuvée 2026-10-30 (`2026-10-30-plan-style-design.md`) visait
"épuré, classe" avec symboles dessinés en code et **sans** Kenney UI Pack. X8
"fancy" ajoute la couche de présentation (dégradés, ombres douces, glow chrome,
sprites Kenney UI pour les contrôles) par-dessus les règles de lisibilité
identiques. **Décision produit requise** : "plan d'architecte" (déjà approuvé)
ou "fancy" (ce kit) — ou un mix (plan d'architecte pour le plateau, fancy pour
le chrome, ce que recommande ce kit). Voir `kenney-ui-integration.md` §1.
