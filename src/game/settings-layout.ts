// The layout of the Settings screen (story D3) and the sections of the privacy
// page: pure, shared by the scenes and the e2e specs that tap them, so a tap
// lands where the scene draws (as yapHomeActions does for Home).
import type { YapKey } from '../app/i18n';
import { YAP_TOP_BAR_HEIGHT } from './board';
import { yapHomeActions, type YapHomeActions } from './home-layout';
import type { YapBox } from './kit';

export const YAP_SETTINGS_SCENE_KEY = 'yap-settings';
export const YAP_PRIVACY_SCENE_KEY = 'yap-privacy';

/** Height of a control of a row, in px (docs/UI-DESIGN.md: at least 44). */
export const YAP_SETTINGS_CONTROL_HEIGHT = 44;
/** Room between two rows, in px. */
const YAP_SETTINGS_ROW_GAP = 8;
/** Room inside the card, around the rows, in px. */
const YAP_SETTINGS_CARD_PADDING = 12;
/** Room between the header and the card, in px. */
const YAP_SETTINGS_CARD_TOP = 16;
/** Room between the card and the version line, in px. */
const YAP_SETTINGS_VERSION_GAP = 20;
/** Room between the two choices of a row, and before them, in px. */
const YAP_SETTINGS_CHOICE_GAP = 8;
/** Both choices of a row take at most this width, in px. */
const YAP_SETTINGS_CHOICES_MAX_WIDTH = 216;
/** ... and at most this share of the room inside the card. */
const YAP_SETTINGS_CHOICES_SHARE = 0.64;

export type YapSettingsRowId = 'language' | 'sound' | 'vibration' | 'nickname' | 'consent';

export interface YapSettingsRow {
  readonly id: YapSettingsRowId;
  /** Centre line of the row. */
  readonly y: number;
  readonly labelX: number;
  readonly labelWidth: number;
  /** The two choices, left to right. The nickname runs across both. */
  readonly first: YapBox;
  readonly second: YapBox;
}

export interface YapSettingsLayout {
  /** The card behind the rows. */
  readonly card: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rows: readonly YapSettingsRow[];
  /** Centre line of the version. */
  readonly versionY: number;
  /** Back is the primary action, the privacy page the only secondary one. */
  readonly actions: YapHomeActions;
}

/**
 * The screen on a view of `viewWidth` × `viewHeight`: the rows in the order of
 * the spec in a card as wide as the actions, the version under it, Back and
 * the privacy page in the bottom third. `vibration` is false where the browser
 * has none: a row that does nothing would be a lie.
 */
export function yapSettingsLayout(
  viewWidth: number,
  viewHeight: number,
  vibration: boolean,
): YapSettingsLayout {
  const actions = yapHomeActions(viewWidth, viewHeight, 1);
  const ids: YapSettingsRowId[] = ['language', 'sound'];
  if (vibration) ids.push('vibration');
  ids.push('nickname', 'consent');

  const x = actions.primary.x;
  const width = actions.primary.width;
  const y = YAP_TOP_BAR_HEIGHT + YAP_SETTINGS_CARD_TOP;
  const inner = width - 2 * YAP_SETTINGS_CARD_PADDING;
  const labelX = x + YAP_SETTINGS_CARD_PADDING;
  const choices = Math.min(YAP_SETTINGS_CHOICES_MAX_WIDTH, inner * YAP_SETTINGS_CHOICES_SHARE);
  const choiceWidth = (choices - YAP_SETTINGS_CHOICE_GAP) / 2;
  const right = labelX + inner;
  const pitch = YAP_SETTINGS_CONTROL_HEIGHT + YAP_SETTINGS_ROW_GAP;

  const rows = ids.map((id, index): YapSettingsRow => ({
    id,
    y: y + YAP_SETTINGS_CARD_PADDING + YAP_SETTINGS_CONTROL_HEIGHT / 2 + index * pitch,
    labelX,
    labelWidth: inner - choices - YAP_SETTINGS_CHOICE_GAP,
    first: { x: right - choices, width: choiceWidth },
    second: { x: right - choiceWidth, width: choiceWidth },
  }));

  const height = 2 * YAP_SETTINGS_CARD_PADDING + ids.length * pitch - YAP_SETTINGS_ROW_GAP;
  return {
    card: { x, y, width, height },
    rows,
    versionY: y + height + YAP_SETTINGS_VERSION_GAP,
    actions,
  };
}

export interface YapPrivacySection {
  readonly head: YapKey;
  readonly body: YapKey;
}

/** The privacy page, section by section; the contact only once there is one. */
export function yapPrivacySections(contact: string): readonly YapPrivacySection[] {
  const sections: YapPrivacySection[] = [
    { head: 'privacy.measuredHead', body: 'privacy.measured' },
    { head: 'privacy.notMeasuredHead', body: 'privacy.notMeasured' },
    { head: 'privacy.whereHead', body: 'privacy.where' },
    { head: 'privacy.choiceHead', body: 'privacy.choice' },
  ];
  if (contact !== '') sections.push({ head: 'privacy.contactHead', body: 'privacy.contact' });
  return sections;
}
