// YapConsentScene — the consent banner of story G2, shown on first launch as
// a non-blocking overlay on top of the level scene (docs/UI-DESIGN.md:
// "Consent is a non-blocking banner on the first-launch tutorial; it must not
// prevent play or obscure the route-critical board area").
//
// The banner is a note (C1 plan style: paper, a 1.5 px ink border and the
// card shadow, src/game/kit.ts) pinned over the 64 px top bar — it never covers the bottom
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
import { YAP_PALETTE, YAP_TOP_BAR_HEIGHT } from './board';
import { yapFitCamera, yapOnViewResize, yapViewSize } from './hidpi';
import { yapButton, yapCard } from './kit';
import { yapRoleText } from './text';

/** Minimum height of the banner strip: exactly the top bar zone. */
const YAP_BANNER_MIN_HEIGHT = YAP_TOP_BAR_HEIGHT;
/** Touch-target height of the banner buttons (docs/UI-DESIGN.md: >= 44 px). */
const YAP_BANNER_BUTTON_HEIGHT = 44;
const YAP_BANNER_GAP = 8;
const YAP_ACCEPT_WIDTH = 56;
const YAP_DECLINE_WIDTH = 88;
/** docs/UI-DESIGN.md: body text and control labels are at least 14 px. */
const YAP_BANNER_FONT_SIZE = 14;

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
    this.yapOnResize = yapOnViewResize(this, () => this.yapBuild());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  /** RESIZE handler made by create(): rebuilds on a new view size only (C1). */
  private yapOnResize: () => void = () => undefined;

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
    // the body role, at the 14 px minimum of the banner rather than 16
    const text = yapRoleText(this, textLeft, 0, copy, 'body', YAP_PALETTE.ink, {
      wordWrap: { width: textWidth },
    }).setFontSize(YAP_BANNER_FONT_SIZE);
    const height = Math.max(YAP_BANNER_MIN_HEIGHT, Math.ceil(text.height) + 2 * YAP_BANNER_GAP);
    text.setOrigin(0, 0.5).setY(height / 2);

    // Panel: a note pinned to the top, opaque over the header, and
    // interactive so a tap on the banner itself never reaches the level scene
    // underneath. Its side and top borders sit just off the view, so the
    // bottom border and the shadow under it are what shows.
    const border = 2;
    const panel = yapCard(this, -border, -border, width + 2 * border, height + border);
    const blocker = this.add.zone(0, 0, width, height).setOrigin(0, 0).setInteractive();
    const textZone = this.add
      .zone(textLeft, 0, textWidth, height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    textZone.on('pointerdown', () => {
      this.yapShowDetail = !this.yapShowDetail;
      this.yapBuild();
    });

    // Buttons on the right, vertically centred in the strip: OK primary,
    // No thanks secondary, 44 px tall.
    const btnY = height / 2;
    const acceptX = width - YAP_BANNER_GAP - YAP_ACCEPT_WIDTH;
    const declineX = acceptX - YAP_BANNER_GAP - YAP_DECLINE_WIDTH;
    const decline = yapButton(this, {
      x: declineX,
      y: btnY,
      width: YAP_DECLINE_WIDTH,
      height: YAP_BANNER_BUTTON_HEIGHT,
      label: yapI18n.t('consent.decline'),
      kind: 'secondary',
      onPress: () => this.yapAnswer('refused'),
    });
    const accept = yapButton(this, {
      x: acceptX,
      y: btnY,
      width: YAP_ACCEPT_WIDTH,
      height: YAP_BANNER_BUTTON_HEIGHT,
      label: yapI18n.t('consent.accept'),
      kind: 'primary',
      onPress: () => this.yapAnswer('granted'),
    });
    banner.add([panel, blocker, text, textZone, decline.container, accept.container]);
  }

  /** Persists the answer (which gates analytics) and dismisses the banner. */
  private yapAnswer(choice: 'granted' | 'refused'): void {
    yapAnswerConsent(choice, yapStorage);
    this.scene.stop();
  }
}
