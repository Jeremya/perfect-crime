import Phaser from 'phaser';
import { YAP_CORP } from './app/brand';
import { yapInstallConsentGate, yapReadConsent } from './app/consent';
import { yapStorage } from './app/storage';
import { YapConsentScene } from './game/consent-scene';
import { YapLevelScene } from './game/level-scene';
import { YapViewerScene } from './game/viewer-scene';

/** Public dev route of the F1 viewer (docs/NAMING.md: public URL paths stay). */
const YAP_VIEWER_PATH = '/dev/viewer';

// Boot scene: an empty scene that runs smoothly on a mid-range Android (A1).
// Nomenclature: every class carries the Yap prefix (docs/NAMING.md).
class YapBootScene extends Phaser.Scene {
  constructor() {
    super('yap-boot');
  }

  create(): void {
    // Story G2: nothing leaves the device before OK — the consent gate wraps
    // the shared analytics transport before any scene can emit an event.
    yapInstallConsentGate({ storage: yapStorage });
    // Phaser 4 auto-starts only the first scene of the config array, so the
    // boot scene hands over explicitly: /dev/viewer opens the dev viewer
    // (F1), every other path opens the Level scene (C1).
    const target = window.location.pathname.startsWith(YAP_VIEWER_PATH)
      ? 'yap-viewer'
      : 'yap-level';
    // First launch: the non-blocking consent banner overlays the top bar
    // (YapConsentScene is last in the scene list, so it renders on top).
    if (yapReadConsent(yapStorage) === null) this.scene.launch('yap-consent');
    this.scene.start(target);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  title: 'Perfect Crime',
  version: YAP_CORP.version,
  backgroundColor: '#0b0e14',
  scale: {
    // Portrait 9:16 frame, centred, at most 480 px wide on desktop.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 853,
  },
  // YapConsentScene last: launched as an overlay, it must render on top of
  // the level scene (scene render order follows the config array order).
  scene: [YapBootScene, YapLevelScene, YapViewerScene, YapConsentScene],
};

new Phaser.Game(config);
