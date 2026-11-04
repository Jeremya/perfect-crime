// The layout of Home's actions (C1 plan style, pass 3): pure geometry shared
// by the Home scene and the e2e specs that tap its buttons, so a tap lands
// where the scene draws (as yapPlanningRow does for the level scene).
//
// The actions sit in the bottom third for one-thumb use (Gate 1 spec, Home):
// the primary action lowest, the secondary row above it, split equally.
import { YAP_BUTTON_HEIGHT, yapActionRow, type YapBox } from './kit';

/** A row of actions is never wider than this, in px, centred on a wide view. */
export const YAP_HOME_ROW_MAX_WIDTH = 420;
/** Room between the primary action and the bottom of the view, in px. */
const YAP_HOME_BOTTOM_MARGIN = 16;
/** Room between the secondary row and the primary action, in px. */
const YAP_HOME_ROW_GAP = 12;
/** Side margins of the rows, in px, as the kit's rows. */
const YAP_HOME_SIDE_MARGIN = 16;

export interface YapHomeActions {
  /** Box of the primary action (Play, or Tutorial outside the week). */
  readonly primary: YapBox;
  /** Centre line of the primary action. */
  readonly primaryY: number;
  /** Boxes of the secondary row, left to right (empty when there is none). */
  readonly secondary: readonly YapBox[];
  /** Centre line of the secondary row. */
  readonly secondaryY: number;
  /** Top edge of the actions: what is above them must stop there. */
  readonly top: number;
}

/**
 * Home's actions on a view of `viewWidth` × `viewHeight` with
 * `secondaryCount` secondary actions: rows at most 420 px wide, centred, the
 * primary one 16 px above the bottom and the secondary one 12 px above it.
 */
export function yapHomeActions(
  viewWidth: number,
  viewHeight: number,
  secondaryCount: number,
): YapHomeActions {
  const rowWidth = Math.min(viewWidth - 2 * YAP_HOME_SIDE_MARGIN, YAP_HOME_ROW_MAX_WIDTH);
  const left = (viewWidth - rowWidth) / 2;
  const half = YAP_BUTTON_HEIGHT / 2;
  const primaryY = viewHeight - YAP_HOME_BOTTOM_MARGIN - half;
  const secondaryY = primaryY - half - YAP_HOME_ROW_GAP - half;
  const slots = Array.from({ length: Math.max(secondaryCount, 0) }, () => ({}));
  const secondary = yapActionRow(rowWidth, slots, 0).map((box) => ({
    x: left + box.x,
    width: box.width,
  }));
  return {
    primary: { x: left, width: rowWidth },
    primaryY,
    secondary,
    secondaryY,
    top: (secondary.length > 0 ? secondaryY : primaryY) - half,
  };
}
