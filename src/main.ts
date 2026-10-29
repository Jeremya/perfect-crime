import Phaser from 'phaser';
import { YAP_CORP } from './app/brand';
import { YapLevelScene } from './game/level-scene';

// Boot scene: an empty scene that runs smoothly on a mid-range Android (A1).
// Nomenclature: every class carries the Yap prefix (docs/NAMING.md).
class YapBootScene extends Phaser.Scene {
  constructor() {
    super('yap-boot');
  }

  create(): void {
    // Phaser 4 auto-starts only the first scene of the config array, so the
    // boot scene hands over to the Level scene (C1) explicitly.
    this.scene.start('yap-level');
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
  scene: [YapBootScene, YapLevelScene],
};

new Phaser.Game(config);
