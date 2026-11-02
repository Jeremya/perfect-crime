// Tests for the X8b UI kit's pure logic (style tile 100% code — no sprites).
//
// src/game/ui-kit.ts draws the chrome (buttons, cards, pills, page gradient)
// in code: rounded rect + gradient + soft shadow + 120 ms press + >= 44 px
// targets, variants primary/secondary. Only the pure part is unit-testable in
// node (the module imports Phaser as type-only, like text.ts): the state
// machine, the size clamping, the per-state chrome colors and the shadow/glow
// layers. The readability rules of docs/UI-DESIGN.md are pinned here: the
// label contrast of every button state, and the fact that the glow exists only
// on the idle primary — never on the board's danger cones.
import { describe, expect, it } from 'vitest';
import { YAP_PALETTE } from '../../src/game/board';
import {
  YAP_TILE,
  yapButtonChrome,
  yapButtonMetrics,
  yapButtonNextState,
  yapGlowLayers,
  yapPageGradientStops,
  yapShadowLayers,
  type YapButtonEvent,
  type YapButtonState,
  type YapButtonVariant,
} from '../../src/game/ui-kit';

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const VARIANTS: readonly YapButtonVariant[] = ['primary', 'secondary'];
const STATES: readonly YapButtonState[] = ['idle', 'pressed', 'disabled'];

describe('YAP_TILE — the style-tile tokens (docs/design/visual-kit/style-tile.md)', () => {
  it('uses radius 14 for controls and 18 for cards', () => {
    expect(YAP_TILE.radiusControl).toBe(14);
    expect(YAP_TILE.radiusCard).toBe(18);
    expect(YAP_TILE.radiusPill).toBe(999);
  });

  it('acknowledges a press in 120 ms and keeps 44 px touch targets', () => {
    // docs/UI-DESIGN.md: 120 ms press acknowledgement, targets >= 44 x 44 px
    expect(YAP_TILE.pressMs).toBe(120);
    expect(YAP_TILE.minTarget).toBe(44);
  });
});

describe('yapButtonMetrics — the touch target is never below 44 px', () => {
  it('clamps both sides to the 44 px minimum', () => {
    expect(yapButtonMetrics(20, 30)).toEqual({ w: 44, h: 44, radius: YAP_TILE.radiusControl });
  });

  it('keeps larger sizes and applies the control radius by default', () => {
    expect(yapButtonMetrics(358, 52)).toEqual({ w: 358, h: 52, radius: 14 });
  });

  it('accepts a custom radius (cards use 18)', () => {
    expect(yapButtonMetrics(100, 80, YAP_TILE.radiusCard).radius).toBe(18);
  });
});

describe('yapButtonNextState — the button state machine', () => {
  const cases: readonly [YapButtonState, YapButtonEvent, YapButtonState][] = [
    ['idle', 'down', 'pressed'],
    ['pressed', 'up', 'idle'],
    ['pressed', 'out', 'idle'],
    ['idle', 'up', 'idle'],
    ['idle', 'out', 'idle'],
    ['idle', 'disable', 'disabled'],
    ['pressed', 'disable', 'disabled'],
    ['disabled', 'down', 'disabled'],
    ['disabled', 'up', 'disabled'],
    ['disabled', 'out', 'disabled'],
    ['disabled', 'enable', 'idle'],
    ['idle', 'enable', 'idle'],
  ];

  it('follows the transition table', () => {
    for (const [state, event, next] of cases) {
      expect(yapButtonNextState(state, event), `${state} + ${event}`).toBe(next);
    }
  });

  it('a disabled button never leaves the disabled state on pointer events', () => {
    for (const event of ['down', 'up', 'out'] as const) {
      expect(yapButtonNextState('disabled', event)).toBe('disabled');
    }
  });
});

describe('yapButtonChrome — primary / secondary variants, per state', () => {
  it('primary idle is a gradient with the brand outline, glow and shadow', () => {
    const c = yapButtonChrome('primary', 'idle');
    expect(c.top).toBe(YAP_PALETTE['action-primary-grad-start']);
    expect(c.bottom).toBe(YAP_PALETTE['action-primary-grad-end']);
    expect(c.top).not.toBe(c.bottom);
    expect(c.outline).toBe(YAP_PALETTE['action-primary-outline']);
    expect(c.outlineWidth).toBe(2);
    expect(c.outlineAlpha).toBe(1);
    expect(c.label).toBe(YAP_PALETTE['path-light']);
    expect(c.bold).toBe(true);
    expect(c.glow).toBe(true);
    expect(c.shadow).toBe(true);
  });

  it('primary pressed goes flat (no gradient, no glow) — the 120 ms press state', () => {
    const c = yapButtonChrome('primary', 'pressed');
    expect(c.top).toBe(c.bottom);
    expect(c.top).toBe(YAP_PALETTE['action-primary-grad-end']);
    expect(c.glow).toBe(false);
    expect(c.shadow).toBe(true);
    expect(c.label).toBe(YAP_PALETTE['path-light']);
  });

  it('disabled keeps the brand hue (soft fill, primary label), flat and unglowed', () => {
    for (const variant of VARIANTS) {
      const c = yapButtonChrome(variant, 'disabled');
      expect(c.top).toBe(YAP_PALETTE['action-primary-soft']);
      expect(c.top).toBe(c.bottom);
      expect(c.label).toBe(YAP_PALETTE['action-primary']);
      expect(c.glow).toBe(false);
      expect(c.shadow).toBe(false);
    }
  });

  it('secondary idle is a flat light fill with a 1.5 px ink outline at 25%', () => {
    const c = yapButtonChrome('secondary', 'idle');
    expect(c.top).toBe(YAP_PALETTE['action-secondary']);
    expect(c.top).toBe(c.bottom);
    expect(c.outline).toBe(YAP_PALETTE['text-primary']);
    expect(c.outlineWidth).toBe(1.5);
    expect(c.outlineAlpha).toBe(0.25);
    expect(c.label).toBe(YAP_PALETTE['text-primary']);
    expect(c.bold).toBe(false);
    expect(c.glow).toBe(false);
    expect(c.shadow).toBe(true);
  });

  it('secondary pressed darkens one step, still no glow', () => {
    const c = yapButtonChrome('secondary', 'pressed');
    expect(c.top).toBe(c.bottom);
    expect(c.top).toBe(YAP_PALETTE.floor);
    expect(c.glow).toBe(false);
  });

  it('the label stays readable (WCAG AA) in every variant and state', () => {
    for (const variant of VARIANTS) {
      for (const state of STATES) {
        const c = yapButtonChrome(variant, state);
        // regular-text threshold against the darkest stop of the fill
        expect(contrast(c.label, c.bottom), `${variant}/${state} vs bottom`).toBeGreaterThanOrEqual(
          4.5,
        );
        // the label is bold >= 16 px (large text, 3:1) against the lightest stop
        expect(contrast(c.label, c.top), `${variant}/${state} vs top`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the glow exists only on the idle primary — never on cones or secondary', () => {
    // docs/UI-DESIGN.md: no glow on the danger overlays; the glow is chrome-only
    for (const variant of VARIANTS) {
      for (const state of STATES) {
        expect(yapButtonChrome(variant, state).glow).toBe(
          variant === 'primary' && state === 'idle',
        );
      }
    }
  });

  it('the chrome never reuses a danger token (cones stay exact-cell overlays)', () => {
    const danger = [
      YAP_PALETTE['danger-guard'],
      YAP_PALETTE['danger-camera'],
      YAP_PALETTE['danger-laser'],
    ];
    for (const variant of VARIANTS) {
      for (const state of STATES) {
        const c = yapButtonChrome(variant, state);
        expect(danger).not.toContain(c.top);
        expect(danger).not.toContain(c.bottom);
        expect(danger).not.toContain(c.outline);
        expect(danger).not.toContain(c.label);
      }
    }
  });
});

describe('yapShadowLayers — the soft shadow is layered, never a hard offset', () => {
  it('stacks layers of increasing offset, alpha and spread', () => {
    const layers = yapShadowLayers();
    expect(layers.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < layers.length; i += 1) {
      const prev = layers[i - 1];
      const cur = layers[i];
      expect(cur).toBeDefined();
      expect(prev).toBeDefined();
      if (prev === undefined || cur === undefined) continue;
      expect(cur.dy).toBeGreaterThan(prev.dy);
      expect(cur.alpha).toBeGreaterThan(prev.alpha);
      expect(cur.grow).toBeGreaterThan(prev.grow);
    }
  });

  it('stays within the style-tile shadow (alpha .10, dy 6 px)', () => {
    const layers = yapShadowLayers();
    const last = layers[layers.length - 1];
    expect(last?.dy).toBe(YAP_TILE.shadowDy);
    for (const layer of layers) {
      expect(layer.alpha).toBeLessThanOrEqual(YAP_TILE.shadowAlpha);
      expect(layer.alpha).toBeGreaterThan(0);
    }
  });
});

describe('yapGlowLayers — the subtle primary glow', () => {
  it('spreads outward with decreasing alpha, within the glow token alpha', () => {
    const layers = yapGlowLayers();
    expect(layers.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < layers.length; i += 1) {
      const prev = layers[i - 1];
      const cur = layers[i];
      expect(cur).toBeDefined();
      expect(prev).toBeDefined();
      if (prev === undefined || cur === undefined) continue;
      // faintest at the outer edge: grow shrinks inward, alpha grows inward
      expect(cur.grow).toBeLessThan(prev.grow);
      expect(cur.alpha).toBeGreaterThan(prev.alpha);
    }
    for (const layer of layers) {
      expect(layer.alpha).toBeLessThanOrEqual(YAP_TILE.glowAlpha);
      expect(layer.alpha).toBeGreaterThan(0);
    }
  });
});

describe('yapPageGradientStops — the page background gradient', () => {
  it('goes from the light start to the darker end of the page token pair', () => {
    const [top, bottom] = yapPageGradientStops();
    expect(top).toBe(YAP_PALETTE['surface-page-grad-start']);
    expect(bottom).toBe(YAP_PALETTE['surface-page-grad-end']);
    expect(luminance(top)).toBeGreaterThan(luminance(bottom));
  });
});

describe('YAP_PALETTE — X8b adds presentation tokens, semantics untouched', () => {
  it('keeps every semantic token of docs/UI-DESIGN.md at its readable value', () => {
    // the exact-cell danger overlays and the board tokens are gameplay
    // information: the style tile must not move them (docs/UI-DESIGN.md)
    expect(YAP_PALETTE['surface-page']).toBe('#F4F2ED');
    expect(YAP_PALETTE['surface-panel']).toBe('#FFFFFF');
    expect(YAP_PALETTE.floor).toBe('#D9D8D2');
    expect(YAP_PALETTE.wall).toBe('#47515B');
    expect(YAP_PALETTE['danger-guard']).toBe('#D99B32');
    expect(YAP_PALETTE['danger-camera']).toBe('#8260A8');
    expect(YAP_PALETTE['danger-laser']).toBe('#C74747');
    expect(YAP_PALETTE['action-primary']).toBe('#176B78');
    expect(YAP_PALETTE['action-primary-soft']).toBe('#D7E6E8');
    expect(YAP_PALETTE['objective-diamond']).toBe('#007F8D');
    expect(YAP_PALETTE['objective-exit']).toBe('#32865A');
  });

  it('adds the style-tile presentation tokens (gradient, glow, shadow, gold)', () => {
    expect(YAP_PALETTE['surface-page-grad-start']).toBe('#F7F5F0');
    expect(YAP_PALETTE['surface-page-grad-end']).toBe('#ECE8DD');
    expect(YAP_PALETTE['action-primary-grad-start']).toBe('#1E8296');
    expect(YAP_PALETTE['action-primary-grad-end']).toBe('#125862');
    expect(YAP_PALETTE['action-primary-outline']).toBe('#0E4750');
    expect(YAP_PALETTE['glow-primary']).toBe('#176B78');
    expect(YAP_PALETTE['accent-gold']).toBe('#E8B23A');
    expect(YAP_PALETTE['shadow-soft']).toBe('#202A33');
  });
});
