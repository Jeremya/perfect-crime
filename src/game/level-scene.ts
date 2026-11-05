// YapLevelScene — the Planning screen (stories C1 + C2) and the Execution
// screen (C3): polished rendering of a level plus the path drawing. Grid
// baked once into a texture, then per displayed tick: vision cones as the
// exact cells of visibleCells, dotted patrols, lasers, thief, guards,
// cameras, diamond and exit. On top of that, YapPathInput (./path-input.ts)
// turns pointer events into the player's plan: central zone, erase by going
// back, cut, pauses on tap, 64-step limit and auto-finish at the exit, drawn
// as an outlined route with pause badges. PLAY hands the plan to YapExecution
// (./execution.ts), which runs it through resolveTick at 4 ticks/s (×2, Stop)
// and whose frames are the only thing drawn during playback. On detection
// (C4), YapFailureReplay (./failure.ts) drives the Failure screen: slow-
// motion replay of the last 4 ticks at quarter speed with a zoom on the
// thief and whatever saw it, the detector cone in red, the written cause
// with a marker on the fatal cell, and one tap back to the intact plan
// (path and pauses kept, red fatal-cell marker retained).
// On a win (C5), YapWinScreen (./win.ts) drives the Win screen: an index card
// over the final frame with attempts, ticks vs par, stars, the emoji-line
// preview and Share (dominant, stub event until E2) / Improve my score / Home.
// Every PLAY press counts as an attempt until the win; replaying after the win
// never changes attempts.
// Hints (C7, ./hints.ts): after 3 then 6 failures on the heist, the Hint
// button of the bottom bar reveals the first third then two thirds of the
// optimal plan (YapSolver) as a dotted ghost under the player's path; the
// hints used are counted in the share (💡) via YapWinScreen.
// Ghost preview (C6, ./ghost.ts): while the player draws, a dedicated layer
// above the board and under the path shows the guards, cameras, lasers and
// their exact cones at the tick of the cell under the finger, at reduced
// opacity so it cannot be confused with the tick-0 state (ghost flag).
// Layout adapts to the viewport (readable on a 360 x 640 screen) and rebuilds
// on resize, preserving the drawn path.
// The chrome of every mode (C1 visual pass 3) comes from the component kit
// (./kit.ts): the paper page behind the board, the header (a kicker over the
// title, a block of stats on the right), the footers and their buttons, the
// Win card and the toasts.
//
// Rendering never computes a rule: everything shown comes from the pure sim
// (src/core/sim.ts) via the helpers of ./board.ts; drawing lives in ./render.ts
// and the path overlay below; the input rules live in ./path-input.ts.
import Phaser from 'phaser';
import { parseLevel, type YapCell, type YapLevel } from '../core/level';
import { createInitialState, type YapPlan, type YapSimState } from '../core/sim';
import { yapI18n, type YapKey } from '../app/i18n';
import { loadYapProfile } from '../app/config';
import { yapStorage } from '../app/storage';
import {
  yapBuildShareContent,
  yapLoadShareId,
  yapPrepareShareImage,
  yapPreparedShareImage,
  yapResolveShareDay,
  yapResolveShareVariant,
  yapShare,
  yapShareStars,
  type YapShareReport,
} from '../app/share';
import tutorialSource from '../../levels/tutorial/t1.lvl?raw';
import {
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_PALETTE,
  YAP_CONSENT_HEIGHT_KEY,
  yapCellCenter,
  yapConsentTopBar,
  yapDirVector,
  yapCellRect,
  yapLevelLayout,
  yapHexToInt,
  type YapBoardLayout,
  type YapPaletteToken,
  type YapPoint,
} from './board';
import {
  YAP_DPR,
  yapBakeTexture,
  yapBakedImage,
  yapDeviceViewport,
  yapFitCamera,
  yapOnViewResize,
  yapPointerView,
  yapViewSize,
} from './hidpi';
import { YapPathInput } from './path-input';
import {
  yapGhostCones,
  yapGhostLayerVisible,
  yapPreviewStates,
  yapResolveGhostFlag,
  yapResolvePreviewFlag,
  type YapGhostRenderMode,
  type YapGhostState,
  type YapPreviewState,
} from './ghost';
import { YapExecution, YAP_PREVIEW_TICKS_PER_SECOND, type YapDisplayedSnapshot } from './execution';
import { YapFailureReplay } from './failure';
import { YapHints } from './hints';
import { yapFadeIn } from './motion';
import { YapAttemptLog, YapWinScreen } from './win';
import { yapStarThresholds } from './stars';
import { track } from '../app/analytics';
import { YAP_EXECUTION_TICK_EVENT, YAP_PATH_STEP_EVENT, yapAttachSound } from './sound';
import {
  YAP_PAUSE_BADGE_BARS,
  YAP_PAUSE_BADGE_PAD,
  yapDrawCamera,
  yapDrawGuard,
  yapDrawHand,
  yapDrawPauseBadge,
  yapDrawRoute,
  yapDrawCone,
  yapDrawDiamond,
  yapDrawExit,
  yapDrawLaser,
  yapDrawPatrol,
  yapDrawBoardFrame,
  yapDrawStaticGrid,
  yapDrawStart,
  yapDrawThief,
} from './render';
import { YAP_PENCIL_ALPHA, YAP_ROUTE_WIDTH, yapDashes, yapWalkedSteps } from './plan-geometry';
import { YAP_STAMP_ANGLE, yapLeaderRow, yapRuler, yapStamp, type YapRuler } from './kit-screens';
import {
  YAP_WIN_ROW_HEIGHT,
  yapHandPose,
  yapPlanningBand,
  yapTelegram,
  yapWinActions,
} from './compose';
import { yapRoleCase, yapRoleText, yapSetRoleText, yapText, yapTextStyle } from './text';
import {
  YAP_BUTTON_HEIGHT,
  YAP_PLANNING_CLEAR_WIDTH,
  YAP_ROW_FROM_BOTTOM,
  yapActionRow,
  yapButton,
  yapCard,
  yapHeader,
  yapPaperPage,
  yapPlanningRow,
  yapRule,
  yapShowToast,
  type YapButton,
  type YapHeader,
} from './kit';

/** Texture key of the baked static grid. */
const YAP_GRID_TEXTURE_KEY = 'yap-board-grid';
/** Scene event emitted with the plan when PLAY is pressed. */
const YAP_PLAY_EVENT = 'yap-play';
/** Scene event emitted with the outcome when the playback reaches its end. */
const YAP_EXECUTION_END_EVENT = 'yap-execution-end';
/** Scene event emitted with the share payload when Share is pressed (E2 wires it). */
const YAP_WIN_SHARE_EVENT = 'yap-win-share';
/** Scene event emitted when Home is pressed on the Win screen (D2 wires it). */
const YAP_WIN_HOME_EVENT = 'yap-win-home';
/**
 * C6: opacity of the whole ghost layer. docs/UI-DESIGN.md — the ghost preview
 * uses reduced opacity so it can never be confused with the tick-0 state.
 */
const YAP_GHOST_ALPHA = 0.5;
/**
 * X3: hold of the final preview frame (win or caught) before the automatic
 * return to planning.
 */
const YAP_PREVIEW_END_HOLD_MS = 700;
/** A hint's pause badge sits this far above its cell centre, in px, clear of the 💡 badge. */
const YAP_HINT_PAUSE_LIFT = 22;
/** What yapDrawState needs: the world at a tick plus the thief (real or ghost). */
type YapDrawableState = YapGhostState & Pick<YapSimState, 'thief' | 'hasLoot'>;

/**
 * C1 visual pass 3: the tutorial levels, by catalog id: their number out of
 * five (the header's kicker) and their lesson, the header's title (spec §10).
 */
const YAP_TUTORIAL_LESSONS: Readonly<
  Record<string, { readonly n: number; readonly title: YapKey }>
> = {
  'tutorial/t1': { n: 1, title: 'tutorialLessons.t1' },
  'tutorial/t2': { n: 2, title: 'tutorialLessons.t2' },
  'tutorial/t3': { n: 3, title: 'tutorialLessons.t3' },
  'tutorial/t4': { n: 4, title: 'tutorialLessons.t4' },
  'tutorial/t5': { n: 5, title: 'tutorialLessons.t5' },
};

/** The header's kicker of a heist, by why it is played. */
const YAP_HEIST_KICKERS: Readonly<Record<'daily' | 'archive' | 'challenge', YapKey>> = {
  daily: 'header.daily',
  archive: 'header.archive',
  challenge: 'header.challenge',
};

/** Room the planning caption keeps from the rule above it and the row below it, in px. */
const YAP_CAPTION_CLEARANCE = 4;

/** Width of a line of text in a footer: the width of a row of buttons, margins apart. */
function yapLineRoom(viewWidth: number): number {
  return yapActionRow(viewWidth, [{}])[0]?.width ?? viewWidth;
}

/**
 * Fits a line of a tracked role into `room` px, as the kit fits the label of
 * a button: too wide, it loses its letter spacing; still too wide, it wraps.
 */
function yapFitLine(text: Phaser.GameObjects.Text, room: number): void {
  if (text.width <= room) return;
  text.setLetterSpacing(0);
  if (text.width <= room) return;
  text.setWordWrapWidth(room);
}

export interface YapLevelSceneData {
  /** .lvl source to render; defaults to the tutorial heist. */
  readonly levelSource?: string;
  /** D2: an already compiled level (levels.json); wins over levelSource. */
  readonly level?: YapLevel;
  /** D2: catalog id of the level ('tutorial/t1', 'daily/d3'…). */
  readonly levelId?: string;
  /** D2: why the level is played (analytics level_start mode). */
  readonly mode?: 'tutorial' | 'daily' | 'archive' | 'challenge';
  /** D2: test day of the heist (0 = not a daily heist). */
  readonly day?: number;
  /** D2: label of the Win screen Home button (e.g. "Next level" in the tutorial). */
  readonly winHomeLabel?: string;
}

export class YapLevelScene extends Phaser.Scene {
  private yapLevel: YapLevel | null = null;
  private yapState: YapSimState | null = null;
  private yapBoard: Phaser.GameObjects.Container | null = null;
  private yapChrome: Phaser.GameObjects.Container | null = null;
  private yapLayout: YapBoardLayout | null = null;
  private yapPathInput: YapPathInput | null = null;
  private yapPathLayer: Phaser.GameObjects.Graphics | null = null;
  private yapBadgeLayer: Phaser.GameObjects.Container | null = null;
  // --- Chrome (C1 visual pass 3, ./kit.ts) ---
  /** The header of the mode on screen; its right block changes in place. */
  private yapHeader: YapHeader | null = null;
  /** Planning footer caption: what to do, then the star targets (X1). */
  private yapCaption: Phaser.GameObjects.Text | null = null;
  /** PLAY, disabled ("Draw your route") until the plan can run; planning only. */
  private yapPlayButton: YapButton | null = null;
  private yapPlayPulse: Phaser.Tweens.Tween | null = null;
  /** Id of the single finger currently drawing (null = none). */
  private yapPointerId: number | null = null;
  /** Playback controller while PLAY runs (null = planning mode). */
  private yapExecution: YapExecution | null = null;
  /** Dynamic layer under the path: cones and lasers of the displayed tick. */
  private yapDynamic: Phaser.GameObjects.Container | null = null;
  // --- Ghost preview (C6) ---
  /**
   * Dedicated ghost layer: guards, cameras, lasers and their exact cones at
   * the tick of the cell under the finger, drawn at reduced opacity. Above
   * the board and the tick-0 cones, under the hint ghost and the player's path.
   */
  private yapGhostLayer: Phaser.GameObjects.Container | null = null;
  /** Entity layer on top of the path: thief, guards, cameras, objectives. */
  private yapEntities: Phaser.GameObjects.Container | null = null;
  /** What is on screen right now (input of the dev assertion). */
  private yapDisplayed: YapDisplayedSnapshot | null = null;
  /** The playback timer (one tick every yapTickMs). */
  private yapTickTimer: Phaser.Time.TimerEvent | null = null;
  /** The ×2 toggle of the execution footer. */
  private yapSpeedButton: YapButton | null = null;
  /** The execution ruler (plan style 4/6): the playback's progress. */
  private yapRuler: YapRuler | null = null;
  /** The first-launch hand (spec §8): its layer while it shows, null otherwise. */
  private yapHandLayer: Phaser.GameObjects.Container | null = null;
  /** The hand's dashed ghost route, under the pieces (outside the hand's layer). */
  private yapHandGhosts: Phaser.GameObjects.Graphics[] = [];
  /** The hand's own graphics, redrawn each frame while it loops. */
  private yapHandGraphics: Phaser.GameObjects.Graphics | null = null;
  /** The cell centres of the route the hand draws (T1's solution). */
  private yapHandPoints: readonly YapPoint[] = [];
  /** When the hand's loop started (scene time, ms). */
  private yapHandStart = 0;
  /** The run has had its first touch: the hand never comes back. */
  private yapHandDone = false;
  /** The REPÉRÉ stamp's holder while it is on the board (null otherwise). */
  private yapFailureStamp: Phaser.GameObjects.Container | null = null;
  /** The win's CASSE RÉUSSI stamp has landed: a rebuild shows it without the thump. */
  private yapWinStampLanded = false;
  /** The failure replay has settled: its REPÉRÉ stamp is down. */
  private yapFailureSettled = false;
  // --- Failure (C4) ---
  /** Failure replay controller while the Failure screen is up (null = not). */
  private yapFailure: YapFailureReplay | null = null;
  /** The slow-motion replay timer (one replayed tick every yapTickMs). */
  private yapFailureTimer: Phaser.Time.TimerEvent | null = null;
  /** Index in the replay frames of the frame currently on screen. */
  private yapFailureFrameIndex = 0;
  /** Red fatal-cell marker kept on the plan after a failure (null = none). */
  private yapFatalMarker: YapCell | null = null;
  // --- Win (C5) ---
  /** Attempt bookkeeping: every PLAY press counts, until the heist is won. */
  private yapAttemptLog = new YapAttemptLog();
  /** Win screen model while the Win screen is up (null = not). */
  private yapWin: YapWinScreen | null = null;
  /** The final (won) frame, kept on screen behind the Win panel. */
  private yapWinFrame: YapSimState | null = null;
  /** Layer above the entities: red detector cone + fatal-cell marker. */
  private yapMarksLayer: Phaser.GameObjects.Graphics | null = null;
  /**
   * Camera drawing the chrome while the Failure zoom is on: zoomed by the
   * ratio like every camera (C1), but without the failure zoom.
   */
  private yapUiCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  /** D2: the data the scene was started with (route of the app flow). */
  private yapSceneData: YapLevelSceneData = {};
  // --- Hints (C7) ---
  /** Hint model of the current run: failures, hints used, ghost cells. */
  private yapHints: YapHints | null = null;
  /** Ghost layer of the revealed hint, under the player's path (draw over). */
  private yapHintLayer: Phaser.GameObjects.Graphics | null = null;
  /** Compact 💡 badge at the end of the revealed ghost path. */
  private yapHintBadge: Phaser.GameObjects.Container | null = null;
  /** The planning row's Hint button (visible only while a hint is available). */
  private yapHintButton: YapButton | null = null;
  // --- Plan preview (X3) ---
  /** The preview flag (?flag=preview:0/1, default on), resolved at build. */
  private yapPreviewEnabled = true;
  /** The ghost replay of the plan while Preview runs (null = not previewing). */
  private yapPreview: { states: readonly YapPreviewState[]; index: number } | null = null;
  /** The preview timer (one ghost tick every 1000 / YAP_PREVIEW_TICKS_PER_SECOND ms). */
  private yapPreviewTimer: Phaser.Time.TimerEvent | null = null;
  /** The planning row's Preview button (visible only when the route is complete). */
  private yapPreviewButton: YapButton | null = null;

  constructor() {
    super('yap-level');
  }

  create(data: YapLevelSceneData): void {
    // D2: the app flow restarts this scene for every level, and Phaser keeps
    // the instance — so each run starts from a clean per-level state.
    this.yapResetRun(data);
    const source = data.levelSource ?? tutorialSource;
    this.yapLevel = data.level ?? parseLevel(source, 'levels/tutorial/t1.lvl');
    this.yapState = createInitialState(this.yapLevel);
    // C7: the hints of this run (failures unlock them, the win counts them)
    this.yapHints = new YapHints(this.yapLevel);
    // the consent note may already be up (it is a scene of its own)
    this.yapConsentNote = Number(this.registry.get(YAP_CONSENT_HEIGHT_KEY) ?? 0);
    this.yapBuild(); // its paper page also sets the camera's page colour
    // Path drawing: pointer events, a single finger (Gate 1 spec).
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.yapOnPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.yapOnPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.yapOnPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.yapOnPointerUp, this);
    yapAttachSound(this); // C8: sounds + vibration on this scene's events
    this.yapOnResize = yapOnViewResize(this, () => this.yapBuild());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
    // first launch (spec §8): the consent note's height moves the header and
    // the board down; its changes rebuild the scene as a resize does
    this.events.on(Phaser.Scenes.Events.UPDATE, this.yapOnHandFrame, this);
    this.registry.events.on(`setdata-${YAP_CONSENT_HEIGHT_KEY}`, this.yapOnConsentNote);
    this.registry.events.on(`changedata-${YAP_CONSENT_HEIGHT_KEY}`, this.yapOnConsentNote);
  }

  /** Height of the first-launch consent note over the header, in px (0 = none). */
  private yapConsentNote = 0;

  /** The consent note changed height (shown, rewrapped, answered): rebuild. */
  private readonly yapOnConsentNote = (_parent: unknown, value: unknown): void => {
    const note = Math.max(0, Number(value) || 0);
    if (note === this.yapConsentNote) return;
    this.yapConsentNote = note;
    this.yapBuild();
  };

  /** RESIZE handler made by create(): rebuilds on a new view size only (C1). */
  private yapOnResize: () => void = () => undefined;

  /**
   * End-to-end hook (tests/e2e/share.spec.ts): the phase currently on screen,
   * so a browser test can wait for the planning screen or the Win screen
   * instead of sleeping. Read-only, no gameplay effect, absent outside a
   * browser.
   */
  /**
   * End-to-end hook beside `__yapPhase`: the failure stamp's text while it is
   * on the board, null otherwise. Read-only, absent outside a browser.
   */
  private yapPublishStamp(): void {
    try {
      if (typeof window !== 'undefined') {
        const on = this.yapFailureStamp !== null && this.yapFailureStamp.active;
        (window as unknown as Record<string, unknown>)['__yapStamp'] = on
          ? yapRoleCase('buttonPrimary', yapI18n.t('failure.stamp'))
          : null;
      }
    } catch {
      // no window (node tests): nothing to publish
    }
  }

  private yapSetPhase(phase: 'planning' | 'execution' | 'failure' | 'win' | 'preview'): void {
    this.yapPublishStamp();
    try {
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>)['__yapPhase'] = phase;
      }
    } catch {
      // no window: nothing to expose
    }
  }

  /**
   * End-to-end hook (tests/e2e/hidpi.spec.ts): the kicker and the title of
   * the header as drawn, after capitals and ellipsis (YapHeader.shown), so a
   * browser test reads what the player sees. Published when a header is built
   * and after each change of its right block, which can refit them. Read-only,
   * no gameplay effect, absent outside a browser.
   */
  private yapPublishHeader(): void {
    const header = this.yapHeader;
    if (header === null) return;
    try {
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>)['__yapHeader'] = header.shown();
      }
    } catch {
      // no window: nothing to expose
    }
  }

  /** D2: forget the previous run (path, playback, failure, win, attempts). */
  private yapResetRun(data: YapLevelSceneData): void {
    this.yapSceneData = data;
    this.yapHandDone = false;
    this.yapHandGhosts = [];
    this.yapHandLayer = null;
    this.yapHandGraphics = null;
    this.yapBoard = null; // destroyed with the previous run's display list
    this.yapChrome = null;
    this.yapHeader = null; // the chrome refs went with it too
    this.yapCaption = null;
    this.yapPlayButton = null;
    this.yapSpeedButton = null;
    this.yapPathInput = null;
    this.yapPointerId = null;
    this.yapExecution = null;
    this.yapDisplayed = null;
    this.yapPlayPulse = null;
    this.yapFailure = null;
    this.yapFailureFrameIndex = 0;
    this.yapFatalMarker = null;
    this.yapAttemptLog = new YapAttemptLog();
    this.yapWin = null;
    this.yapWinFrame = null;
    this.yapHints = null; // rebuilt per run in create()
    this.yapHintButton = null;
    this.yapPreview = null;
    this.yapPreviewButton = null;
  }

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.events.off(Phaser.Scenes.Events.UPDATE, this.yapOnHandFrame, this);
    this.registry.events.off(`setdata-${YAP_CONSENT_HEIGHT_KEY}`, this.yapOnConsentNote);
    this.registry.events.off(`changedata-${YAP_CONSENT_HEIGHT_KEY}`, this.yapOnConsentNote);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.yapOnPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.yapOnPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.yapOnPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.yapOnPointerUp, this);
    this.yapRemoveTickTimer();
    this.yapRemoveFailureTimer();
    this.yapRemovePreviewTimer();
    // the camera manager has already torn its cameras down on shutdown (and
    // builds a fresh main camera on the next start): only forget the UI one
    this.yapUiCamera = null;
  };

  // -------------------------------------------------------------------------
  // Pointer -> YapPathInput
  // -------------------------------------------------------------------------

  private yapIsOnBoard(layout: YapBoardLayout, x: number, y: number): boolean {
    return (
      x >= layout.originX &&
      x < layout.originX + layout.boardWidth &&
      y >= layout.originY &&
      y < layout.originY + layout.boardHeight
    );
  }

  private readonly yapOnPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // the first touch anywhere, buttons included: the player has the gesture
    if (!this.yapHandDone) {
      this.yapHandDone = true;
      this.yapStopHand();
    }
    if (this.yapFailure !== null) {
      // Failure screen: one tap anywhere goes back to the intact plan.
      this.yapExitFailure();
      return;
    }
    if (this.yapWin !== null) return; // the Win screen buttons handle their own taps
    if (this.yapPreview !== null) {
      // X3: one tap ends the preview early, back to the intact plan.
      this.yapEndPreview();
      return;
    }
    if (this.yapPointerId !== null) return; // a single finger draws
    if (this.yapExecution !== null) return; // no drawing during playback
    const layout = this.yapLayout;
    const input = this.yapPathInput;
    if (layout === null || input === null) return;
    const at = yapPointerView(this, pointer); // CSS px, like the layout (C1)
    if (!this.yapIsOnBoard(layout, at.x, at.y)) return; // buttons live off-board
    this.yapPointerId = pointer.id;
    const before = input.yapPath().length;
    input.yapPointerDown(at.x, at.y, this.game.loop.now);
    this.yapAfterPathChange(before);
  };

  private readonly yapOnPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.yapPointerId) return;
    if (this.yapExecution !== null || this.yapPreview !== null) return; // no drawing during playback/preview
    const input = this.yapPathInput;
    if (input === null) return;
    const before = input.yapPath().length;
    const at = yapPointerView(this, pointer);
    input.yapPointerMove(at.x, at.y);
    this.yapAfterPathChange(before);
  };

  private readonly yapOnPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.yapPointerId) return;
    if (this.yapExecution !== null || this.yapPreview !== null) return; // no drawing during playback/preview
    this.yapPointerId = null;
    const input = this.yapPathInput;
    if (input === null) return;
    const before = input.yapPath().length;
    const at = yapPointerView(this, pointer);
    input.yapPointerUp(at.x, at.y, this.game.loop.now);
    this.yapAfterPathChange(before);
  };

  /** Redraws the route/badges/chrome after an input event; vibrates on new cells. */
  private yapAfterPathChange(previousLength: number): void {
    const input = this.yapPathInput;
    if (input === null) return;
    if (input.yapPath().length > previousLength) {
      // each new cell: short sound + 8 ms vibration, per settings (C8, ./sound.ts)
      this.events.emit(YAP_PATH_STEP_EVENT);
    }
    this.yapRedrawPath();
    this.yapRedrawGhost(); // C6: refresh the ghost preview on every cell change
    this.yapUpdateChrome();
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  /** (Re)draw the whole screen from the current level and tick-0 state. */
  private yapBuild(): void {
    // CSS px on a device-pixel canvas (C1); during the failure replay,
    // yapApplyFailureZoom below fits both of its cameras instead
    if (this.yapFailure === null) yapFitCamera(this);
    const level = this.yapLevel;
    const state = this.yapState;
    if (level === null || state === null) return;
    if (this.yapPlayPulse !== null) {
      this.yapPlayPulse.stop();
      this.yapPlayPulse = null;
    }
    this.yapBoard?.destroy();
    this.yapChrome?.destroy();
    this.yapBoard = null;
    this.yapChrome = null;
    this.yapPathLayer = null;
    this.yapBadgeLayer = null;
    this.yapDynamic = null;
    this.yapGhostLayer = null;
    this.yapEntities = null;
    this.yapMarksLayer = null;
    this.yapHintLayer = null;
    this.yapHintBadge = null;

    const view = yapViewSize(this);
    // the thin wall frame (plan style 3/6): one geometry for drawing and input
    const layout = yapLevelLayout(
      view.width,
      view.height,
      level,
      yapConsentTopBar(this.yapConsentNote),
      YAP_BOTTOM_BAR_HEIGHT,
    );
    this.yapLayout = layout;
    // X3: the plan preview obeys its own flag (`?flag=preview:0`, default on)
    this.yapPreviewEnabled = yapResolvePreviewFlag(window.location.search);
    if (this.yapPathInput === null) {
      // C6: the ghost preview obeys the flag (`?flag=ghost:0`, stored profile)
      this.yapPathInput = new YapPathInput(level, layout, {
        ghost: yapResolveGhostFlag(window.location.search, loadYapProfile(yapStorage).flags),
      });
    } else {
      this.yapPathInput.yapSetLayout(layout); // resize keeps the drawn path
    }

    const board = this.add.container(0, 0);
    this.yapBoard = board;

    // The paper page, at the back of everything (C1 visual pass 3): the
    // camera clears to the page colour and the grid is drawn over it.
    board.add(yapPaperPage(this, view.width, view.height));

    // Static grid, drawn once into a texture (Gate 1 spec, Rendering and
    // input), at device resolution so it stays crisp on a phone.
    const bakeLayout: YapBoardLayout = { ...layout, originX: 0, originY: 0 };
    yapBakeTexture(this, YAP_GRID_TEXTURE_KEY, layout.boardWidth, layout.boardHeight, (g) =>
      yapDrawStaticGrid(g, level, bakeLayout),
    );
    board.add(yapBakedImage(this, layout.originX, layout.originY, YAP_GRID_TEXTURE_KEY));

    // the plan sheet's double ink frame (spec §7), over the grid so it stays crisp
    const frame = this.add.graphics();
    yapDrawBoardFrame(frame, layout);
    board.add(frame);

    // Patrols: ink dashed lines with arrowheads, kept secondary.
    const patrolG = this.add.graphics();
    for (const guard of level.guards) yapDrawPatrol(patrolG, layout, guard);
    board.add(patrolG);

    // Dynamic layers, redrawn per displayed tick by yapDrawState: cones and
    // lasers under the plan, entities on top of it.
    this.yapDynamic = this.add.container(0, 0);
    board.add(this.yapDynamic);

    // C6: the ghost preview layer sits above the board and the tick-0 cones,
    // under the hint ghost and the player's path (yapRedrawGhost fills it).
    this.yapGhostLayer = this.add.container(0, 0);
    board.add(this.yapGhostLayer);

    // C7: the hint ghost (dotted path of the revealed optimal plan) sits
    // under the player's route, so the player can draw over it.
    this.yapHintLayer = this.add.graphics();
    board.add(this.yapHintLayer);

    // The player's plan: a marker-red route with round joins, plus the pause
    // badges (spec §7, docs/UI-DESIGN.md, Planned path).
    this.yapPathLayer = this.add.graphics();
    board.add(this.yapPathLayer);
    this.yapBadgeLayer = this.add.container(0, 0);
    board.add(this.yapBadgeLayer);

    this.yapEntities = this.add.container(0, 0);
    board.add(this.yapEntities);

    // Marks layer, above the entities: the red detector cone and the fatal
    // cell marker during the Failure replay, the fatal-cell marker on the
    // plan after returning from a failure.
    this.yapMarksLayer = this.add.graphics();
    board.add(this.yapMarksLayer);

    // C7: compact 💡 badge at the end of the revealed ghost path, above the
    // marks: a label, it stays readable over the fatal-cell marker.
    this.yapHintBadge = this.add.container(0, 0);
    board.add(this.yapHintBadge);

    // the first-launch hand on T1 (spec §8), on top of the board
    this.yapBuildHand(board, layout);

    this.yapRedrawPath();
    // Chrome and displayed state of the current mode (planning, execution,
    // failure or win).
    const exec = this.yapExecution;
    const failure = this.yapFailure;
    const win = this.yapWin;
    if (exec !== null) {
      this.yapBuildExecutionChrome(level, layout);
      this.yapDrawState(exec.yapFrame());
      this.yapUpdateExecutionChrome();
    } else if (failure !== null) {
      this.yapBuildFailureChrome(level, layout);
      const frames = failure.yapReplayFrames(this.yapReducedMotion());
      const frame = frames[this.yapFailureFrameIndex] ?? frames[frames.length - 1];
      if (frame !== undefined) this.yapDrawState(frame);
      this.yapRedrawPath(); // the faint route past the replayed thief survives a rebuild
      this.yapApplyFailureZoom();
      if (this.yapFailureSettled) this.yapDrawFailureStamp(false);
    } else if (win !== null) {
      this.yapBuildWinChrome(level, layout);
      if (this.yapWinFrame !== null) this.yapDrawState(this.yapWinFrame);
    } else if (this.yapPreview !== null) {
      // X3: rebuild while the preview runs (resize): same ghost frame on screen
      this.yapBuildPreviewChrome(level, layout);
      const preview = this.yapPreview;
      const frame = preview.index >= 0 ? preview.states[preview.index] : undefined;
      this.yapDrawState(frame ?? state, YAP_GHOST_ALPHA);
      this.yapUpdatePreviewChrome();
    } else {
      this.yapBuildChrome(level, layout);
      this.yapDrawState(state);
      this.yapRedrawHint(); // C7: the revealed hint ghost, if any
      this.yapUpdateChrome();
    }
    this.yapRedrawMarks();
    this.yapRedrawGhost(); // C6: no ghost after a rebuild outside planning
  }

  /**
   * Redraws the dynamic layers for `state` (cones, lasers, entities) and
   * records what is on screen, so the playback can assert in dev that the
   * displayed positions equal the simulated ones at every tick. `alpha`
   * renders the whole frame as a ghost (X3 plan preview: the same reduced
   * opacity as the C6 ghost layer, so it cannot be confused with a real tick).
   */
  private yapDrawState(state: YapDrawableState, alpha = 1): void {
    const dyn = this.yapDynamic;
    const ents = this.yapEntities;
    const layout = this.yapLayout;
    const level = this.yapLevel;
    if (dyn === null || ents === null || layout === null || level === null) return;
    dyn.removeAll(true);
    ents.removeAll(true);

    // Vision cones: exactly the cells of visibleCells for this tick.
    const cones = yapGhostCones(level, state);
    const g = this.add.graphics();
    g.setAlpha(alpha);
    for (const cells of cones.guards) yapDrawCone(g, layout, cells, 'guard');
    for (const cells of cones.cameras) yapDrawCone(g, layout, cells, 'camera');
    // Lasers: solid red while on, gray dashed while off.
    for (const laser of state.lasers) {
      yapDrawLaser(g, layout, level, laser.cells, laser.active);
    }
    dyn.add(g);

    // Entities, drawn in code (plan style 3/6): exit, diamond (until picked
    // up), start, cameras, guards, and the thief on top.
    const ent = this.add.graphics();
    ent.setAlpha(alpha);
    yapDrawExit(ent, layout, level, level.exit);
    if (!state.hasLoot) yapDrawDiamond(ent, layout, level.loot);
    yapDrawStart(ent, layout, level.start);
    for (const cam of state.cameras) yapDrawCamera(ent, layout, cam.at, cam.facing);
    for (const guard of state.guards) yapDrawGuard(ent, layout, guard.pos, guard.facing);
    yapDrawThief(ent, layout, state.thief);
    ents.add(ent);

    // What is on screen right now (input of the dev assertion).
    this.yapDisplayed = {
      tick: state.tick,
      thief: state.thief,
      guards: state.guards.map((gr) => ({ pos: gr.pos, facing: gr.facing })),
      cameras: state.cameras.map((c) => ({ at: c.at, facing: c.facing })),
      lasers: state.lasers.map((l) => ({ cells: l.cells, active: l.active })),
    };
  }

  // -------------------------------------------------------------------------
  // Ghost preview (C6): while drawing, the world at the tick of the cell under
  // the finger, in a dedicated layer at reduced opacity.
  // -------------------------------------------------------------------------

  /**
   * Redraws the ghost layer. While the player draws (and the ghost flag is on),
   * `yapPathInput.yapGhostState()` is non-null and the layer shows the guards,
   * cameras, lasers and their cones at that tick — the cones are exactly the
   * cells of visibleCells for the tick (yapGhostCones), drawn with the same
   * helpers and shapes as the real entities in pencil, the whole layer at YAP_PENCIL_ALPHA
   * so it cannot be confused with the tick-0 state (docs/UI-DESIGN.md). The
   * layer is cleared as soon as the drawing stops, when the execution, the
   * failure or the win screen starts, or when the flag is off.
   */
  private yapRedrawGhost(): void {
    const layer = this.yapGhostLayer;
    const layout = this.yapLayout;
    const level = this.yapLevel;
    const input = this.yapPathInput;
    if (layer === null || layout === null || level === null) return;
    layer.removeAll(true); // hidden by default: not drawing, flag off, other mode
    const mode: YapGhostRenderMode =
      this.yapExecution !== null
        ? 'execution'
        : this.yapFailure !== null
          ? 'failure'
          : this.yapWin !== null
            ? 'win'
            : this.yapPreview !== null
              ? 'preview'
              : 'planning';
    const ghost = input === null ? null : input.yapGhostState();
    if (ghost === null || !yapGhostLayerVisible(mode, ghost)) return;

    // The pencil treatment (spec §7): graphite, dashed outlines, the whole
    // layer at YAP_PENCIL_ALPHA, so it cannot be confused with the tick-0 state.
    const g = this.add.graphics();
    g.setAlpha(YAP_PENCIL_ALPHA);
    // Cones: exactly the visibleCells cells of the ghost tick.
    const cones = yapGhostCones(level, ghost);
    for (const cells of cones.guards) yapDrawCone(g, layout, cells, 'guard', 'pencil');
    for (const cells of cones.cameras) yapDrawCone(g, layout, cells, 'camera', 'pencil');
    // Lasers at the ghost tick, same active/off treatment as the real ones.
    for (const laser of ghost.lasers) {
      yapDrawLaser(g, layout, level, laser.cells, laser.active, 'pencil');
    }
    // Cameras and guards: the same shapes as yapDrawState, in pencil.
    for (const cam of ghost.cameras) yapDrawCamera(g, layout, cam.at, cam.facing, 'pencil');
    for (const guard of ghost.guards) yapDrawGuard(g, layout, guard.pos, guard.facing, 'pencil');
    layer.add(g);
  }

  // -------------------------------------------------------------------------
  // First-launch hand (spec §8, §9; X8 storyboard): on T1, a hand draws the
  // start of the route in a loop over a dashed red ghost of the whole route,
  // until the first touch; still over the first segment under reduced motion.
  // -------------------------------------------------------------------------

  /** The hand shows on T1, in planning, before the run's first touch. */
  private yapHandWanted(): boolean {
    return (
      !this.yapHandDone &&
      this.yapSceneData.levelId === 'tutorial/t1' &&
      this.yapExecution === null &&
      this.yapFailure === null &&
      this.yapWin === null &&
      this.yapPreview === null &&
      (this.yapPathInput?.yapPath().length ?? 0) <= 1
    );
  }

  /** Builds the hand's layer on `board`: the ghost route and the hand. */
  private yapBuildHand(board: Phaser.GameObjects.Container, layout: YapBoardLayout): void {
    this.yapHandLayer = null;
    this.yapHandGhosts = []; // the previous board, and its ghost, are gone
    this.yapHandGraphics = null;
    const level = this.yapLevel;
    const plan = this.yapHints?.yapOptimalPlan() ?? null;
    if (!this.yapHandWanted() || level === null || plan === null) return;
    const cells: YapCell[] = [{ x: level.start.x, y: level.start.y }];
    for (const move of plan) {
      if (move === 'wait') continue;
      const last = cells[cells.length - 1] ?? level.start;
      const d = yapDirVector(move);
      cells.push({ x: last.x + d.x, y: last.y + d.y });
    }
    this.yapHandPoints = cells.map((c) => yapCellCenter(layout, c));
    const ghost = this.add.graphics();
    ghost.lineStyle(2.5, yapHexToInt(YAP_PALETTE.marker), 0.6);
    for (let i = 0; i + 1 < this.yapHandPoints.length; i += 1) {
      const a = this.yapHandPoints[i];
      const b = this.yapHandPoints[i + 1];
      if (a === undefined || b === undefined) continue;
      for (const seg of yapDashes(a, b, 6, 5)) ghost.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
    }
    const hand = this.add.graphics().setAlpha(0.85);
    // the ghost under the pieces (the thief stays on top of it), the hand above all
    const layer = this.add.container(0, 0, [hand]);
    const entities = this.yapEntities;
    if (entities !== null) board.addAt(ghost, board.getIndex(entities));
    this.yapHandGhosts.push(ghost);
    board.add(layer);
    this.yapHandLayer = layer;
    this.yapHandGraphics = hand;
    this.yapHandStart = this.time.now;
    this.yapDrawHandAt(this.yapReducedMotion() ? { index: 0, along: 0.5 } : { index: 0, along: 0 });
  }

  /** Segments the hand draws: the first four of the route (an excerpt). */
  private yapHandSegments(): number {
    return Math.min(4, this.yapHandPoints.length - 1);
  }

  /** Redraws the hand at `along` (0..1) of segment `index` of the route. */
  private yapDrawHandAt(pose: { readonly index: number; readonly along: number }): void {
    const g = this.yapHandGraphics;
    const layout = this.yapLayout;
    const a = this.yapHandPoints[pose.index];
    const b = this.yapHandPoints[pose.index + 1] ?? a;
    if (g === null || layout === null || a === undefined || b === undefined) return;
    g.clear();
    yapDrawHand(
      g,
      { x: a.x + (b.x - a.x) * pose.along, y: a.y + (b.y - a.y) * pose.along },
      layout.cell * 0.9,
    );
  }

  /** Each frame: the hand's loop (none under reduced motion, it stays still). */
  private readonly yapOnHandFrame = (time: number): void => {
    if (this.yapHandLayer === null || this.yapReducedMotion()) return;
    const pose = yapHandPose(time - this.yapHandStart, this.yapHandSegments());
    if (pose.visible) this.yapDrawHandAt(pose);
  };

  /** The first touch: the hand fades out (150 ms) and never comes back. */
  private yapStopHand(): void {
    const layer = this.yapHandLayer;
    this.yapHandLayer = null;
    this.yapHandGraphics = null;
    if (layer === null) return;
    const parts = [layer, ...this.yapHandGhosts.splice(0)];
    if (this.yapReducedMotion()) {
      for (const part of parts) part.destroy();
      return;
    }
    this.tweens.add({
      targets: parts,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        for (const part of parts) part.destroy();
      },
    });
  }

  /**
   * Redraws the route and the pause badges from the path-input state. The
   * route is a marker-red line (spec §7); during the playback the part the
   * thief has not walked yet is faint (yapWalkedSteps), a static redraw per
   * tick, so nothing animates under reduced motion.
   */
  private yapRedrawPath(): void {
    const input = this.yapPathInput;
    const layout = this.yapLayout;
    const g = this.yapPathLayer;
    const badges = this.yapBadgeLayer;
    if (input === null || layout === null || g === null || badges === null) return;
    g.clear();
    const cells = input.yapPath();
    // the walked part follows the thief: the playback's tick, or the replayed
    // frame's on the failure screen (so a rebuild keeps the faint route)
    const exec = this.yapExecution;
    const tick =
      exec !== null
        ? exec.yapTick()
        : this.yapFailure !== null
          ? this.yapDisplayed?.tick
          : undefined;
    const walked = tick === undefined ? undefined : yapWalkedSteps(input.yapPlan(), tick);
    yapDrawRoute(g, layout, cells, YAP_ROUTE_WIDTH, 'marker', walked);
    // pause badges: a paper pill with two marker bars and the count, on the
    // cells that hold pauses
    badges.removeAll(true);
    const pauses = input.yapPauseCounts();
    for (let i = 0; i < cells.length; i += 1) {
      const n = pauses[i] ?? 0;
      const c = cells[i];
      if (n <= 0 || c === undefined) continue;
      badges.add(this.yapPausePill(yapCellCenter(layout, c), n, 'marker'));
    }
  }

  /** A pause badge centred on `at`: a paper pill, two bars and the count. */
  private yapPausePill(
    at: { readonly x: number; readonly y: number },
    n: number,
    tone: 'marker' | 'graphite',
  ): Phaser.GameObjects.GameObject[] {
    const count = yapRoleText(this, 0, 0, String(n), 'stat', YAP_PALETTE[tone]);
    const w = YAP_PAUSE_BADGE_PAD + YAP_PAUSE_BADGE_BARS + count.width + 6;
    const h = count.height + 4;
    const pill = this.add.graphics();
    yapDrawPauseBadge(pill, at, w, h, tone);
    count.setPosition(
      Math.round(at.x - w / 2 + YAP_PAUSE_BADGE_PAD + YAP_PAUSE_BADGE_BARS),
      Math.round(at.y - count.height / 2),
    );
    return [pill, count];
  }

  // -------------------------------------------------------------------------
  // Hints (C7): after 3 then 6 failures, the Hint button reveals the first
  // third then two thirds of the optimal plan as a dotted ghost path.
  // -------------------------------------------------------------------------

  /**
   * Redraws the hint ghost: a dotted path (dots at the cell centres and at
   * the midpoints, so it cannot be confused with the solid player route)
   * over the revealed cells of the optimal plan, plus a compact 💡 badge at
   * its end. Only in planning mode; the player's path draws over it.
   */
  private yapRedrawHint(): void {
    const g = this.yapHintLayer;
    const badge = this.yapHintBadge;
    const layout = this.yapLayout;
    const hints = this.yapHints;
    if (g === null || layout === null) return;
    g.clear();
    badge?.removeAll(true);
    if (hints === null) return;
    if (this.yapExecution !== null || this.yapFailure !== null || this.yapWin !== null) return;
    const cells = hints.yapGhostCells();
    if (cells.length < 2) return;
    // the pencil treatment (spec §7): graphite dots, never the route's red
    const col = yapHexToInt(YAP_PALETTE.graphite);
    const r = Math.max(2, layout.cell * 0.1);
    g.fillStyle(col, YAP_PENCIL_ALPHA);
    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i];
      if (c === undefined) continue;
      const p = yapCellCenter(layout, c);
      g.fillCircle(p.x, p.y, r);
      const prev = cells[i - 1];
      if (prev !== undefined) {
        const q = yapCellCenter(layout, prev);
        g.fillCircle((p.x + q.x) / 2, (p.y + q.y) / 2, r * 0.8);
      }
    }
    // the pauses of the ghost, in pencil: above the cell centre, where the
    // player's own badge and the 💡 badge stay readable
    for (const pause of hints.yapGhostPauses()) {
      const p = yapCellCenter(layout, pause.cell);
      badge?.add(
        this.yapPausePill({ x: p.x, y: p.y - YAP_HINT_PAUSE_LIFT }, pause.count, 'graphite'),
      );
    }
    // compact status badge at the end of the ghost: 💡 shown/total steps, a
    // paper pill with a graphite outline
    const plan = hints.yapOptimalPlan();
    const last = cells[cells.length - 1];
    if (plan !== null && last !== undefined && badge !== null) {
      const p = yapCellCenter(layout, last);
      const label = yapRoleText(
        this,
        0,
        0,
        yapI18n.t('hints.badge', { shown: cells.length - 1, total: plan.length }),
        'stat',
        YAP_PALETTE.graphite,
      ).setOrigin(0.5);
      const w = label.width + 12;
      const h = label.height + 4;
      const bg = this.add
        .graphics()
        .fillStyle(yapHexToInt(YAP_PALETTE.paper), 1)
        .fillRoundedRect(-w / 2, -h / 2, w, h, h / 2)
        .lineStyle(1.5, col, 1)
        .strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      const at = this.add.container(p.x, p.y);
      at.add([bg, label]);
      badge.add(at);
    }
  }

  /**
   * The Hint button: reveals the next tier of the optimal plan as a ghost
   * and counts the hint (the Win screen puts one 💡 per hint in the share).
   */
  private yapOnHint(): void {
    const hints = this.yapHints;
    if (hints === null) return;
    const reveal = hints.yapUseHint();
    if (reveal === null) return;
    this.yapRedrawHint();
    this.yapUpdateChrome();
    track('hint_used', {
      level_id: this.yapSceneData.levelId ?? 'tutorial/t1',
      hint_index: reveal.index,
      attempt: this.yapAttemptLog.yapAttempts(),
    });
  }

  // -------------------------------------------------------------------------
  // Chrome (C1 visual pass 3): the header and the footer of every mode come
  // from the component kit (./kit.ts), the Win card and the toasts too.
  // -------------------------------------------------------------------------

  /**
   * A new chrome container for a mode. The refs to the chrome of the mode
   * before are forgotten (the caller destroyed it with its container), so an
   * update meant for one mode never reaches another.
   */
  private yapNewChrome(): Phaser.GameObjects.Container {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    this.yapHeader = null;
    this.yapCaption = null;
    this.yapPlayButton = null;
    this.yapHintButton = null;
    this.yapPreviewButton = null;
    this.yapSpeedButton = null;
    this.yapRuler = null;
    return chrome;
  }

  /**
   * The header of every mode (spec §8): the kicker and the title of the level
   * (yapHeaderText) over the hairline, and the right block of the mode, which
   * the mode then changes in place (yapSetHeaderRight). During the playback
   * (`running`) the kicker says so and the last right line, the tick counter,
   * is set large.
   */
  private yapBuildHeader(
    chrome: Phaser.GameObjects.Container,
    layout: YapBoardLayout,
    level: YapLevel,
    right: readonly string[],
    running = false,
  ): void {
    const header = yapHeader(this, layout.viewWidth, {
      ...this.yapHeaderText(level, running),
      right,
      rightLarge: running,
    });
    header.container.setY(this.yapConsentNote); // under the first-launch note
    chrome.add(header.container);
    this.yapHeader = header;
    this.yapPublishHeader();
  }

  /**
   * The kicker and the title of the header, from the scene data (D2). A
   * tutorial level is titled with its lesson (spec §10) and numbered out of
   * five; a heist keeps its level name, under its number as the daily heist,
   * an archive or a challenge. `running` wraps the kicker for the playback.
   * Without scene data: no kicker, and the level name.
   */
  private yapHeaderText(
    level: YapLevel,
    running: boolean,
  ): { readonly kicker: string; readonly title: string } {
    const { mode, day, levelId } = this.yapSceneData;
    const lesson = levelId === undefined ? undefined : YAP_TUTORIAL_LESSONS[levelId];
    let kicker = '';
    if (mode === 'tutorial') {
      if (lesson !== undefined) kicker = yapI18n.t('header.tutorial', { n: lesson.n });
    } else if (mode !== undefined && day !== undefined && day > 0) {
      kicker = yapI18n.t(YAP_HEIST_KICKERS[mode], { day });
    }
    if (running && kicker !== '') kicker = yapI18n.t('header.running', { kicker });
    return { kicker, title: lesson === undefined ? level.name : yapI18n.t(lesson.title) };
  }

  /** Shows `lines` on the right of the header, then publishes what it shows. */
  private yapSetHeaderRight(lines: readonly string[]): void {
    const header = this.yapHeader;
    if (header === null) return;
    header.setRight(lines);
    this.yapPublishHeader(); // a block of another width refits the kicker and the title
  }

  /**
   * Planning chrome (spec §8): the header with the plan's ticks against par
   * and the pauses left, and the footer: a rule on the bar's top, the
   * caption, then one row of Clear, the Hint slot (C7, shown only while a
   * hint is available) and PLAY, from yapPlanningRow. yapUpdateChrome, which
   * runs right after the build, keeps them in step with the plan.
   */
  private yapBuildChrome(level: YapLevel, layout: YapBoardLayout): void {
    this.yapSetPhase('planning');
    const chrome = this.yapNewChrome();
    this.yapBuildHeader(chrome, layout, level, this.yapPlanningRight(level));

    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    chrome.add(yapRule(this, 0, layout.viewWidth, barY + 0.5));
    // the caption: yapSetCaption writes it, places it, or hides it
    const caption = yapRoleText(this, 0, 0, '', 'caption', YAP_PALETTE['ink-muted']);
    chrome.add(caption);
    this.yapCaption = caption;

    const rowY = layout.viewHeight - YAP_ROW_FROM_BOTTOM;
    const canPlay = this.yapPathInput?.yapCanPlay() ?? false;
    const hasPreview = this.yapHasPreview(canPlay);
    const hasHint = this.yapHasHint(hasPreview);
    const row = yapPlanningRow(layout.viewWidth, hasHint, hasPreview);
    const clear = yapButton(this, {
      x: row.clear.x,
      y: rowY,
      width: row.clear.width,
      label: yapI18n.t('planning.clear'),
      kind: 'secondary',
      onPress: () => {
        const pathInput = this.yapPathInput;
        if (pathInput === null) return;
        const before = pathInput.yapPath().length;
        pathInput.yapClear();
        this.yapAfterPathChange(before);
      },
    });
    chrome.add(clear.container);

    // The Hint button keeps its slot and shows only while a hint is available
    // (a hidden button takes no tap); PLAY gives it the width it takes.
    const hintBox = yapPlanningRow(layout.viewWidth, true).hint;
    if (hintBox !== null) {
      const hint = yapButton(this, {
        x: hintBox.x,
        y: rowY,
        width: hintBox.width,
        label: yapI18n.t('hints.button'),
        kind: 'secondary',
        onPress: () => this.yapOnHint(),
      });
      hint.container.setVisible(hasHint);
      chrome.add(hint.container);
      this.yapHintButton = hint;
    }

    // X3: the Preview button takes the Hint slot once the drawn route is
    // complete and the preview flag is on (the Hint's ghost stays drawn).
    const previewBox = yapPlanningRow(layout.viewWidth, false, true).preview;
    if (previewBox !== null) {
      const preview = yapButton(this, {
        x: previewBox.x,
        y: rowY,
        width: previewBox.width,
        label: yapI18n.t('preview.button'),
        kind: 'secondary',
        // on the release: fired on the press, the scene's own pointerdown,
        // which runs after the button's, would read the press as the tap
        // that ends the preview it just started
        fireOn: 'up',
        onPress: () => this.yapStartPreview(),
      });
      preview.container.setVisible(hasPreview);
      chrome.add(preview.container);
      this.yapPreviewButton = preview;
    }

    // PLAY, the primary action: disabled, it says "Draw your route" and the
    // kit does not run its action, so a tap on it starts nothing
    const play = yapButton(this, {
      x: row.play.x,
      y: rowY,
      width: row.play.width,
      label: yapI18n.t(canPlay ? 'planning.play' : 'planning.drawRoute'),
      kind: 'primary',
      enabled: canPlay,
      onPress: () => {
        const pathInput = this.yapPathInput;
        if (pathInput === null || !pathInput.yapCanPlay()) return;
        const plan: YapPlan = pathInput.yapPlan();
        this.events.emit(YAP_PLAY_EVENT, plan);
        this.yapStartExecution(plan);
      },
    });
    chrome.add(play.container);
    this.yapPlayButton = play;
  }

  /** X3: Preview shows once the route is complete, the flag on, no preview running. */
  private yapHasPreview(canPlay: boolean): boolean {
    return canPlay && this.yapPreviewEnabled && this.yapPreview === null;
  }

  /** C7: Hint shows while a hint is available, unless Preview takes its slot. */
  private yapHasHint(hasPreview: boolean): boolean {
    return (this.yapHints?.yapHintAvailable() ?? false) && !hasPreview;
  }

  /**
   * The planning header's right block, spec §8: the plan's ticks against par,
   * then the pauses left.
   */
  private yapPlanningRight(level: YapLevel): readonly string[] {
    const input = this.yapPathInput;
    return [
      yapI18n.t('header.ticks', { ticks: input?.yapSteps() ?? 0, par: level.par }),
      yapI18n.t('header.pauses', { count: input?.yapPausesLeft() ?? level.maxPauses }),
    ];
  }

  /**
   * Shows `text` as the planning caption, centred between the rule and the
   * row, on whole pixels. It is hidden when it would touch the row or the
   * rule, or run past the margins: the bar has no room for a second line.
   */
  private yapSetCaption(layout: YapBoardLayout, text: string): void {
    const caption = this.yapCaption;
    if (caption === null) return;
    if (caption.text !== text) caption.setText(text);
    const top = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    const rowTop = layout.viewHeight - YAP_ROW_FROM_BOTTOM - YAP_BUTTON_HEIGHT / 2;
    const fits =
      caption.width <= yapLineRoom(layout.viewWidth) &&
      caption.height + 2 * YAP_CAPTION_CLEARANCE <= rowTop - top;
    caption.setVisible(fits);
    if (!fits) return;
    caption.setPosition(
      Math.round((layout.viewWidth - caption.width) / 2),
      Math.round((top + rowTop - caption.height) / 2),
    );
  }

  /**
   * Refreshes the planning chrome: the header's stats, the caption, the Hint
   * slot and PLAY, disabled ("Draw your route") until the plan can run.
   */
  private yapUpdateChrome(): void {
    const input = this.yapPathInput;
    const level = this.yapLevel;
    const layout = this.yapLayout;
    const play = this.yapPlayButton;
    // planning only: no other mode has a PLAY
    if (input === null || level === null || layout === null || play === null) return;
    this.yapSetHeaderRight(this.yapPlanningRight(level));
    const canPlay = input.yapCanPlay();
    // the caption says what to do until the plan can run, then gives the star
    // targets to chase (X1): 3★ at par, 2★ up to twoStarMax
    const { par, twoStarMax } = yapStarThresholds(level.par);
    this.yapSetCaption(
      layout,
      canPlay
        ? yapI18n.t('planning.starTargets', { par, twoStarMax })
        : yapI18n.t('planning.grabDiamond'),
    );
    // C7: the Hint button appears only while a hint is available, and PLAY
    // gives it the width it takes: the primary action stays the widest.
    // X3: once the route is complete, Preview takes the Hint slot.
    const hasPreview = this.yapHasPreview(canPlay);
    const hasHint = this.yapHasHint(hasPreview);
    this.yapHintButton?.container.setVisible(hasHint);
    this.yapPreviewButton?.container.setVisible(hasPreview);
    const box = yapPlanningRow(layout.viewWidth, hasHint, hasPreview).play;
    play.setBox(box.x, box.width);
    play.setLabel(yapI18n.t(canPlay ? 'planning.play' : 'planning.drawRoute'));
    play.setEnabled(canPlay);
    if (canPlay && !this.yapReducedMotion()) {
      // PLAY pulses once the drawing auto-finished at the exit (not under
      // reduced motion). The kit's press also scales PLAY, for 120 ms, but a
      // press of PLAY stops the pulse and destroys this chrome.
      if (this.yapPlayPulse === null) {
        this.yapPlayPulse = this.tweens.add({
          targets: play.container,
          scale: 1.03,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else if (this.yapPlayPulse !== null) {
      this.yapPlayPulse.stop();
      this.yapPlayPulse = null;
      play.container.setScale(1);
    }
  }

  // -------------------------------------------------------------------------
  // Execution (C3): PLAY runs the plan through resolveTick at 4 ticks/s
  // -------------------------------------------------------------------------

  /**
   * Execution chrome (spec §8): the header says the heist is running, the
   * tick counter large on its right, and the footer row holds ×2 where Clear
   * was and Stop where PLAY was, both secondary.
   */
  private yapBuildExecutionChrome(level: YapLevel, layout: YapBoardLayout): void {
    this.yapSetPhase('execution');
    const chrome = this.yapNewChrome();
    const exec = this.yapExecution;
    const right = exec === null ? [] : this.yapExecutionRight(exec);
    this.yapBuildHeader(chrome, layout, level, right, true);

    const [speedBox, stopBox] = yapActionRow(layout.viewWidth, [
      { width: YAP_PLANNING_CLEAR_WIDTH },
      {},
    ]);
    if (speedBox === undefined || stopBox === undefined) return;
    const rowY = layout.viewHeight - YAP_ROW_FROM_BOTTOM;
    const speed = yapButton(this, {
      x: speedBox.x,
      y: rowY,
      width: speedBox.width,
      label: yapI18n.t('execution.speed', { speed: exec?.yapSpeed() ?? 1 }),
      kind: 'secondary',
      onPress: () => this.yapToggleExecutionSpeed(),
    });
    const stop = yapButton(this, {
      x: stopBox.x,
      y: rowY,
      width: stopBox.width,
      label: yapI18n.t('execution.stop'),
      kind: 'secondary',
      onPress: () => this.yapStopExecution(),
    });
    chrome.add([speed.container, stop.container]);
    this.yapSpeedButton = speed;
    // the ruler (spec §8): the playback's progress, a graduation per tick,
    // between the rule on the bar's top and the row
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    chrome.add(yapRule(this, 0, layout.viewWidth, barY + 0.5));
    const ruler = yapRuler(this, 16, barY + 20, layout.viewWidth - 32, exec?.yapMaxTick() ?? 1);
    chrome.add(ruler.container);
    this.yapRuler = ruler;
  }

  /**
   * The execution header's right block: "Tick" over the counter, the tick
   * zero-padded to the width of the last one ("07/26"), so the block keeps
   * its width and the header never refits during the playback.
   */
  private yapExecutionRight(exec: YapExecution): readonly string[] {
    const max = String(exec.yapMaxTick());
    const tick = String(exec.yapTick()).padStart(max.length, '0');
    return [yapI18n.t('header.tick'), `${tick}/${max}`];
  }

  /** Refreshes the execution chrome: the tick counter and the ×2 label. */
  private yapUpdateExecutionChrome(): void {
    const exec = this.yapExecution;
    if (exec === null) return;
    this.yapSetHeaderRight(this.yapExecutionRight(exec));
    this.yapSpeedButton?.setLabel(yapI18n.t('execution.speed', { speed: exec.yapSpeed() }));
    this.yapRuler?.setProgress(exec.yapTick() / Math.max(1, exec.yapMaxTick()));
  }

  /** PLAY: starts the playback of the drawn plan. */
  private yapStartExecution(plan: YapPlan): void {
    const level = this.yapLevel;
    const layout = this.yapLayout;
    if (level === null || layout === null) return;
    // every press of PLAY counts as an attempt — until the heist is won
    // (replaying after the win never changes attempts, Gate 1 spec)
    this.yapAttemptLog.yapPressPlay();
    this.yapFatalMarker = null; // a new attempt clears the old fatal marker
    const exec = new YapExecution(level, plan);
    this.yapExecution = exec;
    exec.yapStart();
    // the PLAY pulse targets the planning chrome destroyed below
    if (this.yapPlayPulse !== null) {
      this.yapPlayPulse.stop();
      this.yapPlayPulse = null;
    }
    this.yapChrome?.destroy();
    this.yapChrome = null;
    this.yapBuildExecutionChrome(level, layout);
    this.yapDrawState(exec.yapFrame());
    this.yapRedrawMarks();
    this.yapRedrawGhost(); // C6: the ghost preview is cleared when PLAY starts
    this.yapRedrawPath(); // tick 0: the whole route ahead of the thief is faint
    this.yapUpdateExecutionChrome();
    this.yapScheduleTick();
  }

  /** One playback tick: advance, redraw, assert displayed == simulated. */
  private readonly yapOnExecutionTick = (): void => {
    const exec = this.yapExecution;
    if (exec === null) return;
    const frame = exec.yapAdvance();
    if (frame === null) {
      this.yapEndExecution();
      return;
    }
    this.yapDrawState(frame);
    this.yapRedrawPath(); // the walked part of the route follows the thief
    this.events.emit(YAP_EXECUTION_TICK_EVENT, frame);
    // Dev assertion: what is on screen is exactly the simulated frame.
    if (this.yapDisplayed !== null) exec.yapAssertDisplayedMatchesSim(this.yapDisplayed);
    this.yapUpdateExecutionChrome();
  };

  /** The plan is fully played: stop the timer, then failure or end event. */
  private yapEndExecution(): void {
    this.yapRemoveTickTimer();
    const exec = this.yapExecution;
    if (exec === null) return;
    const outcome = exec.yapOutcome();
    this.events.emit(YAP_EXECUTION_END_EVENT, outcome);
    if (outcome.kind === 'detected') {
      // C4: slow-motion replay of the last ticks, zoom, written cause.
      this.yapAttemptLog.yapRegisterFailure(outcome.cause);
      // C7: each failure on the heist brings the hints closer (3, then 6)
      if (!this.yapAttemptLog.yapIsWon()) this.yapHints?.yapRegisterFailure();
      this.yapStartFailure(exec);
      return;
    }
    if (outcome.kind === 'won') {
      // C5: the Win screen over the final frame.
      this.yapAttemptLog.yapRegisterWin();
      this.yapStartWin(exec);
      return;
    }
    this.yapUpdateExecutionChrome();
  }

  /** Stop: back to the plan (tick 0, planning chrome, path kept). */
  private yapStopExecution(): void {
    this.yapRemoveTickTimer();
    const exec = this.yapExecution;
    if (exec !== null) exec.yapStop();
    this.yapExecution = null;
    const level = this.yapLevel;
    const layout = this.yapLayout;
    const state = this.yapState;
    if (level !== null && layout !== null) {
      this.yapChrome?.destroy();
      this.yapChrome = null;
      this.yapBuildChrome(level, layout);
    }
    if (state !== null) this.yapDrawState(state);
    this.yapRedrawPath();
    this.yapRedrawGhost(); // C6: back to planning, no stroke in progress
    this.yapUpdateChrome();
  }

  /** ×2 toggle: the playback timer restarts at the new rate. */
  private yapToggleExecutionSpeed(): void {
    const exec = this.yapExecution;
    if (exec === null) return;
    exec.yapToggleSpeed();
    this.yapUpdateExecutionChrome();
    this.yapScheduleTick();
  }

  /** (Re)starts the playback timer: one tick every yapTickMs (4 ticks/s, ×2). */
  private yapScheduleTick(): void {
    const exec = this.yapExecution;
    if (exec === null) return;
    this.yapRemoveTickTimer();
    this.yapTickTimer = this.time.addEvent({
      delay: exec.yapTickMs(),
      loop: true,
      callback: this.yapOnExecutionTick,
    });
  }

  private yapRemoveTickTimer(): void {
    if (this.yapTickTimer !== null) {
      this.yapTickTimer.remove();
      this.yapTickTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Plan preview (X3): the Angry Birds "dotted arc" — replay the drawn plan
  // as a fast ghost (thief + threats at each tick, reduced opacity), then
  // back to planning with the route kept and PLAY still available.
  // -------------------------------------------------------------------------

  /**
   * Preview button: replays the complete drawn plan in ghost mode. The states
   * come from yapPreviewStates (./ghost.ts), computed only through
   * resolveTick; the scene just draws them one by one at
   * YAP_PREVIEW_TICKS_PER_SECOND with the C6 ghost treatment (YAP_GHOST_ALPHA).
   */
  private yapStartPreview(): void {
    const level = this.yapLevel;
    const layout = this.yapLayout;
    const input = this.yapPathInput;
    if (level === null || layout === null || input === null) return;
    if (!input.yapCanPlay() || !this.yapPreviewEnabled || this.yapPreview !== null) return;
    const plan: YapPlan = input.yapPlan();
    if (plan.length === 0) return;
    const states = yapPreviewStates(level, plan);
    this.yapPreview = { states, index: -1 }; // -1 = tick 0, drawn right below
    // the PLAY pulse targets the planning chrome destroyed below
    if (this.yapPlayPulse !== null) {
      this.yapPlayPulse.stop();
      this.yapPlayPulse = null;
    }
    this.yapChrome?.destroy();
    this.yapChrome = null;
    this.yapBuildPreviewChrome(level, layout);
    if (this.yapState !== null) this.yapDrawState(this.yapState, YAP_GHOST_ALPHA); // tick 0
    this.yapUpdatePreviewChrome();
    this.yapSchedulePreviewTick();
  }

  /** One preview tick: draw the next ghost state; stop on win/caught. */
  private readonly yapOnPreviewTick = (): void => {
    const preview = this.yapPreview;
    if (preview === null) return;
    preview.index += 1;
    const state = preview.states[preview.index];
    if (state === undefined) {
      this.yapEndPreview();
      return;
    }
    this.yapDrawState(state, YAP_GHOST_ALPHA);
    this.yapUpdatePreviewChrome();
    if (state.outcome.kind !== 'running') {
      // win or caught: hold the final frame, then back to planning
      this.yapRemovePreviewTimer();
      this.time.delayedCall(YAP_PREVIEW_END_HOLD_MS, () => this.yapEndPreview());
    }
  };

  /**
   * End of the preview (finished, or one tap): back to planning — tick 0 at
   * full opacity, the route kept, PLAY available again.
   */
  private yapEndPreview(): void {
    if (this.yapPreview === null) return;
    this.yapRemovePreviewTimer();
    this.yapPreview = null;
    const level = this.yapLevel;
    const layout = this.yapLayout;
    const state = this.yapState;
    if (level !== null && layout !== null) {
      this.yapChrome?.destroy();
      this.yapChrome = null;
      this.yapBuildChrome(level, layout);
    }
    if (state !== null) this.yapDrawState(state); // tick 0, planning view
    this.yapRedrawPath(); // the drawn route and its pauses are untouched
    this.yapRedrawMarks();
    this.yapRedrawGhost(); // C6: no stroke in progress after the preview
    this.yapUpdateChrome();
  }

  /**
   * Preview chrome (X3, in the plan style): the running header with the ghost
   * tick counter, a rule on the bar's top and the running indicator as the
   * caption. No button: one tap anywhere ends the preview early.
   */
  private yapBuildPreviewChrome(level: YapLevel, layout: YapBoardLayout): void {
    this.yapSetPhase('preview');
    const chrome = this.yapNewChrome();
    this.yapBuildHeader(chrome, layout, level, this.yapPreviewRight(), true);
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    chrome.add(yapRule(this, 0, layout.viewWidth, barY + 0.5));
    const caption = yapRoleText(
      this,
      0,
      0,
      yapI18n.t('preview.running'),
      'caption',
      YAP_PALETTE['ink-muted'],
    );
    caption.setPosition(
      Math.round((layout.viewWidth - caption.width) / 2),
      Math.round(barY + (YAP_BOTTOM_BAR_HEIGHT - caption.height) / 2),
    );
    chrome.add(caption);
  }

  /**
   * The preview header's right block, as in the playback: "Tick" over the
   * ghost tick, zero-padded to the width of the last one. States are ticks
   * 1..N, and index -1 is tick 0.
   */
  private yapPreviewRight(): readonly string[] {
    const preview = this.yapPreview;
    if (preview === null) return [];
    const max = String(preview.states.length);
    const tick = String(Math.max(0, preview.index + 1)).padStart(max.length, '0');
    return [yapI18n.t('header.tick'), `${tick}/${max}`];
  }

  /** Refreshes the preview chrome: the tick counter of the header. */
  private yapUpdatePreviewChrome(): void {
    if (this.yapPreview === null) return;
    this.yapSetHeaderRight(this.yapPreviewRight());
  }

  /** (Re)starts the preview timer: one ghost tick every preview tick ms. */
  private yapSchedulePreviewTick(): void {
    this.yapRemovePreviewTimer();
    this.yapPreviewTimer = this.time.addEvent({
      delay: Math.round(1000 / YAP_PREVIEW_TICKS_PER_SECOND),
      loop: true,
      callback: this.yapOnPreviewTick,
    });
  }

  private yapRemovePreviewTimer(): void {
    if (this.yapPreviewTimer !== null) {
      this.yapPreviewTimer.remove();
      this.yapPreviewTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Failure (C4): slow-motion replay of the last 4 ticks, zoom, written
  // cause with a marker on the fatal cell, then one tap back to the intact
  // plan (path and pauses kept).
  // -------------------------------------------------------------------------

  /** prefers-reduced-motion: the replay is shortened (Gate 1 spec). */
  private yapReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  /** Detection: enter the Failure screen and start the slow-motion replay. */
  private yapStartFailure(exec: YapExecution): void {
    const level = this.yapLevel;
    const layout = this.yapLayout;
    if (level === null || layout === null) return;
    const replay = new YapFailureReplay(exec.yapFrames(), exec.yapOutcome());
    this.yapFailure = replay;
    this.yapFailureSettled = false;
    this.yapFailureStamp?.destroy();
    this.yapFailureStamp = null;
    this.yapExecution = null; // the playback is over; the failure drives now
    this.yapFatalMarker = replay.yapFatalCell();
    this.yapChrome?.destroy();
    this.yapChrome = null;
    this.yapBuildFailureChrome(level, layout);
    // zoom on the thief and whatever saw it
    this.yapApplyFailureZoom();
    // replay the last ticks at quarter speed
    const frames = replay.yapReplayFrames(this.yapReducedMotion());
    this.yapFailureFrameIndex = 0;
    const first = frames[0];
    if (first !== undefined) this.yapDrawState(first);
    this.yapRedrawMarks();
    this.yapScheduleFailureTick();
  }

  /** One replayed tick: draw the next of the last frames, cone in red. */
  private readonly yapOnFailureTick = (): void => {
    const replay = this.yapFailure;
    if (replay === null) return;
    const frames = replay.yapReplayFrames(this.yapReducedMotion());
    this.yapFailureFrameIndex += 1;
    if (this.yapFailureFrameIndex >= frames.length) {
      // the replay is over: the fatal frame, cause and marker stay on
      // screen until the tap that returns to the plan
      this.yapFailureFrameIndex = frames.length - 1;
      this.yapRemoveFailureTimer();
    }
    const frame = frames[this.yapFailureFrameIndex];
    if (frame === undefined) return;
    this.yapDrawState(frame);
    this.yapRedrawPath(); // the walked part follows the replayed thief
    this.yapRedrawMarks();
    if (this.yapFailureTimer === null && !this.yapFailureSettled) {
      this.yapFailureSettled = true;
      this.yapDrawFailureStamp(true); // the replay has settled: REPÉRÉ lands
    }
  };

  /**
   * The REPÉRÉ stamp (spec §8), near the fatal cell once the replay settles.
   * It sits in board space, so it follows the zoom, scaled back so it keeps
   * its size, up and to the right of the cell and inside the board.
   */
  private yapDrawFailureStamp(thump: boolean): void {
    const replay = this.yapFailure;
    const layout = this.yapLayout;
    const board = this.yapBoard;
    if (replay === null || layout === null || board === null) return;
    const zoom = replay.yapZoomFactor(layout);
    const p = yapCellCenter(layout, replay.yapFatalCell());
    const x = Math.min(p.x + layout.cell * 0.9, layout.originX + layout.boardWidth - 40 / zoom);
    const y = Math.max(p.y - layout.cell * 0.55, layout.originY + 20 / zoom);
    const holder = this.add.container(x, y).setScale(1 / zoom);
    holder.add(yapStamp(this, 0, 0, yapI18n.t('failure.stamp'), 'stamp', { thump }));
    board.add(holder);
    this.yapFailureStamp = holder;
    this.yapPublishStamp();
  }

  /** (Re)starts the slow-motion replay timer (quarter speed). */
  private yapScheduleFailureTick(): void {
    const replay = this.yapFailure;
    if (replay === null) return;
    this.yapRemoveFailureTimer();
    this.yapFailureTimer = this.time.addEvent({
      delay: replay.yapTickMs(this.yapReducedMotion()),
      loop: true,
      callback: this.yapOnFailureTick,
    });
  }

  private yapRemoveFailureTimer(): void {
    if (this.yapFailureTimer !== null) {
      this.yapFailureTimer.remove();
      this.yapFailureTimer = null;
    }
  }

  /** One tap on the Failure screen: back to the intact plan (kept). */
  private yapExitFailure(): void {
    this.yapRemoveFailureTimer();
    this.yapFailure = null;
    this.yapFailureSettled = false;
    // the stamp lives on the board, which outlives the failure screen
    this.yapFailureStamp?.destroy();
    this.yapFailureStamp = null;
    this.yapResetCamera();
    const level = this.yapLevel;
    const layout = this.yapLayout;
    const state = this.yapState;
    if (level !== null && layout !== null) {
      this.yapChrome?.destroy();
      this.yapChrome = null;
      this.yapBuildChrome(level, layout);
    }
    if (state !== null) this.yapDrawState(state); // tick 0, planning view
    this.yapRedrawPath(); // the drawn path and its pauses are untouched
    this.yapRedrawMarks(); // the red fatal-cell marker stays on the plan
    this.yapRedrawGhost(); // C6: no stroke in progress after the failure
    this.yapUpdateChrome();
  }

  /**
   * Zooms the board on the midpoint between the thief and the detector. Only
   * the board zooms: the main camera is clipped to the area between the bars,
   * and a UI camera without the failure zoom draws the chrome, so the written
   * cause and the attempt number stay on screen. Camera viewports are in
   * device pixels (C1): the CSS rectangles are scaled by the ratio, and so is
   * the zoom.
   */
  private yapApplyFailureZoom(): void {
    const replay = this.yapFailure;
    const layout = this.yapLayout;
    if (replay === null || layout === null) return;
    const focus = replay.yapZoomFocus();
    const a = yapCellCenter(layout, { x: Math.floor(focus.x), y: Math.floor(focus.y) });
    const b = yapCellCenter(layout, { x: Math.ceil(focus.x), y: Math.ceil(focus.y) });
    const cam = this.cameras.main;
    // the band under the header (itself under the first-launch consent note)
    const band = yapPlanningBand(layout.viewHeight, this.yapConsentNote);
    cam.setViewport(0, band.y * YAP_DPR, layout.viewWidth * YAP_DPR, band.height * YAP_DPR);
    // keep the zoomed view on the grid, never on the empty margins around it
    cam.setBounds(layout.originX, layout.originY, layout.boardWidth, layout.boardHeight);
    cam.setZoom(replay.yapZoomFactor(layout) * YAP_DPR);
    cam.centerOn((a.x + b.x) / 2, (a.y + b.y) / 2);
    const uiWidth = layout.viewWidth * YAP_DPR;
    const uiHeight = layout.viewHeight * YAP_DPR;
    const ui = this.yapUiCamera ?? this.cameras.add(0, 0, uiWidth, uiHeight);
    ui.setSize(uiWidth, uiHeight);
    yapFitCamera(this, ui);
    this.yapUiCamera = ui;
    if (this.yapChrome !== null) cam.ignore(this.yapChrome);
    if (this.yapBoard !== null) ui.ignore(this.yapBoard);
  }

  /** Back to the full-board view: one camera on the whole CSS view, no bounds. */
  private yapResetCamera(): void {
    if (this.yapUiCamera !== null) {
      this.cameras.remove(this.yapUiCamera);
      this.yapUiCamera = null;
    }
    const cam = this.cameras.main;
    cam.removeBounds();
    const device = yapDeviceViewport(this);
    cam.setViewport(0, 0, device.width, device.height);
    yapFitCamera(this, cam);
  }

  /**
   * Redraws the marks layer: during the Failure replay, the cone of whatever
   * saw the thief in red plus the fatal-cell marker; back on the plan, the
   * red fatal-cell marker alone (docs/UI-DESIGN.md, Failure screen).
   */
  private yapRedrawMarks(): void {
    const g = this.yapMarksLayer;
    const layout = this.yapLayout;
    if (g === null || layout === null) return;
    g.clear();
    const failure = this.yapFailure;
    if (failure !== null) {
      yapDrawCone(g, layout, failure.yapDetectorSeen(), 'stamp');
      this.yapDrawFatalMarker(g, layout, failure.yapFatalCell());
    } else if (this.yapFatalMarker !== null) {
      this.yapDrawFatalMarker(g, layout, this.yapFatalMarker);
    }
  }

  /**
   * The fatal-cell marker (spec §7): a 3 px stamp-red outline on the cell, a
   * ring and a bold X over the thief (icon + shape, not color alone).
   */
  private yapDrawFatalMarker(
    g: Phaser.GameObjects.Graphics,
    layout: YapBoardLayout,
    cell: YapCell,
  ): void {
    const rect = yapCellRect(layout, cell);
    const p = yapCellCenter(layout, cell);
    const r = layout.cell * 0.42;
    const red = yapHexToInt(YAP_PALETTE.stamp);
    g.lineStyle(3, red, 1).strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
    g.lineStyle(2, red, 1).strokeCircle(p.x, p.y, r);
    const s = r * 0.62;
    g.lineStyle(Math.max(3, layout.cell * 0.08), red, 1)
      .lineBetween(p.x - s, p.y - s, p.x + s, p.y + s)
      .lineBetween(p.x - s, p.y + s, p.x + s, p.y - s);
  }

  /**
   * Failure chrome (spec §8): the header with the attempt number, and the
   * footer under a rule: the written cause (i18n key of the cause) with its
   * warning icon, then how to go back. No button: one tap anywhere returns to
   * the plan. The zoomed main camera only covers the board area; the UI
   * camera draws this chrome.
   */
  private yapBuildFailureChrome(level: YapLevel, layout: YapBoardLayout): void {
    this.yapSetPhase('failure');
    const chrome = this.yapNewChrome();
    this.yapBuildHeader(chrome, layout, level, [
      yapI18n.t('failure.attempt', { n: this.yapAttemptLog.yapAttempts() }),
    ]);

    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    chrome.add(yapRule(this, 0, layout.viewWidth, barY + 0.5));
    const failure = this.yapFailure;
    const causeText =
      failure !== null ? yapI18n.t(failure.yapCauseKey()) : yapI18n.t('failure.spottedByGuard');
    const cause = yapRoleText(this, 0, barY + 12, causeText, 'body', YAP_PALETTE.ink);
    cause.setX(Math.round((layout.viewWidth - cause.width) / 2));
    chrome.add(cause);
    // warning icon next to the cause: triangle + "!" (icon, not color alone)
    const iconX = cause.x - 20;
    const iconY = cause.y + cause.height / 2;
    const s = 9;
    const warn = this.add.graphics();
    warn
      .fillStyle(yapHexToInt(YAP_PALETTE.stamp), 1)
      .fillTriangle(iconX, iconY - s, iconX - s, iconY + s * 0.8, iconX + s, iconY + s * 0.8)
      .lineStyle(1, yapHexToInt(YAP_PALETTE.ink), 1)
      .strokeTriangle(iconX, iconY - s, iconX - s, iconY + s * 0.8, iconX + s, iconY + s * 0.8);
    chrome.add(warn);
    chrome.add(
      yapText(this, iconX, iconY - 1, '!', yapTextStyle(12, YAP_PALETTE.paper)).setOrigin(
        0.5,
        0.5,
      ),
    );
    // how to go back, in the mono stat role: a long line (French) loses its
    // letter spacing, then wraps, rather than run past the margins
    const back = yapRoleText(
      this,
      0,
      barY + 46,
      yapI18n.t('failure.tapToReturn'),
      'stat',
      YAP_PALETTE['ink-muted'],
      { align: 'center' },
    );
    yapFitLine(back, yapLineRoom(layout.viewWidth));
    back.setX(Math.round((layout.viewWidth - back.width) / 2));
    chrome.add(back);
  }

  // -------------------------------------------------------------------------
  // Win (C5): the Win screen over the final frame — attempts, ticks vs par,
  // stars, the emoji-line preview, and Share / Improve / Home.
  // -------------------------------------------------------------------------

  /** Win: build the Win screen model and put its chrome over the final frame. */
  private yapStartWin(exec: YapExecution): void {
    const level = this.yapLevel;
    const layout = this.yapLayout;
    if (level === null || layout === null) return;
    const outcome = exec.yapOutcome();
    if (outcome.kind !== 'won') return;
    // C7: the hints used are counted in the share (💡 in the emoji line and
    // the hints field of the E1 payload, src/game/win.ts)
    this.yapWin = new YapWinScreen(
      level,
      outcome,
      this.yapAttemptLog,
      this.yapHints?.yapHintsUsed() ?? 0,
    );
    this.yapWinFrame = exec.yapFrame(); // the won frame stays on the board
    this.yapWinStampLanded = false; // a new win: its stamp lands again
    this.yapExecution = null; // the playback is over; the Win screen drives now
    this.yapChrome?.destroy();
    this.yapChrome = null;
    this.yapBuildWinChrome(level, layout);
    this.yapDrawState(this.yapWinFrame);
    this.yapRedrawMarks();
  }

  /**
   * Win chrome (spec §8): the header with the par, and an index card from
   * under the header to the bottom of the page with the title, the attempts /
   * ticks / par / stars rows, the emoji-line preview, Improve my score and
   * Home, and at its foot the dominant Share: the action lives inside the card
   * that it concludes.
   */
  /**
   * The win report (spec §8): the final board dimmed to about 28% behind a
   * fiche — the report's kicker, the level title, leader rows (Attempts,
   * Ticks, Par, Stars in gold) and, under a dashed rule, the telegram Share
   * sends — with the CASSE RÉUSSI stamp over its top-right corner. Under it,
   * Share (primary, full width), then Improve and Home or Next level.
   */
  private yapBuildWinChrome(level: YapLevel, layout: YapBoardLayout): void {
    this.yapSetPhase('win');
    const chrome = this.yapNewChrome();
    const win = this.yapWin;
    if (win === null) return;
    // the final board, dimmed to about 28% behind the report
    chrome.add(
      this.add
        .rectangle(
          0,
          0,
          layout.viewWidth,
          layout.viewHeight,
          yapHexToInt(YAP_PALETTE['paper-page']),
          0.72,
        )
        .setOrigin(0, 0),
    );
    this.yapBuildHeader(chrome, layout, level, [
      yapI18n.t('planning.statsPar', { par: level.par }),
    ]);

    const body = this.add.container(0, 0);
    chrome.add(body);
    const actions = yapWinActions(layout.viewHeight);
    const cardX = 16;
    const cardW = layout.viewWidth - 32;
    const innerX = cardX + 20;
    const innerW = cardW - 40;

    // CASSE RÉUSSI across the fiche's top-right corner: centred on its top
    // edge, its tilted box kept inside the card's width (placed below)
    const stamp = yapStamp(this, 0, 0, yapI18n.t('winScreen.stamp'), 'stamp', {
      thump: !this.yapWinStampLanded,
      maxWidth: Math.min(200, cardW * 0.6),
      size: 15,
    });
    const tilt = (Math.abs(YAP_STAMP_ANGLE) * Math.PI) / 180;
    const halfSpan = (stamp.width * Math.cos(tilt) + stamp.height * Math.sin(tilt)) / 2;
    const stampX = Math.round(cardX + cardW - halfSpan - 6);
    // its lowest corner, the bottom-left one (the stamp tilts up to the right),
    // relative to the card's top edge
    const cornerX =
      stampX - (stamp.width / 2) * Math.cos(tilt) + (stamp.height / 2) * Math.sin(tilt);
    const cornerY = -2 + (stamp.width / 2) * Math.sin(tilt) + (stamp.height / 2) * Math.cos(tilt);

    // the report's content, laid out from 0, then the card sized to it
    const content = this.add.container(0, 0);
    let y = 0;
    const { day, mode } = this.yapSceneData;
    const heading = this.yapHeaderText(level, false);
    const kicker =
      mode === 'tutorial' || day === undefined || day <= 0
        ? heading.kicker
        : yapI18n.t('winScreen.report', { day });
    // the content starts below the stamp's corner when the kicker would run under it
    let padTop = 20;
    if (kicker !== '') {
      const kick = yapRoleText(this, innerX, y, kicker, 'kicker', YAP_PALETTE['ink-muted']);
      content.add(kick);
      if (innerX + kick.width + 6 > cornerX) padTop = Math.max(padTop, Math.ceil(cornerY + 8));
      y += 20;
    }
    // the title leaves room on the right for the stamp
    const title = yapRoleText(this, innerX, y, heading.title, 'cardTitle', YAP_PALETTE.ink, {
      wordWrap: { width: innerW - 70 },
    });
    content.add(title);
    y += title.height + 12;
    const rows: readonly (readonly [string, string, YapPaletteToken])[] = [
      [yapI18n.t('win.attempts'), String(win.yapAttempts()), 'ink'],
      [yapI18n.t('win.ticks'), String(win.yapTicks()), 'ink'],
      [yapI18n.t('win.par'), String(win.yapPar()), 'ink'],
      [yapI18n.t('win.stars'), win.yapStarsText(), 'star'],
    ];
    for (const [label, value, colour] of rows) {
      content.add(yapLeaderRow(this, innerX, y, innerW, label, value, colour));
      y += 28;
    }
    y += 6;
    // the telegram: what Share sends, under a dashed rule
    const dashes = this.add.graphics().lineStyle(1, yapHexToInt(YAP_PALETTE.ink), 0.35);
    for (const s of yapDashes(
      { x: innerX, y: y + 0.5 },
      { x: innerX + innerW, y: y + 0.5 },
      4,
      3,
    )) {
      dashes.lineBetween(s.x1, s.y1, s.x2, s.y2);
    }
    content.add(dashes);
    y += 12;
    const telegram = yapRoleText(this, innerX, y, '', 'stat', YAP_PALETTE.ink);
    const line = yapTelegram(
      // the stars as the share sends them (one ⭐ each); {line} and {ticks} stay
      yapI18n.t('winScreen.telegram', { stars: yapShareStars(win.yapStars()) }),
      win.yapEmojiLine(),
      win.yapTicks(),
      innerW,
      (candidate) => yapSetRoleText(telegram, 'stat', candidate).width,
    );
    // through the emoji guard: the empty text took the role's letter spacing,
    // which would split an astral emoji (👁️ 📷 🔴 💡) in two
    yapSetRoleText(telegram, 'stat', line);
    content.add(telegram);
    y += telegram.height;

    const padY = 20;
    const cardH = Math.round(y + padTop + padY);
    const top = yapConsentTopBar(this.yapConsentNote) + 24;
    const room = actions.top - 16 - top;
    const cardY = Math.round(top + Math.max(0, (room - cardH) / 2));
    content.setY(cardY + padTop);
    body.add(yapCard(this, cardX, cardY, cardW, cardH));
    body.add(content);
    stamp.setPosition(stampX, cardY - 2);
    body.add(stamp);
    this.yapWinStampLanded = true; // it thumps once per win, not on a rebuild

    const [improveBox, homeBox] = yapActionRow(cardW, [{}, {}], 0);
    if (improveBox !== undefined && homeBox !== undefined) {
      const improve = yapButton(this, {
        x: cardX + improveBox.x,
        y: actions.rowY,
        width: improveBox.width,
        height: YAP_WIN_ROW_HEIGHT,
        label: yapI18n.t('win.improve'),
        kind: 'secondary',
        onPress: () => this.yapExitWin(),
      });
      const home = yapButton(this, {
        x: cardX + homeBox.x,
        y: actions.rowY,
        width: homeBox.width,
        height: YAP_WIN_ROW_HEIGHT,
        label: this.yapSceneData.winHomeLabel ?? yapI18n.t('win.home'),
        kind: 'secondary',
        onPress: () => this.yapOnWinHome(),
      });
      body.add([improve.container, home.container]);
    }
    const share = yapButton(this, {
      x: cardX,
      y: actions.shareY,
      width: cardW,
      label: yapI18n.t('win.share'),
      kind: 'primary',
      fireOn: 'up',
      onPress: () => this.yapOnWinShare(),
    });
    body.add(share.container);
    if (yapResolveShareVariant() === 'image') {
      void yapPrepareShareImage(yapResolveShareDay(level.type, this.sys.settings.data));
    }
    yapFadeIn(this, body, 180, 12);
  }

  /** Improve my score: back to the intact plan (attempts stay at the win). */
  private yapExitWin(): void {
    this.yapWin = null;
    this.yapWinFrame = null;
    const level = this.yapLevel;
    const layout = this.yapLayout;
    const state = this.yapState;
    if (level !== null && layout !== null) {
      this.yapChrome?.destroy();
      this.yapChrome = null;
      this.yapBuildChrome(level, layout);
    }
    if (state !== null) this.yapDrawState(state); // tick 0, planning view
    this.yapRedrawPath(); // the drawn path and its pauses are untouched
    this.yapRedrawMarks();
    this.yapRedrawGhost(); // C6: no stroke in progress after the win
    this.yapUpdateChrome();
  }

  /**
   * Share (E2): one tap to the share sheet, or the text copied with a
   * "Copied" message (src/app/share.ts). Runs synchronously from pointerup:
   * nothing is awaited before navigator.share. The day comes from the scene
   * data (`day`, D2) when there is one; a tutorial win has no daily heist and
   * shares an invitation to the game instead (day 0 in share_tapped).
   */
  private yapOnWinShare(): void {
    const win = this.yapWin;
    const level = this.yapLevel;
    if (win === null || level === null) return;
    const day = yapResolveShareDay(level.type, this.sys.settings.data);
    const plan = this.yapPathInput?.yapPlan() ?? [];
    const payload = day === null ? null : win.yapPayloadData(day, plan, yapLoadShareId());
    const content = yapBuildShareContent(win.yapSharePayload(), payload);
    void yapShare({
      context: 'win',
      day: day ?? 0,
      content,
      variant: yapResolveShareVariant(),
      image: yapPreparedShareImage(day),
    }).then((report) => this.yapShowShareToast(report));
    this.events.emit(YAP_WIN_SHARE_EVENT, win.yapSharePayload());
  }

  /**
   * E2: a transient "Copied" (or failure) note, 8 px above the Win card's
   * action stack, in the card's free space: it covers no button.
   */
  private yapShowShareToast(report: YapShareReport): void {
    const chrome = this.yapChrome;
    const layout = this.yapLayout;
    if (!this.sys.isActive() || this.yapWin === null || chrome === null || layout === null) return;
    let message: string | null = null;
    if (report.outcome === 'error') message = yapI18n.t('share.failed');
    else if (report.method === 'clipboard') message = yapI18n.t('common.copied');
    if (message === null) return;
    yapShowToast(
      this,
      chrome,
      layout.viewWidth / 2,
      yapWinActions(layout.viewHeight).top - 8,
      message,
    );
  }

  /** Home (stub until D2): emits a scene event. */
  private yapOnWinHome(): void {
    this.events.emit(YAP_WIN_HOME_EVENT);
  }
}
