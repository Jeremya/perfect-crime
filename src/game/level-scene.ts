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
// On a win (C5), YapWinScreen (./win.ts) drives the Win screen: a panel over
// the final frame with attempts, ticks vs par, stars, the emoji-line preview
// and Share (dominant, stub event until E2) / Improve my score / Home. Every
// PLAY press counts as an attempt until the win; replaying after the win
// never changes attempts.
// Layout adapts to the viewport (readable on a 360 x 640 screen) and rebuilds
// on resize, preserving the drawn path.
//
// Rendering never computes a rule: everything shown comes from the pure sim
// (src/core/sim.ts) via the helpers of ./board.ts; drawing lives in ./render.ts
// and the path overlay below; the input rules live in ./path-input.ts.
import Phaser from 'phaser';
import { parseLevel, type YapCell, type YapLevel } from '../core/level';
import { createInitialState, type YapPlan, type YapSimState } from '../core/sim';
import { yapI18n } from '../app/i18n';
import {
  yapBuildShareContent,
  yapLoadShareId,
  yapPrepareShareImage,
  yapPreparedShareImage,
  yapResolveShareDay,
  yapResolveShareVariant,
  yapShare,
  type YapShareReport,
} from '../app/share';
import tutorialSource from '../../levels/tutorial/t1.lvl?raw';
import {
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_DANGER_LINE_WIDTH,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapCellCenter,
  yapComputeLayout,
  yapConeCells,
  yapDirVector,
  yapHexToInt,
  yapLaserCells,
  type YapBoardLayout,
} from './board';
import { YapPathInput } from './path-input';
import { YapExecution, type YapDisplayedSnapshot } from './execution';
import { YapFailureReplay } from './failure';
import { YapAttemptLog, YapWinScreen } from './win';
import {
  YAP_EXECUTION_TICK_EVENT,
  YAP_PATH_STEP_EVENT,
  YAP_UI_TAP_EVENT,
  yapAttachSound,
} from './sound';
import {
  yapDrawCamera,
  yapDrawCone,
  yapDrawDiamond,
  yapDrawExit,
  yapDrawLaser,
  yapDrawPatrol,
  yapDrawStaticGrid,
  yapDrawStart,
  yapDrawThief,
} from './render';

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

/** A bottom-bar button: rounded rect drawn in code + a zone as hit area. */
interface YapChromeButton {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
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
  private yapStatsText: Phaser.GameObjects.Text | null = null;
  private yapInstruction: Phaser.GameObjects.Text | null = null;
  /** Size of the PLAY button, so yapUpdateChrome can repaint it in place. */
  private yapPlaySize: { readonly w: number; readonly h: number } | null = null;
  private yapPlayButton: YapChromeButton | null = null;
  private yapPlayPulse: Phaser.Tweens.Tween | null = null;
  /** Id of the single finger currently drawing (null = none). */
  private yapPointerId: number | null = null;
  /** Playback controller while PLAY runs (null = planning mode). */
  private yapExecution: YapExecution | null = null;
  /** Dynamic layer under the path: cones and lasers of the displayed tick. */
  private yapDynamic: Phaser.GameObjects.Container | null = null;
  /** Entity layer on top of the path: thief, guards, cameras, objectives. */
  private yapEntities: Phaser.GameObjects.Container | null = null;
  /** What is on screen right now (input of the dev assertion). */
  private yapDisplayed: YapDisplayedSnapshot | null = null;
  /** The playback timer (one tick every yapTickMs). */
  private yapTickTimer: Phaser.Time.TimerEvent | null = null;
  private yapExecTickText: Phaser.GameObjects.Text | null = null;
  private yapSpeedButton: YapChromeButton | null = null;
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
  /** Unzoomed camera drawing the chrome while the Failure zoom is on. */
  private yapUiCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  /** D2: the data the scene was started with (route of the app flow). */
  private yapSceneData: YapLevelSceneData = {};

  constructor() {
    super('yap-level');
  }

  preload(): void {
    this.load.image('yap-thief', '/assets/kenney/thief-hitman-stand.png');
    this.load.image('yap-guard', '/assets/kenney/guard-man-brown-stand.png');
  }

  create(data: YapLevelSceneData): void {
    // D2: the app flow restarts this scene for every level, and Phaser keeps
    // the instance — so each run starts from a clean per-level state.
    this.yapResetRun(data);
    const source = data.levelSource ?? tutorialSource;
    this.yapLevel = data.level ?? parseLevel(source, 'levels/tutorial/t1.lvl');
    this.yapState = createInitialState(this.yapLevel);
    this.cameras.main.setBackgroundColor(YAP_PALETTE['surface-page']);
    this.yapBuild();
    // Path drawing: pointer events, a single finger (Gate 1 spec).
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.yapOnPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.yapOnPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.yapOnPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.yapOnPointerUp, this);
    yapAttachSound(this); // C8: sounds + vibration on this scene's events
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuild();
  };

  /** D2: forget the previous run (path, playback, failure, win, attempts). */
  private yapResetRun(data: YapLevelSceneData): void {
    this.yapSceneData = data;
    this.yapBoard = null; // destroyed with the previous run's display list
    this.yapChrome = null;
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
  }

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.yapOnPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.yapOnPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.yapOnPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.yapOnPointerUp, this);
    this.yapRemoveTickTimer();
    this.yapRemoveFailureTimer();
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
    if (this.yapFailure !== null) {
      // Failure screen: one tap anywhere goes back to the intact plan.
      this.yapExitFailure();
      return;
    }
    if (this.yapWin !== null) return; // the Win screen buttons handle their own taps
    if (this.yapPointerId !== null) return; // a single finger draws
    if (this.yapExecution !== null) return; // no drawing during playback
    const layout = this.yapLayout;
    const input = this.yapPathInput;
    if (layout === null || input === null) return;
    if (!this.yapIsOnBoard(layout, pointer.x, pointer.y)) return; // buttons live off-board
    this.yapPointerId = pointer.id;
    const before = input.yapPath().length;
    input.yapPointerDown(pointer.x, pointer.y, this.game.loop.now);
    this.yapAfterPathChange(before);
  };

  private readonly yapOnPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.yapPointerId) return;
    if (this.yapExecution !== null) return; // no drawing during playback
    const input = this.yapPathInput;
    if (input === null) return;
    const before = input.yapPath().length;
    input.yapPointerMove(pointer.x, pointer.y);
    this.yapAfterPathChange(before);
  };

  private readonly yapOnPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.yapPointerId) return;
    if (this.yapExecution !== null) return; // no drawing during playback
    this.yapPointerId = null;
    const input = this.yapPathInput;
    if (input === null) return;
    const before = input.yapPath().length;
    input.yapPointerUp(pointer.x, pointer.y, this.game.loop.now);
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
    this.yapUpdateChrome();
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  /** (Re)draw the whole screen from the current level and tick-0 state. */
  private yapBuild(): void {
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
    this.yapEntities = null;
    this.yapMarksLayer = null;

    const layout = yapComputeLayout(
      this.scale.width,
      this.scale.height,
      level.width,
      level.height,
      YAP_TOP_BAR_HEIGHT,
      YAP_BOTTOM_BAR_HEIGHT,
    );
    this.yapLayout = layout;
    if (this.yapPathInput === null) {
      this.yapPathInput = new YapPathInput(level, layout);
    } else {
      this.yapPathInput.yapSetLayout(layout); // resize keeps the drawn path
    }

    const board = this.add.container(0, 0);
    this.yapBoard = board;

    // Board card (C1 visual pass): a soft shadow under the grid and a 2 px
    // frame around it. Without them the tiles floated on a background only
    // 1.28:1 away from the floor, which read as a wireframe.
    const outline = yapHexToInt(YAP_PALETTE['path-outline']);
    const card = this.add.graphics();
    for (const [dy, alpha] of [
      [3, 0.09],
      [6, 0.06],
      [9, 0.03],
    ] as const) {
      card
        .fillStyle(outline, alpha)
        .fillRoundedRect(
          layout.originX + 1,
          layout.originY + dy,
          layout.boardWidth - 2,
          layout.boardHeight,
          10,
        );
    }
    board.add(card);

    // Static grid, drawn once into a texture (Gate 1 spec, Rendering and input).
    const bakeLayout: YapBoardLayout = { ...layout, originX: 0, originY: 0 };
    const grid = this.make.graphics({ x: 0, y: 0 }, false);
    yapDrawStaticGrid(grid, level, bakeLayout);
    if (this.textures.exists(YAP_GRID_TEXTURE_KEY)) {
      this.textures.remove(YAP_GRID_TEXTURE_KEY);
    }
    grid.generateTexture(YAP_GRID_TEXTURE_KEY, layout.boardWidth, layout.boardHeight);
    grid.destroy();
    board.add(this.add.image(layout.originX, layout.originY, YAP_GRID_TEXTURE_KEY).setOrigin(0, 0));

    // the frame sits on top of the grid so the edge stays crisp
    const frame = this.add.graphics();
    frame
      .lineStyle(2, outline, 1)
      .strokeRect(
        layout.originX + 1,
        layout.originY + 1,
        layout.boardWidth - 2,
        layout.boardHeight - 2,
      );
    board.add(frame);

    // Patrols: thin dotted lines with direction arrows, kept secondary.
    const patrolG = this.add.graphics();
    for (const guard of level.guards) yapDrawPatrol(patrolG, layout, guard);
    board.add(patrolG);

    // Dynamic layers, redrawn per displayed tick by yapDrawState: cones and
    // lasers under the plan, entities on top of it.
    this.yapDynamic = this.add.container(0, 0);
    board.add(this.yapDynamic);

    // The player's plan: thick rounded near-white route with a dark outline,
    // plus compact pause badges (docs/UI-DESIGN.md, Planned path).
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
      this.yapApplyFailureZoom();
    } else if (win !== null) {
      this.yapBuildWinChrome(level, layout);
      if (this.yapWinFrame !== null) this.yapDrawState(this.yapWinFrame);
    } else {
      this.yapBuildChrome(level, layout);
      this.yapDrawState(state);
      this.yapUpdateChrome();
    }
    this.yapRedrawMarks();
  }

  /**
   * Redraws the dynamic layers for `state` (cones, lasers, entities) and
   * records what is on screen, so the playback can assert in dev that the
   * displayed positions equal the simulated ones at every tick.
   */
  private yapDrawState(state: YapSimState): void {
    const dyn = this.yapDynamic;
    const ents = this.yapEntities;
    const layout = this.yapLayout;
    const level = this.yapLevel;
    if (dyn === null || ents === null || layout === null || level === null) return;
    dyn.removeAll(true);
    ents.removeAll(true);

    // Vision cones: exactly the cells of visibleCells for this tick.
    const cones = yapConeCells(level, state);
    const g = this.add.graphics();
    for (const cells of cones.guards) yapDrawCone(g, layout, cells, 'danger-guard');
    for (const cells of cones.cameras) yapDrawCone(g, layout, cells, 'danger-camera');
    // Lasers: solid red while on, gray dashed while off.
    for (const laser of yapLaserCells(state)) {
      yapDrawLaser(g, layout, laser.cells, laser.active);
    }
    dyn.add(g);

    // Entities: exit, diamond (until picked up), cameras, guards, thief on top.
    const ent = this.add.graphics();
    yapDrawExit(ent, layout, level.exit);
    if (!state.hasLoot) yapDrawDiamond(ent, layout, level.loot);
    yapDrawStart(ent, layout, level.start);
    for (const cam of state.cameras) yapDrawCamera(ent, layout, cam.at, cam.facing);
    yapDrawThief(ent, layout, state.thief);
    ents.add(ent);

    // Kenney Top-down Shooter stand poses: the warm character chips separate
    // guards from the thief. The pose is upright (rotating a standing human
    // 90° read as a fallen body); facing is shown by a wedge on the chip.
    for (const guard of state.guards) {
      const p = yapCellCenter(layout, guard.pos);
      const marker = this.add.graphics();
      const r = layout.cell * 0.42;
      marker
        .fillStyle(yapHexToInt(YAP_PALETTE['danger-guard']), 1)
        .fillCircle(p.x, p.y, r)
        .lineStyle(2, yapHexToInt(YAP_PALETTE['text-primary']), 1)
        .strokeCircle(p.x, p.y, r);
      const d = yapDirVector(guard.facing);
      const px = -d.y;
      const py = d.x;
      marker.fillStyle(yapHexToInt(YAP_PALETTE['text-primary']), 1).fillTriangle(
        p.x + d.x * r * 0.98,
        p.y + d.y * r * 0.98,
        p.x + d.x * r * 0.42 + px * r * 0.3,
        p.y + d.y * r * 0.42 + py * r * 0.3,
        p.x + d.x * r * 0.42 - px * r * 0.3,
        p.y + d.y * r * 0.42 - py * r * 0.3,
      );
      const sprite = this.add
        .image(p.x, p.y, 'yap-guard')
        .setDisplaySize(layout.cell * 0.62, layout.cell * 0.82);
      ents.add([marker, sprite]);
    }
    const thiefAt = yapCellCenter(layout, state.thief);
    ents.add(
      this.add
        .image(thiefAt.x, thiefAt.y, 'yap-thief')
        .setDisplaySize(layout.cell * 0.7, layout.cell * 0.9),
    );

    // What is on screen right now (input of the dev assertion).
    this.yapDisplayed = {
      tick: state.tick,
      thief: state.thief,
      guards: state.guards.map((gr) => ({ pos: gr.pos, facing: gr.facing })),
      cameras: state.cameras.map((c) => ({ at: c.at, facing: c.facing })),
      lasers: state.lasers.map((l) => ({ cells: l.cells, active: l.active })),
    };
  }

  /** Redraws the route line and the pause badges from the path-input state. */
  private yapRedrawPath(): void {
    const input = this.yapPathInput;
    const layout = this.yapLayout;
    const g = this.yapPathLayer;
    const badges = this.yapBadgeLayer;
    if (input === null || layout === null || g === null || badges === null) return;
    g.clear();
    const cells = input.yapPath();
    const pts = cells.map((c) => yapCellCenter(layout, c));
    if (pts.length >= 2) {
      const outline = yapHexToInt(YAP_PALETTE['path-outline']);
      const light = yapHexToInt(YAP_PALETTE['path-light']);
      const wOut = Math.max(3, layout.cell * 0.36);
      const wIn = Math.max(2, layout.cell * 0.22);
      const pass = (w: number, col: number): void => {
        g.lineStyle(w, col, 1);
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const a = pts[i];
          const b = pts[i + 1];
          if (a !== undefined && b !== undefined) g.lineBetween(a.x, a.y, b.x, b.y);
        }
        g.fillStyle(col, 1);
        for (const p of pts) g.fillCircle(p.x, p.y, w / 2);
      };
      pass(wOut, outline); // dark outline first, then the near-white core
      pass(wIn, light);
    }
    // pause badges: compact "⏸ n" on the cells that hold pauses
    badges.removeAll(true);
    const pauses = input.yapPauseCounts();
    const badgeStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: YAP_PALETTE['text-primary'],
    };
    for (let i = 0; i < cells.length; i += 1) {
      const n = pauses[i] ?? 0;
      const c = cells[i];
      if (n <= 0 || c === undefined) continue;
      const p = yapCellCenter(layout, c);
      const label = this.add.text(p.x, p.y, `⏸ ${n}`, badgeStyle).setOrigin(0.5);
      const bg = this.add
        .rectangle(
          p.x,
          p.y,
          label.width + 10,
          label.height + 4,
          yapHexToInt(YAP_PALETTE['surface-panel']),
          1,
        )
        .setStrokeStyle(2, yapHexToInt(YAP_PALETTE['path-outline']));
      badges.add([bg, label]);
    }
  }

  /** Top bar (level name, plan ticks/par/pauses) and bottom action bar. */
  private yapBuildChrome(level: YapLevel, layout: YapBoardLayout): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;

    const input = this.yapPathInput;
    this.yapStatsText = this.yapBuildTopBar(
      chrome,
      layout,
      level.name,
      this.yapPlanningStats(
        level,
        input?.yapSteps() ?? 0,
        input?.yapPausesLeft() ?? level.maxPauses,
      ),
    );

    // bottom action bar: 96 px strip with the instruction, Clear and PLAY
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, layout.viewWidth, YAP_BOTTOM_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, layout.viewWidth, barY + 0.5);
    chrome.add(bar);

    // short instruction while the plan does not reach the exit with the diamond
    this.yapInstruction = this.add
      .text(layout.viewWidth / 2, barY + 12, yapI18n.t('planning.grabDiamond'), {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: YAP_PALETTE['text-secondary'],
      })
      .setOrigin(0.5, 0);
    chrome.add(this.yapInstruction);

    // One row at the bottom: Clear on the left, PLAY as the wide primary
    // action. Both are 56 px tall, comfortably above the 44 px touch target.
    const rowY = barY + YAP_BOTTOM_BAR_HEIGHT - 10 - 28;
    const clearW = 96;
    const clearBtn = this.yapMakeButton(
      16 + clearW / 2,
      rowY,
      clearW,
      56,
      yapI18n.t('planning.clear'),
      'action-secondary',
      YAP_PALETTE['text-primary'],
      () => {
        const pathInput = this.yapPathInput;
        if (pathInput === null) return;
        const before = pathInput.yapPath().length;
        pathInput.yapClear();
        this.yapAfterPathChange(before);
      },
    );
    chrome.add(clearBtn.container);

    const playX = 16 + clearW + 12;
    const playW = layout.viewWidth - 16 - playX;
    const playBtn = this.yapMakeButton(
      playX + playW / 2,
      rowY,
      playW,
      56,
      yapI18n.t('planning.drawRoute'),
      'action-primary-soft',
      YAP_PALETTE['action-primary'],
      () => {
        const pathInput = this.yapPathInput;
        if (pathInput === null || !pathInput.yapCanPlay()) return;
        const plan: YapPlan = pathInput.yapPlan();
        this.events.emit(YAP_PLAY_EVENT, plan);
        this.yapStartExecution(plan);
      },
    );
    playBtn.label.setFontSize(18).setFontStyle('bold');
    chrome.add(playBtn.container);
    this.yapPlayButton = playBtn;
    this.yapPlaySize = { w: playW, h: 56 };
  }

  /**
   * Shared top bar: the level name (20 px) and one compact stats line (14 px,
   * secondary) — one visual entry point instead of three equally loud badges.
   * Returns the stats text so the caller can refresh it in place.
   */
  private yapBuildTopBar(
    chrome: Phaser.GameObjects.Container,
    layout: YapBoardLayout,
    title: string,
    stats: string,
  ): Phaser.GameObjects.Text {
    const header = this.add.graphics();
    header
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, 0, layout.viewWidth, YAP_TOP_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, YAP_TOP_BAR_HEIGHT - 0.5, layout.viewWidth, YAP_TOP_BAR_HEIGHT - 0.5);
    chrome.add(header);

    const name = this.add
      .text(16, 24, title, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: YAP_PALETTE['text-primary'],
      })
      .setOrigin(0, 0.5);
    const statsText = this.add
      .text(16, 47, stats, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: YAP_PALETTE['text-secondary'],
      })
      .setOrigin(0, 0.5);
    chrome.add([name, statsText]);
    return statsText;
  }

  /** "18 ticks · par 20 · 3 pauses", all from the dictionaries. */
  private yapPlanningStats(level: YapLevel, ticks: number, pauses: number): string {
    return [
      yapI18n.t('planning.statsTicks', { ticks }),
      yapI18n.t('planning.statsPar', { par: level.par }),
      yapI18n.t('planning.statsPauses', { count: pauses }),
    ].join(yapI18n.t('planning.statsSeparator'));
  }

  /** A rounded button drawn in code: graphics + zone hit area + label. */
  private yapMakeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    labelText: string,
    fillToken: 'action-primary' | 'action-primary-soft' | 'action-secondary',
    textColor: string,
    onPress: () => void,
  ): YapChromeButton {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(yapHexToInt(YAP_PALETTE[fillToken]), 1)
      .fillRoundedRect(-w / 2, -h / 2, w, h, 10)
      .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: textColor,
      })
      .setOrigin(0.5);
    zone.on('pointerdown', onPress);
    zone.on('pointerdown', () => this.events.emit(YAP_UI_TAP_EVENT));
    container.add([bg, zone, label]);
    return { container, bg, label };
  }

  /** Refreshes the dynamic chrome: stats line, instruction, PLAY state. */
  private yapUpdateChrome(): void {
    const input = this.yapPathInput;
    const level = this.yapLevel;
    if (input === null || level === null) return;
    this.yapStatsText?.setText(
      this.yapPlanningStats(level, input.yapSteps(), input.yapPausesLeft()),
    );
    const canPlay = input.yapCanPlay();
    this.yapInstruction?.setVisible(!canPlay);
    const play = this.yapPlayButton;
    const size = this.yapPlaySize;
    if (play === null || size === null) return;
    // The primary action always carries the brand hue: solid teal once the
    // plan can run, a soft teal prompt ("Draw your route") before that.
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    play.bg
      .clear()
      .fillStyle(
        yapHexToInt(YAP_PALETTE[canPlay ? 'action-primary' : 'action-primary-soft']),
        1,
      )
      .fillRoundedRect(-halfW, -halfH, size.w, size.h, 10)
      .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
      .strokeRoundedRect(-halfW, -halfH, size.w, size.h, 10);
    play.label
      .setText(yapI18n.t(canPlay ? 'planning.play' : 'planning.drawRoute'))
      .setColor(YAP_PALETTE[canPlay ? 'path-light' : 'action-primary']);
    if (canPlay) {
      // PLAY pulses once the drawing auto-finished at the exit
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

  /** Top bar (level name, tick counter, par) and bottom bar (×2, Stop). */
  private yapBuildExecutionChrome(level: YapLevel, layout: YapBoardLayout): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    // the tick line is filled by yapUpdateExecutionChrome right after the build
    this.yapExecTickText = this.yapBuildTopBar(chrome, layout, level.name, '');
    // the planning-only chrome refs do not exist in this mode
    this.yapStatsText = null;
    this.yapInstruction = null;
    this.yapPlayButton = null;
    this.yapPlaySize = null;

    // bottom action bar: 96 px strip with ×2 on the left, Stop on the right
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, layout.viewWidth, YAP_BOTTOM_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, layout.viewWidth, barY + 0.5);
    chrome.add(bar);

    const rowY = barY + YAP_BOTTOM_BAR_HEIGHT - 10 - 28;
    const speedBtn = this.yapMakeButton(
      16 + 48,
      rowY,
      96,
      56,
      yapI18n.t('execution.speed', { speed: 1 }),
      'action-secondary',
      YAP_PALETTE['text-primary'],
      () => this.yapToggleExecutionSpeed(),
    );
    chrome.add(speedBtn.container);
    this.yapSpeedButton = speedBtn;
    const stopBtn = this.yapMakeButton(
      layout.viewWidth - 16 - 60,
      rowY,
      120,
      56,
      yapI18n.t('execution.stop'),
      'action-primary',
      YAP_PALETTE['path-light'],
      () => this.yapStopExecution(),
    );
    chrome.add(stopBtn.container);
  }

  /** Refreshes the execution chrome: tick counter and ×2 label. */
  private yapUpdateExecutionChrome(): void {
    const exec = this.yapExecution;
    const level = this.yapLevel;
    if (exec === null || level === null) return;
    this.yapExecTickText?.setText(
      [
        yapI18n.t('executionPlayback.tick', { tick: exec.yapTick(), max: exec.yapMaxTick() }),
        yapI18n.t('planning.statsPar', { par: level.par }),
      ].join(yapI18n.t('planning.statsSeparator')),
    );
    this.yapSpeedButton?.label.setText(yapI18n.t('execution.speed', { speed: exec.yapSpeed() }));
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
    this.yapRedrawMarks();
  };

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
    this.yapUpdateChrome();
  }

  /**
   * Zooms the board on the midpoint between the thief and the detector. Only
   * the board zooms: the main camera is clipped to the area between the bars,
   * and an unzoomed UI camera draws the chrome, so the written cause and the
   * attempt number stay on screen.
   */
  private yapApplyFailureZoom(): void {
    const replay = this.yapFailure;
    const layout = this.yapLayout;
    if (replay === null || layout === null) return;
    const focus = replay.yapZoomFocus();
    const a = yapCellCenter(layout, { x: Math.floor(focus.x), y: Math.floor(focus.y) });
    const b = yapCellCenter(layout, { x: Math.ceil(focus.x), y: Math.ceil(focus.y) });
    const cam = this.cameras.main;
    cam.setViewport(
      0,
      YAP_TOP_BAR_HEIGHT,
      layout.viewWidth,
      layout.viewHeight - YAP_TOP_BAR_HEIGHT - YAP_BOTTOM_BAR_HEIGHT,
    );
    // keep the zoomed view on the grid, never on the empty margins around it
    cam.setBounds(layout.originX, layout.originY, layout.boardWidth, layout.boardHeight);
    cam.setZoom(replay.yapZoomFactor(layout));
    cam.centerOn((a.x + b.x) / 2, (a.y + b.y) / 2);
    const ui = this.yapUiCamera ?? this.cameras.add(0, 0, layout.viewWidth, layout.viewHeight);
    ui.setSize(layout.viewWidth, layout.viewHeight);
    this.yapUiCamera = ui;
    if (this.yapChrome !== null) cam.ignore(this.yapChrome);
    if (this.yapBoard !== null) ui.ignore(this.yapBoard);
  }

  /** Back to the full-board view (one camera, zoom 1, no scroll). */
  private yapResetCamera(): void {
    if (this.yapUiCamera !== null) {
      this.cameras.remove(this.yapUiCamera);
      this.yapUiCamera = null;
    }
    const cam = this.cameras.main;
    cam.removeBounds();
    cam.setViewport(0, 0, this.scale.width, this.scale.height);
    cam.setZoom(1);
    cam.centerOn(this.scale.width / 2, this.scale.height / 2);
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
      yapDrawCone(g, layout, failure.yapDetectorSeen(), 'danger-laser');
      this.yapDrawFatalMarker(g, layout, failure.yapFatalCell());
    } else if (this.yapFatalMarker !== null) {
      this.yapDrawFatalMarker(g, layout, this.yapFatalMarker);
    }
  }

  /** The fatal-cell marker: a red ring with a bold X (icon + shape, not color). */
  private yapDrawFatalMarker(
    g: Phaser.GameObjects.Graphics,
    layout: YapBoardLayout,
    cell: YapCell,
  ): void {
    const p = yapCellCenter(layout, cell);
    const r = layout.cell * 0.42;
    const red = yapHexToInt(YAP_PALETTE['danger-laser']);
    g.lineStyle(YAP_DANGER_LINE_WIDTH, red, 1).strokeCircle(p.x, p.y, r);
    const s = r * 0.62;
    g.lineStyle(Math.max(3, layout.cell * 0.09), red, 1)
      .lineBetween(p.x - s, p.y - s, p.x + s, p.y + s)
      .lineBetween(p.x - s, p.y + s, p.x + s, p.y - s);
  }

  /**
   * Failure chrome: top bar with the level name and the attempt number,
   * bottom bar with the written cause (i18n key of the cause) and the
   * tap-to-return hint. No button: one tap anywhere returns to the plan.
   */
  private yapBuildFailureChrome(level: YapLevel, layout: YapBoardLayout): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    const textStyle = (size: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'sans-serif',
      fontSize: `${size}px`,
      color: YAP_PALETTE['text-primary'],
    });
    // the zoomed main camera only covers the board area; this top bar is
    // drawn on the UI camera, in the same style as the other modes
    this.yapBuildTopBar(
      chrome,
      layout,
      level.name,
      yapI18n.t('failure.attempt', { n: this.yapAttemptLog.yapAttempts() }),
    );

    // bottom action bar: 96 px strip with the written cause and the hint
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, layout.viewWidth, YAP_BOTTOM_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, layout.viewWidth, barY + 0.5);
    chrome.add(bar);

    const failure = this.yapFailure;
    const causeText =
      failure !== null ? yapI18n.t(failure.yapCauseKey()) : yapI18n.t('failure.spottedByGuard');
    const cause = this.add
      .text(layout.viewWidth / 2, barY + 12, causeText, textStyle(16))
      .setOrigin(0.5, 0);
    chrome.add(cause);
    // warning icon next to the cause: triangle + "!" (icon, not color alone)
    const iconX = cause.x - cause.width / 2 - 20;
    const iconY = cause.y + cause.height / 2;
    const s = 9;
    const warn = this.add.graphics();
    warn
      .fillStyle(yapHexToInt(YAP_PALETTE['danger-laser']), 1)
      .fillTriangle(iconX, iconY - s, iconX - s, iconY + s * 0.8, iconX + s, iconY + s * 0.8)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['path-outline']), 1)
      .strokeTriangle(iconX, iconY - s, iconX - s, iconY + s * 0.8, iconX + s, iconY + s * 0.8);
    chrome.add(warn);
    chrome.add(
      this.add
        .text(iconX, iconY - 1, '!', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: YAP_PALETTE['path-light'],
        })
        .setOrigin(0.5, 0.5),
    );
    chrome.add(
      this.add
        .text(layout.viewWidth / 2, barY + 46, yapI18n.t('failure.tapToReturn'), {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: YAP_PALETTE['text-secondary'],
        })
        .setOrigin(0.5, 0),
    );
    // the planning/execution chrome refs do not exist in this mode
    this.yapStatsText = null;
    this.yapInstruction = null;
    this.yapPlayButton = null;
    this.yapPlaySize = null;
    this.yapExecTickText = null;
    this.yapSpeedButton = null;
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
    this.yapWin = new YapWinScreen(level, outcome, this.yapAttemptLog);
    this.yapWinFrame = exec.yapFrame(); // the won frame stays on the board
    this.yapExecution = null; // the playback is over; the Win screen drives now
    this.yapChrome?.destroy();
    this.yapChrome = null;
    this.yapBuildWinChrome(level, layout);
    this.yapDrawState(this.yapWinFrame);
    this.yapRedrawMarks();
  }

  /**
   * Win chrome: a panel over the board with the title, the attempts / ticks /
   * par / stars rows, the emoji-line preview and the Improve and Home
   * actions; the bottom bar holds the dominant Share action.
   */
  private yapBuildWinChrome(level: YapLevel, layout: YapBoardLayout): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    const win = this.yapWin;
    if (win === null) return;
    const textStyle = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'sans-serif',
      fontSize: `${size}px`,
      color,
    });
    // same top bar as the planning screen: one visual language across modes
    this.yapBuildTopBar(chrome, layout, level.name, '');

    // panel over the board area, between the top and bottom bars
    const panelX = 12;
    const panelY = YAP_TOP_BAR_HEIGHT + 8;
    const panelW = layout.viewWidth - 24;
    const panelH = layout.viewHeight - YAP_TOP_BAR_HEIGHT - YAP_BOTTOM_BAR_HEIGHT - 16;
    const panel = this.add.graphics();
    panel
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRoundedRect(panelX, panelY, panelW, panelH, 12)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    chrome.add(panel);

    const cx = layout.viewWidth / 2;
    let y = panelY + 18;
    const title = this.add
      .text(cx, y, yapI18n.t('win.title'), textStyle(24, YAP_PALETTE['text-primary']))
      .setOrigin(0.5, 0);
    chrome.add(title);
    y += title.height + 14;

    // stats rows: label left, value right (14 px minimum body text)
    const rows: readonly (readonly [string, string])[] = [
      [yapI18n.t('win.attempts'), String(win.yapAttempts())],
      [yapI18n.t('win.ticks'), String(win.yapTicks())],
      [yapI18n.t('win.par'), String(win.yapPar())],
      [yapI18n.t('win.stars'), win.yapStarsText()],
    ];
    for (const [label, value] of rows) {
      chrome.add(
        this.add
          .text(panelX + 16, y, label, textStyle(16, YAP_PALETTE['text-secondary']))
          .setOrigin(0, 0),
      );
      chrome.add(
        this.add
          .text(panelX + panelW - 16, y, value, textStyle(16, YAP_PALETTE['text-primary']))
          .setOrigin(1, 0),
      );
      y += 26;
    }
    y += 8;

    // the emoji line that will go into the share, as a preview
    chrome.add(
      this.add
        .text(cx, y, yapI18n.t('winScreen.sharePreview'), textStyle(14, YAP_PALETTE['text-secondary']))
        .setOrigin(0.5, 0),
    );
    y += 20;
    const emoji = this.add
      .text(cx, y, win.yapEmojiLine(), textStyle(20, YAP_PALETTE['text-primary']))
      .setOrigin(0.5, 0);
    chrome.add(emoji);

    // Improve my score + Home, side by side, 44 px tall touch targets
    const btnH = 44;
    const gap = 8;
    const halfW = (panelW - 32 - gap) / 2;
    const btnY = panelY + panelH - 12 - btnH / 2;
    const improveBtn = this.yapMakeButton(
      panelX + 16 + halfW / 2,
      btnY,
      halfW,
      btnH,
      yapI18n.t('win.improve'),
      'action-secondary',
      YAP_PALETTE['text-primary'],
      () => this.yapExitWin(),
    );
    chrome.add(improveBtn.container);
    const homeBtn = this.yapMakeButton(
      panelX + 16 + halfW + gap + halfW / 2,
      btnY,
      halfW,
      btnH,
      this.yapSceneData.winHomeLabel ?? yapI18n.t('win.home'),
      'action-secondary',
      YAP_PALETTE['text-primary'],
      () => this.yapOnWinHome(),
    );
    chrome.add(homeBtn.container);

    // bottom action bar: the dominant Share action
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, layout.viewWidth, YAP_BOTTOM_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, layout.viewWidth, barY + 0.5);
    chrome.add(bar);
    const shareW = Math.min(240, layout.viewWidth - 32);
    const shareBtn = this.yapMakeButton(
      cx,
      barY + YAP_BOTTOM_BAR_HEIGHT - 6 - 22,
      shareW,
      44,
      yapI18n.t('win.share'),
      'action-primary',
      YAP_PALETTE['path-light'],
      () => undefined, // E2: Share fires on pointerup, below
    );
    chrome.add(shareBtn.container);
    // E2: navigator.share and the clipboard need transient user activation,
    // which a touch grants on its release (touchend), not on pointerdown.
    // Phaser dispatches the DOM touchend/mouseup synchronously down to the
    // zone's 'pointerup', so the share runs inside the activation.
    const shareZone = shareBtn.container.list.find(
      (child): child is Phaser.GameObjects.Zone => child instanceof Phaser.GameObjects.Zone,
    );
    shareZone?.on('pointerup', () => this.yapOnWinShare());
    // The 'image' variant needs its map File before the tap: fetch it now.
    if (yapResolveShareVariant() === 'image') {
      void yapPrepareShareImage(yapResolveShareDay(level.type, this.sys.settings.data));
    }

    // the planning/execution chrome refs do not exist in this mode
    this.yapStatsText = null;
    this.yapInstruction = null;
    this.yapPlayButton = null;
    this.yapPlaySize = null;
    this.yapExecTickText = null;
    this.yapSpeedButton = null;
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

  /** E2: a transient "Copied" (or failure) message above the Share button. */
  private yapShowShareToast(report: YapShareReport): void {
    const chrome = this.yapChrome;
    const layout = this.yapLayout;
    if (!this.sys.isActive() || this.yapWin === null || chrome === null || layout === null) return;
    let message: string | null = null;
    if (report.outcome === 'error') message = yapI18n.t('share.failed');
    else if (report.method === 'clipboard') message = yapI18n.t('common.copied');
    if (message === null) return;
    const toast = this.add
      .text(layout.viewWidth / 2, layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT - 12, message, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: YAP_PALETTE['path-light'],
        backgroundColor: YAP_PALETTE['text-primary'],
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5, 1);
    chrome.add(toast);
    this.time.delayedCall(1600, () => toast.destroy());
  }

  /** Home (stub until D2): emits a scene event. */
  private yapOnWinHome(): void {
    this.events.emit(YAP_WIN_HOME_EVENT);
  }
}
