import Phaser from 'phaser';
import { YAP_CORP } from './app/brand';
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
    // Phaser 4 auto-starts only the first scene of the config array, so the
    // boot scene hands over explicitly: /dev/viewer opens the dev viewer
    // (F1), every other path opens the Level scene (C1).
    const target = window.location.pathname.startsWith(YAP_VIEWER_PATH)
      ? 'yap-viewer'
      : 'yap-level';
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
  scene: [YapBootScene, YapLevelScene, YapViewerScene],};

new Phaser.Game(config);
