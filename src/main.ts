import Phaser from 'phaser';
import { track } from './app/analytics';
import { YAP_CORP } from './app/brand';
import { yapInstallConsentGate, yapReadConsent } from './app/consent';
import {
  yapBootRoute,
  yapIsFirstOpen,
  yapIsReturnToForeground,
  yapReadLinkFromLocation,
} from './app/router';
import { yapStorage } from './app/storage';
import { YAP_CHALLENGE_SCENE_KEY, YapChallengeScene } from './game/challenge-scene';
import { YapConsentScene } from './game/consent-scene';
import { YapHomeScene, yapFlow } from './game/home-scene';
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
    // Story G2: nothing leaves the device before OK — the consent gate wraps
    // the shared analytics transport before any scene can emit an event.
    yapInstallConsentGate({ storage: yapStorage });
    // Phaser 4 auto-starts only the first scene of the config array, so the
    // boot scene hands over explicitly: /dev/viewer opens the dev viewer
    // (F1); every other path follows the app flow (D2, src/app/router.ts):
    // the first launch opens tutorial T1 directly, a known player lands on
    // Home.
    const viewer = window.location.pathname.startsWith(YAP_VIEWER_PATH);
    // Story E4: a /c/<day>#<payload> arrival is read before anything strips the
    // fragment, so app_open can report the real entry source.
    const link = viewer ? null : yapReadLinkFromLocation();
    if (!viewer) {
      // Story D2: app_open at launch (the profile does not exist yet on the
      // very first one); story E4: entry: link for a shared link.
      track('app_open', {
        entry: link === null ? 'direct' : 'link',
        is_first_open: yapIsFirstOpen(yapStorage),
      });
      yapWatchForegroundReturn();
    }
    // First launch: the non-blocking consent banner overlays the top bar
    // (YapConsentScene is last in the scene list, so it renders on top).
    if (yapReadConsent(yapStorage) === null) this.scene.launch('yap-consent');
    if (viewer) {
      this.scene.start('yap-viewer');
      return;
    }
    const route = yapBootRoute(yapStorage, link);
    // Story E4: a shared link opens the challenge card first — the route has
    // already stored the decoded payload in the inbox, and carries the share
    // ID the card reads. Every other route goes through the app flow.
    if (route.kind === 'level' && route.challengeShareId !== undefined) {
      this.scene.start(YAP_CHALLENGE_SCENE_KEY, {
        day: route.day,
        shareId: route.challengeShareId,
      });
      return;
    }
    yapFlow.yapGo(this, route);
  }
}

/** app_open again on a return to the foreground after 30 min (Gate 1 spec, Events). */
function yapWatchForegroundReturn(): void {
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (yapIsReturnToForeground(hiddenAt, Date.now())) {
      track('app_open', { entry: 'direct', is_first_open: false });
    }
    hiddenAt = null;
  });
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
  // YapConsentScene last: launched as an overlay, it must render on top of
  // the level and Home scenes (scene render order follows the config array order).
  scene: [
    YapBootScene,
    YapHomeScene,
    YapLevelScene,
    YapChallengeScene,
    YapViewerScene,
    YapConsentScene,
  ],
};

new Phaser.Game(config);
