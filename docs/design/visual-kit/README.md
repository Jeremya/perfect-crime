# X8 — Kit visuel "fancy" (Perfect Crime, Gate 1) — statut d'intégration

> Le kit design (style tile, mockups, component sheet, plan Kenney archivé)
> vit sur la branche `x8-visual-kit` (`docs/design/visual-kit/*.md`,
> `public/design/*.svg`) en attendant son merge sur `main`. Ce README trace
> l'implémentation côté code (tâche **X8b**, `tasks/X8b.md`).

## Décision produit actée (2026-10-30) — 100% code

Aucun sprite du **Kenney UI Pack** n'est intégré
(`kenney-ui-integration.md` §0/§2, « TRANCHÉ » sur branche `x8-visual-kit`) :
les contrôles restent **dessinés en code**, habillés du style tile (dégradés,
ombres douces, glow chrome, états pressés). Le plateau et les menaces restent
dessinés en code (règle absolue `docs/UI-DESIGN.md`). Aucun asset ajouté.

## Règles non négociables conservées (docs/UI-DESIGN.md)

- Cones de garde/caméra = **cellules exactes** de `visibleCells`, teinte +
  contour net. Jamais de dégradé, flou, ombre ou **glow** sur les cones.
- Danger jamais par la couleur seule (contour + icône).
- Thème clair uniquement, polices système uniquement, cibles tactiles ≥ 44 px,
  texte essentiel ≥ 14 px, WCAG AA, `prefers-reduced-motion`, budget 3 Mo.
- Tout texte affiché reste dans les dictionnaires FR/EN.

## Statut d'implémentation (X8b)

| Tâche     | Périmètre                                                                                                                                                                        | Statut                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **X8b-1** | `YAP_PALETTE` (tokens présentation style tile) + `src/game/ui-kit.ts` (nouveau : `yapButton` + composants code, 100% code) + `home-scene.ts` migré + `tests/unit/ui-kit.test.ts` | **FAIT** — branche `x8b-style-tile`, PR `[X8b-1] Style tile 100% code: tokens + ui-kit + Home` (CI green, en revue humaine, ne pas merger) |
| X8b-2     | `src/game/level-scene.ts` : top bar pills, bottom bar via `yapButton`, badge 💡, overlay win ; cadre du plateau (ombre + rayon 18)                                               | À faire (réservé)                                                                                                                          |
| X8b-3     | `challenge-scene.ts` (carte défi remplie, sceau en code), consent/toasts/settings                                                                                                | À faire (réservé)                                                                                                                          |

Détail X8b-1 : tokens sémantiques de `YAP_PALETTE` inchangés (cones exacts,
contraste lisibilité), ajout des tokens de présentation
(`surface-page-grad-*`, `action-primary-grad-*`, `action-primary-outline`,
`glow-primary`, `accent-gold`, `shadow-soft`) ; `action-secondary` évolue
#E6E8E6 → #EDEFEA (style tile). Le glow n'existe que sur le bouton primary
idle — jamais sur les cones (pinned par `tests/unit/ui-kit.test.ts`).
