# X8 — Kit visuel "fancy" (Perfect Crime, Gate 1) — statut d'intégration

> Le kit design (style tile, mockups, component sheet, plan Kenney archivé) est
> sur `main` (`docs/design/visual-kit/*.md`, `public/design/*.svg`). Ce README
> trace l'implémentation côté code (tâche **X8b**, `tasks/X8b.md`).

## Décision produit (2026-11-04) — direction « plan d'architecte » partout

Le product owner a tranché le choix laissé ouvert par `style-tile.md` §6 : la
direction **« plan d'architecte »** (`docs/design/2026-10-30-plan-style-design.md`)
habille tous les écrans. L'intégration X8b-1 (`src/game/ui-kit.ts`, les tokens
dégradé/glow/or/ombre douce de `YAP_PALETTE`, l'accueil « fancy ») est
**retirée** par la passe 2/6 du plan style : l'accueil passe par
`src/game/kit.ts` (papier, encre, fiches). X8b-2 n'aura pas lieu. Ce dossier
reste une archive de la proposition.

## Décision produit actée (2026-10-30) — 100% code

Aucun sprite du **Kenney UI Pack** n'est intégré
(`kenney-ui-integration.md` §0/§2, « TRANCHÉ ») : les contrôles restent
**dessinés en code**, habillés du style tile (dégradés, ombres douces, glow
chrome, états pressés). Le plateau et les menaces restent dessinés en code
(règle absolue `docs/UI-DESIGN.md`). Aucun asset ajouté.

## Lecture préalable

- `AGENTS.md`, `docs/NAMING.md` (nomenclature Yap)
- `docs/UI-DESIGN.md` — règles de lisibilité non négociables (cones = cellules
  exactes, jamais de dégradé/flou/glow sur les cones), tokens visuels, asset
  guidance, exclusions, checklist des 10 écrans ("First launch" = main animée
  sur T1)
- `docs/design/experience.md` — audit d'expérience, X5 (étoiles animées au win)
- `docs/design/2026-10-30-plan-style-design.md` + `docs/design/plan-style/` —
  direction "Plan d'architecte" approuvée le 2026-10-30
- `src/app/brand.ts` (`YAP_CORP`) et `YAP_PALETTE` (`src/game/board.ts`)
- `public/assets/kenney/` — `thief-hitman-stand.png`, `guard-man-brown-stand.png`
  déjà présents (Kenney Top-down Shooter, CC0)

## Contenu du kit

| Fichier | Quoi |
|---|---|
| `style-tile.md` + `public/design/style-tile.svg` | Palette "fancy" (évolution de `YAP_PALETTE`), typo, formes, glow/ombres — et ce qui reste interdit (cones) |
| `public/design/mockup-home.svg` / `mockup-home-360.svg` | Maquette Home à 390×844 et 360×640 |
| `public/design/mockup-planning.svg` | Maquette Planning (level scene) à 390×844 |
| `public/design/mockup-win.svg` | Maquette Win (étoiles animées X5) à 390×844 |
| `public/design/mockup-challenge.svg` | Maquette carte défi E4 (vide central comblé) à 390×844 |
| `component-sheet.md` | Boutons primary/secondary, pills top bar, badges 💡, carte défi E4, écran win — 100% dessinés en code |
| `kenney-ui-integration.md` | Archivé : liste des sprites Kenney UI Pack (décision produit: non retenus) + plan X8b révisé "100% code" |
| `first-launch-hand.md` | Storyboard de la main animée au premier lancement de T1 |

## Règles non négociables conservées (docs/UI-DESIGN.md)

- Cones de garde/caméra = **cellules exactes** de `visibleCells`, teinte +
  contour net. Jamais de dégradé, flou, ombre ou **glow** sur les cones.
- Danger jamais par la couleur seule (contour + icône).
- Thème clair uniquement, polices système uniquement, cibles tactiles ≥ 44 px,
  texte essentiel ≥ 14 px, WCAG AA, `prefers-reduced-motion`, budget 3 Mo.
- Tout texte affiché reste dans les dictionnaires FR/EN.
- Périmètre Gate 1 inchangé (pas de dark theme, éditeur, achats, etc.).

## Statut d'implémentation (X8b)

| Tâche     | Périmètre                                                                                                                                                                        | Statut                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **X8b-1** | `YAP_PALETTE` (tokens présentation style tile) + `src/game/ui-kit.ts` (nouveau : `yapButton` + composants code, 100% code) + `home-scene.ts` migré + `tests/unit/ui-kit.test.ts` | **Mergé (#59), puis retiré** : `ui-kit.ts` et ses tokens "fancy" sont supprimés par la passe 2/6 du plan style (#60) — voir décision produit 2026-11-04 ci-dessus |
| X8b-2     | `src/game/level-scene.ts` : top bar pills, bottom bar via `yapButton`, badge 💡, overlay win ; cadre du plateau (ombre + rayon 18)                                               | **Annulé** — couvert par le plan style (3/6 plateau, 4/6 compositions, #61/#62)                                                              |
| X8b-3     | `challenge-scene.ts` (carte défi remplie, sceau en code), consent/toasts/settings                                                                                                | **Annulé** — couvert par le plan style (2/6 chrome, 4/6 compositions, #60/#62)                                                              |

Détail X8b-1 : tokens sémantiques de `YAP_PALETTE` inchangés (cones exacts,
contraste lisibilité), ajout des tokens de présentation
(`surface-page-grad-*`, `action-primary-grad-*`, `action-primary-outline`,
`glow-primary`, `accent-gold`, `shadow-soft`) ; `action-secondary` évolue
#E6E8E6 → #EDEFEA (style tile). Le glow n'existe que sur le bouton primary
idle — jamais sur les cones (pinned par `tests/unit/ui-kit.test.ts`).
