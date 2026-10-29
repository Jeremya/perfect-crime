// YapLevelScene — the Planning screen (stories C1 + C2): polished rendering of
// a level plus the path drawing. Grid baked once into a texture, then per
// tick-0 state: vision cones as the exact cells of visibleCells, dotted
// patrols, lasers, thief, guards, cameras, diamond and exit. On top of that,
// YapPathInput (./path-input.ts) turns pointer events into the player's plan:
// central zone, erase by going back, cut, pauses on tap, 64-step limit and
// auto-finish at the exit, drawn as an outlined route with pause badges.
// Layout adapts to the viewport (readable on a 360 x 640 screen) and rebuilds
// on resize, preserving the drawn path.
//
// Rendering never computes a rule: everything shown comes from the pure sim
// (src/core/sim.ts) via the helpers of ./board.ts; drawing lives in ./render.ts
// and the path overlay below; the input rules live in ./path-input.ts.
import Phaser from 'phaser';
import { parseLevel, type YapLevel } from '../core/level';
import { createInitialState, type YapSimState } from '../core/sim';
import { yapI18n } from '../app/i18n';
import tutorialSource from '../../levels/tutorial/t1.lvl?raw';
import {
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapCellCenter,
  yapComputeLayout,
  yapConeCells,
  yapHexToInt,
  yapLaserCells,
  type YapBoardLayout,
} from './board';
import { YapPathInput } from './path-input';
import {
  yapDrawCamera,
  yapDrawCone,
  yapDrawDiamond,
  yapDrawExit,
  yapDrawGuard,
  yapDrawLaser,
  yapDrawPatrol,
  yapDrawStaticGrid,
  yapDrawStart,
  yapDrawThief,
} from './render';

/** Texture key of the baked static grid. */
const YAP_GRID_TEXTURE_KEY = 'yap-board-grid';
/** Scene event emitted with the plan when PLAY is pressed (execution is C3). */
const YAP_PLAY_EVENT = 'yap-play';

export interface YapLevelSceneData {
  /** .lvl source to render; defaults to the tutorial heist. */
  readonly levelSource?: string;
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
  private yapTicksText: Phaser.GameObjects.Text | null = null;
  private yapPausesText: Phaser.GameObjects.Text | null = null;
  private yapInstruction: Phaser.GameObjects.Text | null = null;
  private yapPlayButton: YapChromeButton | null = null;
  private yapPlayPulse: Phaser.Tweens.Tween | null = null;
  /** Id of the single finger currently drawing (null = none). */
  private yapPointerId: number | null = null;

  constructor() {
    super('yap-level');
  }

  create(data: YapLevelSceneData): void {
    const source = data.levelSource ?? tutorialSource;
    this.yapLevel = parseLevel(source, 'levels/tutorial/t1.lvl');
    this.yapState = createInitialState(this.yapLevel);
    this.cameras.main.setBackgroundColor(YAP_PALETTE['surface-page']);
    this.yapBuild();
    // Path drawing: pointer events, a single finger (Gate 1 spec).
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.yapOnPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.yapOnPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.yapOnPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.yapOnPointerUp, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuild();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.yapOnPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.yapOnPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.yapOnPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.yapOnPointerUp, this);
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
    if (this.yapPointerId !== null) return; // a single finger draws
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
    const input = this.yapPathInput;
    if (input === null) return;
    const before = input.yapPath().length;
    input.yapPointerMove(pointer.x, pointer.y);
    this.yapAfterPathChange(before);
  };

  private readonly yapOnPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.yapPointerId) return;
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
      // each new cell gives a short 8 ms vibration where the browser allows it
      try {
        navigator.vibrate(8);
      } catch {
        // vibration is optional (desktop, private mode)
      }
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

    // Vision cones: exactly the cells of visibleCells, tinted + outlined.
    const cones = yapConeCells(level, state);
    const coneG = this.add.graphics();
    for (const cells of cones.guards) yapDrawCone(coneG, layout, cells, 'danger-guard');
    for (const cells of cones.cameras) yapDrawCone(coneG, layout, cells, 'danger-camera');
    board.add(coneG);

    // Lasers: solid red while on, gray dashed while off.
    const laserG = this.add.graphics();
    for (const laser of yapLaserCells(state)) {
      yapDrawLaser(laserG, layout, laser.cells, laser.active);
    }
    board.add(laserG);

    // Patrols: thin dotted lines with direction arrows, kept secondary.
    const patrolG = this.add.graphics();
    for (const guard of level.guards) yapDrawPatrol(patrolG, layout, guard);
    board.add(patrolG);

    // The player's plan: thick rounded near-white route with a dark outline,
    // plus compact pause badges (docs/UI-DESIGN.md, Planned path).
    this.yapPathLayer = this.add.graphics();
    board.add(this.yapPathLayer);
    this.yapBadgeLayer = this.add.container(0, 0);
    board.add(this.yapBadgeLayer);

    // Entities: exit, diamond, cameras, guards, thief (on top).
    const entG = this.add.graphics();
    yapDrawExit(entG, layout, level.exit);
    yapDrawDiamond(entG, layout, level.loot);
    yapDrawStart(entG, layout, level.start);
    for (const cam of state.cameras) yapDrawCamera(entG, layout, cam.at, cam.facing);
    for (const guard of state.guards) yapDrawGuard(entG, layout, guard.pos, guard.facing);
    yapDrawThief(entG, layout, state.thief);
    board.add(entG);

    this.yapBuildChrome(level, layout);
    this.yapRedrawPath();
    this.yapUpdateChrome();
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

  /** Top bar (level name, plan ticks, par, pauses left) and bottom action bar. */
  private yapBuildChrome(level: YapLevel, layout: YapBoardLayout): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    const textStyle = (size: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'sans-serif',
      fontSize: `${size}px`,
      color: YAP_PALETTE['text-primary'],
    });
    const midY = YAP_TOP_BAR_HEIGHT / 2;

    const name = this.add.text(16, midY, level.name, textStyle(16)).setOrigin(0, 0.5);
    chrome.add(name);

    // right-aligned stats: pauses left, par, plan ticks (14 px minimum)
    const input = this.yapPathInput;
    const pausesText = this.add
      .text(
        layout.viewWidth - 16,
        midY,
        yapI18n.t('planning.pausesLeft', { count: input?.yapPausesLeft() ?? level.maxPauses }),
        textStyle(14),
      )
      .setOrigin(1, 0.5);
    const parText = this.add
      .text(0, midY, yapI18n.t('planning.par', { par: level.par }), textStyle(14))
      .setOrigin(1, 0.5);
    parText.x = pausesText.x - pausesText.width - 12;
    const ticksText = this.add
      .text(
        0,
        midY,
        yapI18n.t('planning.planTicks', { ticks: input?.yapSteps() ?? 0 }),
        textStyle(14),
      )
      .setOrigin(1, 0.5);
    ticksText.x = parText.x - parText.width - 12;
    chrome.add([pausesText, parText, ticksText]);
    this.yapPausesText = pausesText;
    this.yapTicksText = ticksText;

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
      .text(layout.viewWidth / 2, barY + 6, yapI18n.t('planning.grabDiamond'), {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: YAP_PALETTE['text-secondary'],
      })
      .setOrigin(0.5, 0);
    chrome.add(this.yapInstruction);

    // buttons row: 44 px tall touch targets, PLAY the largest primary action
    const btnH = 44;
    const btnY = barY + YAP_BOTTOM_BAR_HEIGHT - 6 - btnH / 2;
    const clearBtn = this.yapMakeButton(
      16 + 48,
      btnY,
      96,
      btnH,
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
    const playBtn = this.yapMakeButton(
      layout.viewWidth - 16 - 75,
      btnY,
      150,
      btnH,
      yapI18n.t('planning.play'),
      'action-secondary',
      YAP_PALETTE['text-secondary'],
      () => {
        const pathInput = this.yapPathInput;
        if (pathInput === null || !pathInput.yapCanPlay()) return;
        this.events.emit(YAP_PLAY_EVENT, pathInput.yapPlan());
      },
    );
    chrome.add(playBtn.container);
    this.yapPlayButton = playBtn;
  }

  /** A rounded button drawn in code: graphics + zone hit area + label. */
  private yapMakeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    labelText: string,
    fillToken: 'action-primary' | 'action-secondary',
    textColor: string,
    onPress: () => void,
  ): YapChromeButton {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(yapHexToInt(YAP_PALETTE[fillToken]), 1)
      .fillRoundedRect(-w / 2, -h / 2, w, h, 8)
      .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: textColor,
      })
      .setOrigin(0.5);
    zone.on('pointerdown', onPress);
    container.add([bg, zone, label]);
    return { container, bg, label };
  }

  /** Refreshes the dynamic chrome: plan ticks, pauses left, PLAY state. */
  private yapUpdateChrome(): void {
    const input = this.yapPathInput;
    if (input === null) return;
    this.yapTicksText?.setText(yapI18n.t('planning.planTicks', { ticks: input.yapSteps() }));
    this.yapPausesText?.setText(yapI18n.t('planning.pausesLeft', { count: input.yapPausesLeft() }));
    const canPlay = input.yapCanPlay();
    this.yapInstruction?.setVisible(!canPlay);
    const play = this.yapPlayButton;
    if (play === null) return;
    if (canPlay) {
      // PLAY pulses once the drawing auto-finished at the exit
      play.bg
        .clear()
        .fillStyle(yapHexToInt(YAP_PALETTE['action-primary']), 1)
        .fillRoundedRect(-75, -22, 150, 44, 8)
        .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
        .strokeRoundedRect(-75, -22, 150, 44, 8);
      play.label.setColor(YAP_PALETTE['path-light']);
      if (this.yapPlayPulse === null) {
        this.yapPlayPulse = this.tweens.add({
          targets: play.container,
          scale: 1.06,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else {
      play.bg
        .clear()
        .fillStyle(yapHexToInt(YAP_PALETTE['action-secondary']), 1)
        .fillRoundedRect(-75, -22, 150, 44, 8)
        .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
        .strokeRoundedRect(-75, -22, 150, 44, 8);
      play.label.setColor(YAP_PALETTE['text-secondary']);
      if (this.yapPlayPulse !== null) {
        this.yapPlayPulse.stop();
        this.yapPlayPulse = null;
        play.container.setScale(1);
      }
    }
  }
}
