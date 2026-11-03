// UI kit — the X8b "style tile" drawn 100% in code (task X8b-1).
//
// Product decision 2026-10-30 (docs/design/visual-kit/kenney-ui-integration.md
// §0/§2): NO Kenney UI Pack sprite is integrated. The "fancy" layer of the kit
// (docs/design/visual-kit/style-tile.md + public/design/style-tile.svg) is
// applied to code-drawn components only: rounded rect + gradient + soft shadow
// + subtle glow on the idle primary + 120 ms press + touch targets >= 44 px,
// variants primary/secondary. No asset is added (3 MB budget untouched).
//
// The board and every gameplay mark (cones, lasers, route, patrols) stay drawn
// elsewhere, exactly as docs/UI-DESIGN.md requires: nothing here may soften
// the exact-cell danger overlays — the glow exists only on the idle primary
// button, never on a cone (pinned by tests/unit/ui-kit.test.ts).
//
// Like text.ts, this module imports Phaser as type-only so the pure part (state
// machine, metrics, chrome colors, shadow/glow layers) is unit-testable in
// node; the drawing factories receive the scene/graphics they draw on. Texts
// are created through yapText/yapTextStyle only (text-guard.test.ts).
import type Phaser from 'phaser';
import { YAP_PALETTE, yapHexToInt } from './board';
import { YAP_MOTION_FAST, yapPrefersReducedMotion } from './motion';
import { yapText, yapTextStyle } from './text';

// ---------------------------------------------------------------------------
// Style-tile tokens (pure).
// ---------------------------------------------------------------------------

/** Presentation tokens of the style tile; semantic colors live in YAP_PALETTE. */
export const YAP_TILE = {
  /** Corner radius of a control (style tile: 14 px, was 8). */
  radiusControl: 14,
  /** Corner radius of a card (style tile: 18 px, was 12). */
  radiusCard: 18,
  /** Pills are fully rounded. */
  radiusPill: 999,
  /** Minimum touch target, docs/UI-DESIGN.md. */
  minTarget: 44,
  /** Press acknowledgement, docs/UI-DESIGN.md (120 ms). */
  pressMs: YAP_MOTION_FAST,
  /** Outline widths: 2 px primary, 1.5 px secondary (style tile). */
  outlinePrimary: 2,
  outlineSecondary: 1.5,
  /** Secondary outline is ink at 25%; panel outline ink at 15%. */
  outlineSecondaryAlpha: 0.25,
  outlinePanelAlpha: 0.15,
  /** Glow alpha of the idle primary (color: YAP_PALETTE['glow-primary']). */
  glowAlpha: 0.38,
  /** Soft shadow: alpha .10, dy 6 px (color: YAP_PALETTE['shadow-soft']). */
  shadowAlpha: 0.1,
  shadowDy: 6,
  /** Scale of a pressed button. */
  pressScale: 0.97,
} as const;

// ---------------------------------------------------------------------------
// Button state machine (pure).
// ---------------------------------------------------------------------------

export type YapButtonVariant = 'primary' | 'secondary';
export type YapButtonState = 'idle' | 'pressed' | 'disabled';
export type YapButtonEvent = 'down' | 'up' | 'out' | 'enable' | 'disable';

/**
 * The next button state for a pointer/lifecycle `event`. A disabled button
 * ignores pointer events and only leaves `disabled` on `enable`.
 */
export function yapButtonNextState(state: YapButtonState, event: YapButtonEvent): YapButtonState {
  switch (event) {
    case 'disable':
      return 'disabled';
    case 'enable':
      return state === 'disabled' ? 'idle' : state;
    case 'down':
      return state === 'disabled' ? 'disabled' : 'pressed';
    case 'up':
    case 'out':
      return state === 'disabled' ? 'disabled' : 'idle';
  }
}

// ---------------------------------------------------------------------------
// Button metrics and chrome (pure).
// ---------------------------------------------------------------------------

export interface YapButtonMetrics {
  readonly w: number;
  readonly h: number;
  readonly radius: number;
}

/** Button size clamped to the 44 px touch minimum, with its corner radius. */
export function yapButtonMetrics(
  w: number,
  h: number,
  radius: number = YAP_TILE.radiusControl,
): YapButtonMetrics {
  return { w: Math.max(YAP_TILE.minTarget, w), h: Math.max(YAP_TILE.minTarget, h), radius };
}

export interface YapButtonChrome {
  /** Gradient top stop (hex); equal to `bottom` for a flat fill. */
  readonly top: string;
  /** Gradient bottom stop (hex). */
  readonly bottom: string;
  readonly outline: string;
  readonly outlineWidth: number;
  readonly outlineAlpha: number;
  readonly label: string;
  readonly bold: boolean;
  /** Glow halo — idle primary only, never on danger cones. */
  readonly glow: boolean;
  readonly shadow: boolean;
}

/**
 * The colors of a button for a variant and state. Primary idle is the only
 * gradient+glow state; pressed goes flat one step darker; disabled keeps the
 * brand hue (action-primary-soft) flat, unglowed, unshadowed.
 */
export function yapButtonChrome(variant: YapButtonVariant, state: YapButtonState): YapButtonChrome {
  if (state === 'disabled') {
    return {
      top: YAP_PALETTE['action-primary-soft'],
      bottom: YAP_PALETTE['action-primary-soft'],
      outline: YAP_PALETTE['action-primary'],
      outlineWidth: YAP_TILE.outlinePrimary,
      outlineAlpha: 1,
      label: YAP_PALETTE['action-primary'],
      bold: variant === 'primary',
      glow: false,
      shadow: false,
    };
  }
  if (variant === 'primary') {
    const pressed = state === 'pressed';
    return {
      top: pressed
        ? YAP_PALETTE['action-primary-grad-end']
        : YAP_PALETTE['action-primary-grad-start'],
      bottom: YAP_PALETTE['action-primary-grad-end'],
      outline: YAP_PALETTE['action-primary-outline'],
      outlineWidth: YAP_TILE.outlinePrimary,
      outlineAlpha: 1,
      label: YAP_PALETTE['path-light'],
      bold: true,
      glow: !pressed,
      shadow: true,
    };
  }
  const pressed = state === 'pressed';
  const fill = pressed ? YAP_PALETTE.floor : YAP_PALETTE['action-secondary'];
  return {
    top: fill,
    bottom: fill,
    outline: YAP_PALETTE['text-primary'],
    outlineWidth: YAP_TILE.outlineSecondary,
    outlineAlpha: YAP_TILE.outlineSecondaryAlpha,
    label: YAP_PALETTE['text-primary'],
    bold: false,
    glow: false,
    shadow: true,
  };
}

// ---------------------------------------------------------------------------
// Shadow / glow layers (pure) — soft effects faked with stacked alpha rects,
// no texture baking (hidpi-guard forbids generateTexture outside hidpi.ts).
// ---------------------------------------------------------------------------

export interface YapShadowLayer {
  readonly dx: number;
  readonly dy: number;
  readonly alpha: number;
  /** Extra size of the layer rect, faking the blur spread. */
  readonly grow: number;
}

/**
 * The soft shadow of the style tile (rgba(32,42,51,.10), blur 18, dy 6),
 * approximated in code by stacked rounded rects of increasing offset, alpha
 * and spread — deterministic and cheap on mid-range Android.
 */
export function yapShadowLayers(
  alpha: number = YAP_TILE.shadowAlpha,
  dy: number = YAP_TILE.shadowDy,
): YapShadowLayer[] {
  return [
    { dx: 0, dy: dy / 3, alpha: alpha * 0.4, grow: 2 },
    { dx: 0, dy: (dy * 2) / 3, alpha: alpha * 0.7, grow: 5 },
    { dx: 0, dy, alpha, grow: 9 },
  ];
}

export interface YapGlowLayer {
  readonly grow: number;
  readonly alpha: number;
}

/** The subtle glow halo of the idle primary, as stacked expanding rects. */
export function yapGlowLayers(alpha: number = YAP_TILE.glowAlpha): YapGlowLayer[] {
  return [
    { grow: 12, alpha: alpha * 0.4 },
    { grow: 7, alpha: alpha * 0.65 },
    { grow: 3, alpha },
  ];
}

/** Page background gradient stops, top then bottom (vertical). */
export function yapPageGradientStops(): readonly [string, string] {
  return [YAP_PALETTE['surface-page-grad-start'], YAP_PALETTE['surface-page-grad-end']];
}

// ---------------------------------------------------------------------------
// Drawing factories (Phaser objects passed in; no runtime Phaser import).
// ---------------------------------------------------------------------------

/** Soft shadow layers at top-left (x, y), no clear — draw under the content. */
export function yapDrawShadow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  for (const layer of yapShadowLayers()) {
    g.fillStyle(yapHexToInt(YAP_PALETTE['shadow-soft']), layer.alpha).fillRoundedRect(
      x + layer.dx - layer.grow / 2,
      y + layer.dy - layer.grow / 2,
      w + layer.grow,
      h + layer.grow,
      radius + layer.grow / 2,
    );
  }
}

/** Crisp 2 px frame at top-left (x, y) — a hard outline, drawn over content. */
export function yapStrokeFrame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  g.lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1).strokeRoundedRect(x, y, w, h, radius);
}

/**
 * Draws a button's chrome into `g`, centered on (0, 0): soft shadow, glow
 * (idle primary only), gradient or flat fill, outline. The hit zone is the
 * caller's job (a zone of w x h over the same center).
 */
export function yapDrawButtonChrome(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  variant: YapButtonVariant,
  state: YapButtonState,
): void {
  const m = yapButtonMetrics(w, h);
  const c = yapButtonChrome(variant, state);
  const x = -m.w / 2;
  const y = -m.h / 2;
  g.clear();
  if (c.shadow) yapDrawShadow(g, x, y, m.w, m.h, m.radius);
  if (c.glow) {
    for (const layer of yapGlowLayers()) {
      g.fillStyle(yapHexToInt(YAP_PALETTE['glow-primary']), layer.alpha).fillRoundedRect(
        x - layer.grow,
        y - layer.grow,
        m.w + layer.grow * 2,
        m.h + layer.grow * 2,
        m.radius + layer.grow,
      );
    }
  }
  if (c.top === c.bottom) {
    g.fillStyle(yapHexToInt(c.top), 1).fillRoundedRect(x, y, m.w, m.h, m.radius);
  } else {
    g.fillGradientStyle(
      yapHexToInt(c.top),
      yapHexToInt(c.top),
      yapHexToInt(c.bottom),
      yapHexToInt(c.bottom),
      1,
    ).fillRoundedRect(x, y, m.w, m.h, m.radius);
  }
  g.lineStyle(c.outlineWidth, yapHexToInt(c.outline), c.outlineAlpha).strokeRoundedRect(
    x,
    y,
    m.w,
    m.h,
    m.radius,
  );
}

/**
 * Draws a card (panel) into `g` at top-left (x, y): soft shadow, white fill,
 * 1.5 px ink outline at 15%, radius 18 by default (style tile).
 */
export function yapDrawPanelChrome(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number = YAP_TILE.radiusCard,
): void {
  g.clear();
  yapDrawShadow(g, x, y, w, h, radius);
  g.fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
    .fillRoundedRect(x, y, w, h, radius)
    .lineStyle(1.5, yapHexToInt(YAP_PALETTE['text-primary']), YAP_TILE.outlinePanelAlpha)
    .strokeRoundedRect(x, y, w, h, radius);
}

/**
 * Draws a board-like frame into `g` at top-left (x, y): soft shadow plus a
 * crisp 2 px frame. The frame stays a hard outline — the exact-cell rule
 * applies to what is inside (draw the cells between yapDrawShadow and
 * yapStrokeFrame when the frame must sit on top of them).
 */
export function yapDrawFrameChrome(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number = YAP_TILE.radiusCard,
): void {
  g.clear();
  yapDrawShadow(g, x, y, w, h, radius);
  yapStrokeFrame(g, x, y, w, h, radius);
}

/** A full-view vertical page gradient (style tile surface-page gradient). */
export function yapPageBackground(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.Graphics {
  const [top, bottom] = yapPageGradientStops();
  const g = scene.add.graphics();
  g.fillGradientStyle(
    yapHexToInt(top),
    yapHexToInt(top),
    yapHexToInt(bottom),
    yapHexToInt(bottom),
    1,
  ).fillRect(0, 0, width, height);
  return g;
}

// ---------------------------------------------------------------------------
// Components.
// ---------------------------------------------------------------------------

export interface YapButtonOptions {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
  readonly onPress: () => void;
  /** Defaults to 'secondary'; the main action passes 'primary'. */
  readonly variant?: YapButtonVariant;
  readonly disabled?: boolean;
  /** Defaults to 20 px on primary, 16 px on secondary (>= 14 px rule). */
  readonly fontSize?: number;
}

export interface YapButton {
  readonly container: Phaser.GameObjects.Container;
  yapState(): YapButtonState;
  yapSetEnabled(enabled: boolean): void;
  yapSetLabel(label: string): void;
  destroy(): void;
}

/**
 * A button drawn in code: rounded rect + gradient (primary idle) + soft shadow
 * + glow (primary idle) + 120 ms press (flat fill, scale 0.97) + a hit zone
 * clamped to >= 44 px. `onPress` fires on pointerdown, like the scenes' current
 * buttons; the pressed look is acknowledged immediately and released on
 * pointerup/out. Everything is static under prefers-reduced-motion.
 */
export function yapButton(scene: Phaser.Scene, opts: YapButtonOptions): YapButton {
  const variant: YapButtonVariant = opts.variant ?? 'secondary';
  const metrics = yapButtonMetrics(opts.w, opts.h);
  const fontSize = opts.fontSize ?? (variant === 'primary' ? 20 : 16);
  const container = scene.add.container(opts.x, opts.y);
  const bg = scene.add.graphics();
  const zone = scene.add.zone(0, 0, metrics.w, metrics.h);
  const label = yapText(
    scene,
    0,
    0,
    opts.label,
    yapTextStyle(fontSize, YAP_PALETTE['text-primary'], {
      fontStyle: variant === 'primary' ? 'bold' : 'normal',
    }),
  ).setOrigin(0.5);
  let state: YapButtonState = opts.disabled === true ? 'disabled' : 'idle';
  let pressTween: Phaser.Tweens.Tween | null = null;

  const redraw = (): void => {
    yapDrawButtonChrome(bg, metrics.w, metrics.h, variant, state);
    label.setColor(yapButtonChrome(variant, state).label);
  };
  const animate = (scale: number): void => {
    pressTween?.stop();
    pressTween = null;
    if (yapPrefersReducedMotion()) {
      container.setScale(scale);
      return;
    }
    pressTween = scene.tweens.add({
      targets: container,
      scale,
      duration: YAP_TILE.pressMs,
      ease: 'Sine.easeOut',
    });
  };
  const release = (event: YapButtonEvent): void => {
    if (state === 'disabled') return;
    state = yapButtonNextState(state, event);
    redraw();
    animate(1);
  };

  if (state !== 'disabled') zone.setInteractive({ useHandCursor: true });
  zone.on('pointerdown', () => {
    if (state === 'disabled') return;
    state = yapButtonNextState(state, 'down');
    redraw();
    animate(YAP_TILE.pressScale);
    opts.onPress();
  });
  zone.on('pointerup', () => release('up'));
  zone.on('pointerupoutside', () => release('out'));
  zone.on('pointerout', () => release('out'));
  container.add([bg, zone, label]);
  redraw();

  return {
    container,
    yapState: () => state,
    yapSetEnabled(enabled: boolean): void {
      state = yapButtonNextState(state, enabled ? 'enable' : 'disable');
      if (state === 'disabled') {
        zone.disableInteractive();
        pressTween?.stop();
        pressTween = null;
        container.setScale(1);
      } else {
        zone.setInteractive({ useHandCursor: true });
      }
      redraw();
    },
    yapSetLabel(text: string): void {
      label.setText(text);
    },
    destroy(): void {
      pressTween?.stop();
      container.destroy();
    },
  };
}

export interface YapPillOptions {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly fontSize?: number;
}

export interface YapPill {
  readonly container: Phaser.GameObjects.Container;
  /** Outer width/height of the pill, for right-alignment by the caller. */
  readonly width: number;
  readonly height: number;
}

/**
 * A display pill (header stats: streak, stars): white, fully rounded, soft
 * shadow, bold text. Not a touch target, so it may be shorter than 44 px.
 */
export function yapPill(scene: Phaser.Scene, opts: YapPillOptions): YapPill {
  const label = yapText(
    scene,
    0,
    0,
    opts.text,
    yapTextStyle(opts.fontSize ?? 14, YAP_PALETTE['text-primary'], { fontStyle: 'bold' }),
  ).setOrigin(0.5);
  const w = label.width + 24;
  const h = 32;
  const container = scene.add.container(opts.x, opts.y);
  const bg = scene.add.graphics();
  for (const layer of yapShadowLayers()) {
    bg.fillStyle(yapHexToInt(YAP_PALETTE['shadow-soft']), layer.alpha).fillRoundedRect(
      -w / 2 - layer.grow / 2,
      -h / 2 + layer.dy - layer.grow / 2,
      w + layer.grow,
      h + layer.grow,
      YAP_TILE.radiusPill,
    );
  }
  bg.fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1).fillRoundedRect(
    -w / 2,
    -h / 2,
    w,
    h,
    YAP_TILE.radiusPill,
  );
  container.add([bg, label]);
  return { container, width: w, height: h };
}
