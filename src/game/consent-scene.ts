// YapConsentScene — the consent banner of story G2, shown on first launch as
// a non-blocking overlay on top of the level scene (docs/UI-DESIGN.md:
// "Consent is a non-blocking banner on the first-launch tutorial; it must not
// prevent play or obscure the route-critical board area").
//
// The banner is a strip over the 64 px top bar — it never covers the bottom
// action bar (Clear / PLAY stay visible and tappable). While it is up it
// hides the plan / par / pauses readout, which comes back as soon as the
// player answers. The spec copy is shown verbatim at the 14 px minimum text
// size; when it needs more than the 64 px bar on a narrow layout, the strip
// grows just enough, over the board's outer wall row on the first-launch
// tutorial. The panel swallows taps on itself only; everywhere
// else pointer events reach the level scene, so the player can keep drawing
// and press PLAY. Answering OK or "No thanks" persists the choice
// (src/app/consent.ts) and dismisses the banner; the choice governs analytics
// exactly as the spec requires (nothing sent before OK, a refusal = zero
// events, ever).
import Phaser from 'phaser';
import { yapAnswerConsent, yapReadConsent } from '../app/consent';
import { yapI18n } from '../app/i18n';
import { yapStorage } from '../app/storage';
import { YAP_PALETTE, YAP_TOP_BAR_HEIGHT, yapHexToInt } from './board';
import { yapFitCamera, yapViewSize } from './hidpi';

/** Minimum height of the banner strip: exactly the top bar zone. */
const YAP_BANNER_MIN_HEIGHT = YAP_TOP_BAR_HEIGHT;
/** Touch-target height of the banner buttons (docs/UI-DESIGN.md: >= 44 px). */
const YAP_BANNER_BUTTON_HEIGHT = 44;
const YAP_BANNER_GAP = 8;
const YAP_ACCEPT_WIDTH = 56;
const YAP_DECLINE_WIDTH = 88;
/** docs/UI-DESIGN.md: body text and control labels are at least 14 px. */
const YAP_BANNER_FONT_SIZE = '14px';

export class YapConsentScene extends Phaser.Scene {
  private yapBanner: Phaser.GameObjects.Container | null = null;
  private yapShowDetail = false;

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

  /** (Re)draws the banner strip over the top bar. */
  private yapBuild(): void {
    yapFitCamera(this); // CSS px on a device-pixel canvas (C1)
    this.yapBanner?.destroy();
    this.yapBanner = null;

    const width = yapViewSize(this).width;
    const banner = this.add.container(0, 0);
    this.yapBanner = banner;

    // Copy on the left, at the minimum text size; the strip height follows it.
    // Tapping the copy toggles between the message (followed by the "Learn
    // more" cue) and the short privacy detail.
    const textLeft = YAP_BANNER_GAP;
    const textWidth = width - 4 * YAP_BANNER_GAP - YAP_DECLINE_WIDTH - YAP_ACCEPT_WIDTH;
    const copy = this.yapShowDetail
      ? yapI18n.t('consentBanner.detail')
      : `${yapI18n.t('consent.message')} ${yapI18n.t('consentBanner.learnMore')}`;
    const text = this.add.text(textLeft, 0, copy, {
      fontFamily: 'sans-serif',
      fontSize: YAP_BANNER_FONT_SIZE,
      color: YAP_PALETTE['text-primary'],
      wordWrap: { width: textWidth },
    });
    const height = Math.max(YAP_BANNER_MIN_HEIGHT, Math.ceil(text.height) + 2 * YAP_BANNER_GAP);
    text.setOrigin(0, 0.5).setY(height / 2);

    // Panel: opaque over the top bar readout, and interactive so a tap on
    // the banner itself never reaches the level scene underneath.
    const panel = this.add.graphics();
    panel
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, 0, width, height)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, height - 0.5, width, height - 0.5);
    const blocker = this.add.zone(0, 0, width, height).setOrigin(0, 0).setInteractive();
    const textZone = this.add
      .zone(textLeft, 0, textWidth, height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    textZone.on('pointerdown', () => {
      this.yapShowDetail = !this.yapShowDetail;
      this.yapBuild();
    });

    // Buttons on the right, vertically centred in the strip.
    const btnY = height / 2;
    const acceptX = width - YAP_BANNER_GAP - YAP_ACCEPT_WIDTH / 2;
    const declineX = acceptX - YAP_ACCEPT_WIDTH / 2 - YAP_BANNER_GAP - YAP_DECLINE_WIDTH / 2;
    const decline = this.yapMakeButton(
      declineX,
      btnY,
      YAP_DECLINE_WIDTH,
      yapI18n.t('consent.decline'),
      'action-secondary',
      YAP_PALETTE['text-primary'],
      () => this.yapAnswer('refused'),
    );
    const accept = this.yapMakeButton(
      acceptX,
      btnY,
      YAP_ACCEPT_WIDTH,
      yapI18n.t('consent.accept'),
      'action-primary',
      YAP_PALETTE['path-light'],
      () => this.yapAnswer('granted'),
    );
    banner.add([panel, blocker, text, textZone, decline.container, accept.container]);
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
        fontSize: YAP_BANNER_FONT_SIZE,
        color: textColor,
      })
      .setOrigin(0.5);
    zone.on('pointerdown', onPress);
    container.add([bg, zone, label]);
    return { container };
  }
}
