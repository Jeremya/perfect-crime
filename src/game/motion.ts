// Shared motion for the game screens (visual pass 2).
//
// Gate 1 asks for a light, readable interface: transitions settle in
// 120–200 ms, presses are acknowledged immediately, and everything is skipped
// when the player asked for reduced motion (`prefers-reduced-motion`, also
// honoured by the failure replay and the C8 vibrations).
import type Phaser from 'phaser';

/** Quick acknowledgement (button press, toggle). */
export const YAP_MOTION_FAST = 120;
/** Panel or screen entrance. */
export const YAP_MOTION_NORMAL = 180;

/** True when the OS asks for less motion; false when matchMedia is missing. */
export function yapPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Fades `target` in over `duration`, optionally rising `fromY` px. A no-op
 * under reduced motion: the element is simply shown.
 */
export function yapFadeIn(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container | Phaser.GameObjects.GameObject,
  duration: number = YAP_MOTION_NORMAL,
  fromY = 0,
): void {
  if (yapPrefersReducedMotion()) return;
  const container = target as Phaser.GameObjects.Container;
  const finalY = container.y ?? 0;
  container.setAlpha(0);
  if (fromY !== 0) container.y = finalY + fromY;
  scene.tweens.add({
    targets: target,
    alpha: 1,
    ...(fromY !== 0 ? { y: finalY } : {}),
    duration,
    ease: 'Sine.easeOut',
  });
}
