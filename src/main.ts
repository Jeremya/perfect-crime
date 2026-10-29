import Phaser from 'phaser';

// Boot scene: the only screen that exists until Epic C lands.
// A1 acceptance: an empty scene runs smoothly on a mid-range Android.
class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    // Intentionally empty: first playable screen arrives with the Level scene.
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0e14',
  scale: {
    // Portrait 9:16 frame, centred, at most 480 px wide on desktop.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 853,
  },
  scene: [BootScene],
};

new Phaser.Game(config);
