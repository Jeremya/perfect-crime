# [X8b] Style tile 100% code — intégration du kit X8 (pas de sprites Kenney UI)

- **Epic**: X — post-Gate-1 experience (docs/design/experience.md) · **Role**: Dev · **Estimate**: M
- **Depends on**: X8 (kit visuel, branche `x8-visual-kit`) · X3 (mergé, pas de conflit) · **Branch**: `x8b-style-tile` · **PR**: `[X8b-1] Style tile 100% code: tokens + ui-kit + Home`
- **Status**: X8b-1 Done (merged #59), then retired by the product call of 2026-11-04 (plan style 2/6, #60). X8b-2 and X8b-3 cancelled — the plan style covers those screens.

## Décision produit actée (2026-10-30, product owner)

**100% code** — aucun sprite du Kenney UI Pack n'est intégré
(`docs/design/visual-kit/kenney-ui-integration.md` §0/§2, en-tête « TRANCHÉ »).
Le kit X8 « fancy » s'applique aux composants **dessinés en code** : dégradés,
ombres douces, glow chrome, états pressés. Aucun asset ajouté (budget 3 Mo
inchangé), aucune dépendance ajoutée.

## Règles non négociables conservées (docs/UI-DESIGN.md)

- Cones de garde/caméra = **cellules exactes** de `visibleCells`, teinte +
  contour net. Jamais de dégradé/flou/ombre/**glow** sur les cones — le glow
  existe uniquement sur le bouton primary idle (pinned par
  `tests/unit/ui-kit.test.ts`).
- Danger jamais par la couleur seule (contour + icône).
- Thème clair, polices système, cibles tactiles ≥ 44 px, texte essentiel
  ≥ 14 px, WCAG AA, `prefers-reduced-motion`, budget 3 Mo.
- Tout texte affiché reste dans les dictionnaires FR/EN (`src/app/i18n/`) —
  X8b n'ajoute aucune chaîne.

## X8b-1 — tokens + kit de composants code + Home (FAIT, branche `x8b-style-tile`)

### Ownership — create/edit only these files

- `src/game/board.ts` — `YAP_PALETTE` uniquement : tokens sémantiques
  inchangés (sauf `action-secondary` #E6E8E6 → #EDEFEA, évolution style tile),
  ajout des tokens de présentation (`surface-page-grad-*`,
  `action-primary-grad-*`, `action-primary-outline`, `glow-primary`,
  `accent-gold`, `shadow-soft`)
- `src/game/ui-kit.ts` (new) — `yapButton(...)` + composants communs dessinés
  en code : rectangle arrondi + dégradé + ombre douce + press 120 ms + cible
  ≥ 44 px, variants `primary`/`secondary` (+ état `disabled`) ; `yapPill`,
  `yapDrawPanelChrome` (carte ombre + rayon 18), `yapDrawFrameChrome` /
  `yapDrawShadow` / `yapStrokeFrame`, `yapPageBackground` (fond dégradé).
  Partie pure (machine à états, métriques, couleurs, couches ombre/glow)
  testable en node — import Phaser en `type` uniquement, textes via
  `yapText`/`yapTextStyle` (guards text/hidpi respectés)
- `src/game/home-scene.ts` — migré vers ui-kit : fond dégradé, pills
  streak/étoiles dans le header, carte du jour (ombre douce + rayon 18),
  boutons Play/Share/Archive/Tutorial via `yapButton`, lignes d'archive en
  chrome secondary, mini-carte encadrée (ombre + frame 2 px radius 18)
- `tests/unit/ui-kit.test.ts` (new) — logique pure : table de transitions,
  clamp 44 px, chrome par variant/état (contraste WCAG AA du label, glow
  uniquement sur primary idle, aucun token danger dans le chrome), couches
  ombre/glow, tokens YAP_PALETTE (sémantique inchangés)
- `tasks/X8b.md` (this file)
- `docs/design/visual-kit/README.md` — statut X8b-1 marqué fait

**Not touched**: `src/app/i18n/*` (aucun nouveau texte), `src/game/level-scene.ts`
(réservé à X8b-2), `src/game/challenge-scene.ts`, `src/game/consent-scene.ts`,
`public/assets/**` (aucun sprite UI), `levels/**`.

### Acceptance criteria (X8b-1)

- `tests/unit/ui-kit.test.ts` vert : états du bouton, tailles ≥ 44 px, press
  120 ms, contraste label ≥ 4.5:1 (fond sombre) / ≥ 3:1 (fond clair, label
  bold ≥ 16 px), glow seulement sur primary idle, tokens sémantiques de
  `YAP_PALETTE` inchangés.
- Home migré : boutons via `yapButton`, carte via `yapDrawPanelChrome`, fond
  via `yapPageBackground` ; textes 100% i18n (aucune chaîne ajoutée).
- Aucun asset ajouté : `git diff --stat` ne touche pas `public/assets/`.
- Full local check green : `npm run typecheck && npm run lint && npm run test && npm run validate && npm run build`.

## X8b-2 — Level scene (RÉSERVÉ, branche suivante — ne PAS faire ici)

`src/game/level-scene.ts` : top bar pills, bottom bar Clear/Preview/Hint/PLAY
via `yapButton`, badge 💡, overlay win ; le plateau reste inchangé (règles de
lisibilité), seul le cadre de la carte reçoit ombre douce + rayon 18.
Puis X8b-3 : `challenge-scene.ts` (carte défi remplie, sceau en code) et
consent/toasts/settings.

## Definition of done

- PR `[X8b-1] Style tile 100% code: tokens + ui-kit + Home` open on
  `x8b-style-tile`, CI green, **never merged by the agent** ("NE PAS merger").
