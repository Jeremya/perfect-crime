import Phaser from 'phaser';
import { YAP_CORP } from './app/brand';
import { YapLevelScene } from './game/level-scene';
import { YapViewerScene } from './game/viewer-scene';

/** Public dev route of the F1 viewer (docs/NAMING.md: public URL paths stay). */
const YAP_VIEWER_PATH = '/dev/viewer';

// Keep the game canvas at CSS-pixel size on phones instead of shrinking a
// fixed 9:16 canvas to fit the taller 390 × 844 class of screens. The parent
// remains narrow and portrait on desktop.
const yapGameFrame = document.getElementById('game');
if (yapGameFrame !== null) {
  document.body.style.margin = '0';
  document.body.style.height = '100dvh';
  document.body.style.display = 'flex';
  document.body.style.alignItems = 'center';
  document.body.style.justifyContent = 'center';
  document.body.style.background = '#F4F2ED';
  document.body.style.overscrollBehavior = 'none';
  yapGameFrame.style.width = 'min(100vw, 480px)';
  yapGameFrame.style.height = 'min(100dvh, 853px)';
  yapGameFrame.style.flex = '0 0 auto';
  yapGameFrame.style.overflow = 'hidden';
}

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
  backgroundColor: '#F4F2ED',
  scale: {
    // Resize to the actual phone viewport so 44 px controls remain 44 CSS px.
    // The parent above caps desktop width and height while staying centered.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 853,
  },
  scene: [YapBootScene, YapLevelScene, YapViewerScene],};

new Phaser.Game(config);
