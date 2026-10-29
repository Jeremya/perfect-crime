// YapConsentScene — the consent banner of story G2, shown on first launch as
// a non-blocking overlay on top of the level scene (docs/UI-DESIGN.md:
// "Consent is a non-blocking banner on the first-launch tutorial; it must not
// prevent play or obscure the route-critical board area").
//
// The banner is a strip anchored at the very bottom of the screen, inside the
// 96 px bottom action bar zone — it never covers the board. Its background is
// plain (non-interactive) graphics, so pointer events pass through to the
// level scene everywhere except on the banner's own buttons: the player can
// keep drawing and press PLAY while the banner is up. Answering OK or
// "No thanks" persists the choice (src/app/consent.ts) and dismisses the
// banner; the choice governs analytics exactly as the spec requires (nothing
// sent before OK, a refusal = zero events, ever).
import Phaser from 'phaser';
import { yapAnswerConsent, yapReadConsent } from '../app/consent';
import { yapI18n } from '../app/i18n';
import { yapStorage } from '../app/storage';
import { YAP_BOTTOM_BAR_HEIGHT, YAP_PALETTE, yapHexToInt } from './board';

/** Height of the banner strip: exactly the bottom action bar zone. */
const YAP_BANNER_HEIGHT = YAP_BOTTOM_BAR_HEIGHT;
/** Touch-target height of the banner buttons (docs/UI-DESIGN.md: >= 44 px). */
const YAP_BANNER_BUTTON_HEIGHT = 44;

export class YapConsentScene extends Phaser.Scene {
  private yapBanner: Phaser.GameObjects.Container | null = null;
  private yapMessage: Phaser.GameObjects.Text | null = null;
  private yapDetail: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('yap-consent');
  }

  create(): void {
    // Already answered in a previous session: nothing to show.
    if (yapReadConsent(yapStorage) !== null) {
      this.scene.stop();
      return;
    }
    this.yapBuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuild();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
  };

  /** (Re)draws the banner strip at the bottom of the screen. */
  private yapBuild(): void {
    this.yapBanner?.destroy();
    this.yapBanner = null;
    this.yapMessage = null;
    this.yapDetail = null;

    const width = this.scale.width;
    const height = this.scale.height;
    const top = height - YAP_BANNER_HEIGHT;
    const banner = this.add.container(0, 0);
    this.yapBanner = banner;

    // Panel: non-interactive graphics, so taps pass through to the level
    // scene (Clear / PLAY stay usable while the banner is visible).
    const panel = this.add.graphics();
    panel
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, top, width, YAP_BANNER_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, top + 0.5, width, top + 0.5);
    banner.add(panel);

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: YAP_PALETTE['text-primary'],
      wordWrap: { width: width - 32 },
    };
    const message = this.add.text(16, top + 6, yapI18n.t('consent.message'), textStyle).setOrigin(0, 0);
    const detail = this.add
      .text(16, top + 6, yapI18n.t('consentBanner.detail'), textStyle)
      .setOrigin(0, 0)
      .setVisible(false);
    banner.add([message, detail]);
    this.yapMessage = message;
    this.yapDetail = detail;

    // Buttons row, 44 px tall touch targets, in the bottom third.
    const btnY = height - 8 - YAP_BANNER_BUTTON_HEIGHT / 2;
    const learnMore = this.yapMakeTextButton(16, btnY, yapI18n.t('consentBanner.learnMore'), () => {
      // "Learn more" swaps the message for the short privacy detail.
      const showDetail = !this.yapDetail?.visible;
      this.yapMessage?.setVisible(!showDetail);
      this.yapDetail?.setVisible(showDetail);
    });
    const decline = this.yapMakeButton(
      width - 16 - 96 - 8 - 60,
      btnY,
      120,
      yapI18n.t('consent.decline'),
      'action-secondary',
      YAP_PALETTE['text-primary'],
      () => this.yapAnswer('refused'),
    );
    const accept = this.yapMakeButton(
      width - 16 - 48,
      btnY,
      96,
      yapI18n.t('consent.accept'),
      'action-primary',
      YAP_PALETTE['path-light'],
      () => this.yapAnswer('granted'),
    );
    banner.add([learnMore, decline.container, accept.container]);
  }

  /** Persists the answer (which gates analytics) and dismisses the banner. */
  private yapAnswer(choice: 'granted' | 'refused'): void {
    yapAnswerConsent(choice, yapStorage);
    this.scene.stop();
  }

  /** A rounded button drawn in code: graphics + zone hit area + label. */
  private yapMakeButton(
    x: number,
    y: number,
    w: number,
    labelText: string,
    fillToken: 'action-primary' | 'action-secondary',
    textColor: string,
    onPress: () => void,
  ): { container: Phaser.GameObjects.Container } {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(yapHexToInt(YAP_PALETTE[fillToken]), 1)
      .fillRoundedRect(-w / 2, -YAP_BANNER_BUTTON_HEIGHT / 2, w, YAP_BANNER_BUTTON_HEIGHT, 8)
      .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
      .strokeRoundedRect(-w / 2, -YAP_BANNER_BUTTON_HEIGHT / 2, w, YAP_BANNER_BUTTON_HEIGHT, 8);
    const zone = this.add
      .zone(0, 0, w, YAP_BANNER_BUTTON_HEIGHT)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: textColor,
      })
      .setOrigin(0.5);
    zone.on('pointerdown', onPress);
    container.add([bg, zone, label]);
    return { container };
  }

  /** A plain text button (the "Learn more" link), 44 px tall hit area. */
  private yapMakeTextButton(
    x: number,
    y: number,
    labelText: string,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: YAP_PALETTE['action-primary'],
      })
      .setOrigin(0, 0.5);
    const zone = this.add
      .zone(label.width / 2, 0, label.width, YAP_BANNER_BUTTON_HEIGHT)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', onPress);
    container.add([zone, label]);
    return container;
  }
}
