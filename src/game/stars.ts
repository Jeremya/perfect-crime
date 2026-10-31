// X1 — the star thresholds as a pure, Phaser-free module (testable in node),
// so the planning top bar can show the 3★/2★ targets while the player draws
// (docs/design/experience.md §4.3 "Planning top bar"). The rule itself is
// unchanged and lives in ./win.ts: YAP_STAR_THRESHOLD is imported read-only
// and YapWinScreen.yapStars stays the single place that awards stars. This
// module only re-exposes the rule as the two numbers the chrome displays:
// 3★ = par, 2★ ≤ twoStarMax. tests/unit/stars.test.ts pins the two together.
import { YAP_STAR_THRESHOLD } from './win';

/** The star thresholds of one heist, as displayed in the planning top bar. */
export interface YapStarThresholds {
  /** 3★: a winning plan of exactly par ticks (the solver's minimum). */
  readonly par: number;
  /** 2★: any winning plan of at most twoStarMax ticks. */
  readonly twoStarMax: number;
}

/**
 * The star thresholds of a heist: 3★ at par, 2★ up to
 * twoStarMax = floor(par * YAP_STAR_THRESHOLD) — the same rule as
 * YapWinScreen.yapStars (Gate 1 spec, "Score, stars"), 1★ above.
 */
export function yapStarThresholds(par: number): YapStarThresholds {
  return { par, twoStarMax: Math.floor(par * YAP_STAR_THRESHOLD) };
}
