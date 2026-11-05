// Draws a plan through YapPathInput, the state machine behind the player's
// finger (story B4). The solver and the simulation accept plans the route
// input cannot produce, so the build gate proves a level can be won by going
// through the same input as the game: one stroke along the route, lifted to
// tap each pause before the route can come back over that cell.
import type { YapCell, YapDir, YapLevel } from '../src/core/level';
import type { YapPlan } from '../src/core/sim';
import { yapCellCenter, yapLevelLayout } from '../src/game/board';
import { YapPathInput } from '../src/game/path-input';

/** A phone-sized view: the input's rules do not depend on it. */
const YAP_DRAW_VIEW = { width: 360, height: 640 } as const;

const YAP_DIR_STEP: Readonly<Record<YapDir, YapCell>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/**
 * The plan that comes out of the route input once `plan` has been drawn on
 * `level`, or null when PLAY stays off (the route never finished).
 */
export function drawPlan(level: YapLevel, plan: YapPlan): YapPlan | null {
  const layout = yapLevelLayout(YAP_DRAW_VIEW.width, YAP_DRAW_VIEW.height, level);
  const input = new YapPathInput(level, layout, { ghost: false });
  const point = (cell: YapCell): { x: number; y: number } => yapCellCenter(layout, cell);
  let now = 0;
  let at: YapCell = level.start;
  let pauses = 0;

  const press = (cell: YapCell): void => {
    const p = point(cell);
    input.yapPointerDown(p.x, p.y, now);
  };
  const release = (cell: YapCell): void => {
    const p = point(cell);
    now += 1;
    input.yapPointerUp(p.x, p.y, now);
  };

  press(at);
  for (const move of plan) {
    if (move === 'wait') {
      pauses += 1;
      continue;
    }
    const step = YAP_DIR_STEP[move];
    const next = { x: at.x + step.x, y: at.y + step.y };
    const p = point(next);
    input.yapPointerMove(p.x, p.y);
    if (pauses > 0) {
      // a pause goes on a cell the route has left, on its most recent pass
      release(next);
      for (; pauses > 0; pauses -= 1) {
        press(at);
        release(at);
      }
      press(next);
    }
    at = next;
  }
  release(at);
  return input.yapCanPlay() ? input.yapPlan() : null;
}
