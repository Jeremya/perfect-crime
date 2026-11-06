// YapPrivacyScene — the privacy page of the spec (story D3), reached from
// Settings and from the "Learn more" of the consent banner. It opens over the
// running scene, last in the scene list, and closes back to it: leaving the
// banner to read this keeps the route the player was drawing.
import Phaser from 'phaser';
import { YAP_CORP } from '../app/brand';
import { yapI18n } from '../app/i18n';
import { YAP_PALETTE, YAP_TOP_BAR_HEIGHT } from './board';
import { yapFitCamera, yapOnViewResize, yapViewSize } from './hidpi';
import { yapHomeActions } from './home-layout';
import { yapButton, yapCard, yapHeader, yapPaperPage } from './kit';
import { YAP_PRIVACY_SCENE_KEY, yapPrivacySections } from './settings-layout';
import { yapRoleText } from './text';

/** Room around the card and inside it, in px. */
const YAP_PRIVACY_CARD_GAP = 12;
const YAP_PRIVACY_CARD_PADDING = 14;
/** Room under a head and under a section, in px. */
const YAP_PRIVACY_HEAD_GAP = 2;
const YAP_PRIVACY_SECTION_GAP = 10;
/** docs/UI-DESIGN.md: body text is at least 14 px. */
const YAP_PRIVACY_FONT_SIZE = 14;

export class YapPrivacyScene extends Phaser.Scene {
  private yapRoot: Phaser.GameObjects.Container | null = null;
  /** What `__yapScreen` said before this page opened. */
  private yapUnder: unknown = null;

  constructor() {
    super(YAP_PRIVACY_SCENE_KEY);
  }

  create(): void {
    this.yapUnder = (window as unknown as Record<string, unknown>)['__yapScreen'] ?? null;
    this.yapBuild();
    this.yapOnResize = yapOnViewResize(this, () => this.yapBuild());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown);
  }

  /** RESIZE handler made by create(): rebuilds on a new view size only (C1). */
  private yapOnResize: () => void = () => undefined;

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.yapRoot = null;
    (window as unknown as Record<string, unknown>)['__yapScreen'] = this.yapUnder;
  };

  private yapBuild(): void {
    yapFitCamera(this); // CSS px on a device-pixel canvas (C1)
    this.yapRoot?.destroy();
    const { width, height } = yapViewSize(this);
    const actions = yapHomeActions(width, height, 0);
    const root = this.add.container(0, 0);
    this.yapRoot = root;

    root.add(yapPaperPage(this, width, height));
    // the page is opaque, and so is its input: nothing reaches the scene under it
    root.add(this.add.zone(0, 0, width, height).setOrigin(0, 0).setInteractive());
    root.add(
      yapHeader(this, width, {
        kicker: yapI18n.t('privacy.kicker', { studio: YAP_CORP.studio }),
        title: yapI18n.t('settings.privacy'),
      }).container,
    );

    const x = actions.primary.x;
    const cardWidth = actions.primary.width;
    const cardY = YAP_TOP_BAR_HEIGHT + YAP_PRIVACY_CARD_GAP;
    const cardHeight = actions.top - YAP_PRIVACY_CARD_GAP - cardY;
    root.add(yapCard(this, x, cardY, cardWidth, cardHeight));

    const textX = x + YAP_PRIVACY_CARD_PADDING;
    const textWidth = cardWidth - 2 * YAP_PRIVACY_CARD_PADDING;
    let y = cardY + YAP_PRIVACY_CARD_PADDING;
    for (const section of yapPrivacySections(YAP_CORP.contact)) {
      const head = yapRoleText(
        this,
        textX,
        y,
        yapI18n.t(section.head),
        'kicker',
        YAP_PALETTE['ink-muted'],
      );
      y += head.height + YAP_PRIVACY_HEAD_GAP;
      const body = yapRoleText(
        this,
        textX,
        y,
        yapI18n.t(section.body, { studio: YAP_CORP.studio, contact: YAP_CORP.contact }),
        'body',
        YAP_PALETTE.ink,
        { wordWrap: { width: textWidth } },
      ).setFontSize(YAP_PRIVACY_FONT_SIZE);
      y += body.height + YAP_PRIVACY_SECTION_GAP;
      root.add([head, body]);
    }

    root.add(
      yapButton(this, {
        x,
        y: actions.primaryY,
        width: cardWidth,
        label: yapI18n.t('common.back'),
        kind: 'primary',
        // on the release: nothing is left of the tap for the scene underneath
        fireOn: 'up',
        onPress: () => this.scene.stop(),
      }).container,
    );

    // End-to-end hooks beside `__yapPhase`: the screen, and whether the text fits
    const hooks = window as unknown as Record<string, unknown>;
    hooks['__yapScreen'] = 'privacy';
    hooks['__yapPrivacyRoom'] = cardY + cardHeight - (y - YAP_PRIVACY_SECTION_GAP);
  }
}
