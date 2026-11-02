# X8 — Kit visuel "fancy" (Perfect Crime, Gate 1)

> **Status: proposal (HYPOTHESIS partout sauf mention OBSERVED).** Design only —
> aucun changement de code dans ce kit. L'intégration est la tâche **X8b**, à lancer
> après le merge de **X3** (conflit sur `src/game/level-scene.ts`).
> Branche `x8-visual-kit`, tâche `tasks/X8.md`.

## Lecture préalable

- `AGENTS.md`, `docs/NAMING.md` (nomenclature Yap)
- `docs/UI-DESIGN.md` — règles de lisibilité non négociables (cones = cellules
  exactes, jamais de dégradé/flou/glow sur les cones), tokens visuels, asset
  guidance (Kenney UI Pack autorisé, une famille de couleur pour le primaire),
  exclusions, checklist des 10 écrans ("First launch" = main animée sur T1)
- `docs/design/experience.md` — audit d'expérience, X5 (étoiles animées au win)
- `docs/design/2026-10-30-plan-style-design.md` + `docs/design/plan-style/` —
  direction "Plan d'architecte" approuvée le 2026-10-30, qui avait écarté les
  sprites Kenney au profit de symboles dessinés en code
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
| `component-sheet.md` | Boutons primary/secondary, pills top bar, badges 💡, carte défi E4, écran win — mapping sprite Kenney ou "drawn in code" |
| `kenney-ui-integration.md` | Liste exacte des sprites Kenney UI Pack à récupérer, destination `public/assets/kenney/ui/`, plan X8b (fichiers `src/`, ordre, conflit X3) |
| `first-launch-hand.md` | Storyboard de la main animée au premier lancement de T1 |

## Point de décision produit (à trancher avant X8b)

La direction approuvée le 2026-10-30 ("Plan d'architecte") avait décidé de
**retirer** le Kenney UI Pack et les sprites personnages au profit de symboles
dessinés en code (`2026-10-30-plan-style-design.md` §2, §11). Le kit X8 "fancy"
propose au contraire de **réintégrer le Kenney UI Pack pour le chrome** (boutons,
pills, badges, étoiles) tout en gardant le plateau et les menaces dessinés en
code (règles de lisibilité). C'est un changement de direction : il doit être
validé par le product owner. Tant que la décision n'est pas prise, X8b ne démarre
pas.

## Règles non négociables conservées (docs/UI-DESIGN.md)

- Cones de garde/caméra = **cellules exactes** de `visibleCells`, teinte + contour
  net. Jamais de dégradé, flou, ombre ou **glow** sur les cones.
- Danger jamais par la couleur seule (contour + icône).
- Thème clair uniquement, polices système uniquement, cibles tactiles ≥ 44 px,
  texte essentiel ≥ 14 px, WCAG AA, `prefers-reduced-motion`, budget 3 Mo.
- Périmètre Gate 1 inchangé (pas de dark theme, éditeur, achats, etc.).
