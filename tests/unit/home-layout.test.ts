import { describe, expect, it } from 'vitest';
import { YAP_BUTTON_HEIGHT } from '../../src/game/kit';
import { YAP_HOME_ROW_MAX_WIDTH, yapHomeActions } from '../../src/game/home-layout';

describe('yapHomeActions — the bottom third of Home', () => {
  it('puts the primary action lowest, 16 px above the bottom', () => {
    const actions = yapHomeActions(390, 844, 0);
    expect(actions.primary).toEqual({ x: 16, width: 358 });
    expect(actions.primaryY + YAP_BUTTON_HEIGHT / 2).toBe(844 - 16);
    expect(actions.secondary).toEqual([]);
    expect(actions.top).toBe(actions.primaryY - YAP_BUTTON_HEIGHT / 2);
  });

  it('splits the secondary row equally above it, 12 px apart', () => {
    const actions = yapHomeActions(360, 640, 3);
    expect(actions.secondary).toHaveLength(3);
    expect(actions.secondaryY + YAP_BUTTON_HEIGHT / 2 + 12).toBe(
      actions.primaryY - YAP_BUTTON_HEIGHT / 2,
    );
    const [first, , last] = actions.secondary;
    expect(first?.x).toBe(16);
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBe(360 - 16);
    for (const box of actions.secondary) {
      expect(box.width).toBeCloseTo((328 - 16) / 3);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(actions.top).toBe(actions.secondaryY - YAP_BUTTON_HEIGHT / 2);
  });

  it('centres a row no wider than 420 px on a wide view', () => {
    const actions = yapHomeActions(800, 900, 2);
    expect(YAP_HOME_ROW_MAX_WIDTH).toBe(420);
    expect(actions.primary).toEqual({ x: 190, width: 420 });
    expect(actions.secondary[0]?.x).toBe(190);
    expect((actions.secondary[1]?.x ?? 0) + (actions.secondary[1]?.width ?? 0)).toBe(610);
  });
});
