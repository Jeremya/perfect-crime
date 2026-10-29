// YapLevelScene — the Planning screen's board (story C1): first polished
// rendering of a level. Grid baked once into a texture, then per tick-0 state:
// vision cones as the exact cells of visibleCells, dotted patrols, lasers,
// thief, guards, cameras, diamond and exit. Layout adapts to the viewport
// (readable on a 360 x 640 screen) and rebuilds on resize.
//
// Rendering never computes a rule: everything shown comes from the pure sim
// (src/core/sim.ts) via the helpers of ./board.ts; drawing lives in ./render.ts.
import Phaser from 'phaser';
import { parseLevel, type YapLevel } from '../core/level';
import { createInitialState, type YapSimState } from '../core/sim';
import { yapI18n } from '../app/i18n';
import tutorialSource from '../../levels/tutorial/t1.lvl?raw';
import {
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapComputeLayout,
  yapConeCells,
  yapHexToInt,
  yapLaserCells,
  type YapBoardLayout,
} from './board';
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

export interface YapLevelSceneData {
  /** .lvl source to render; defaults to the tutorial heist. */
  readonly levelSource?: string;
}

export class YapLevelScene extends Phaser.Scene {
  private yapLevel: YapLevel | null = null;
  private yapState: YapSimState | null = null;
  private yapBoard: Phaser.GameObjects.Container | null = null;
  private yapChrome: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('yap-level');
  }

  create(data: YapLevelSceneData): void {
    const source = data.levelSource ?? tutorialSource;
    this.yapLevel = parseLevel(source, 'levels/tutorial/t1.lvl');
    this.yapState = createInitialState(this.yapLevel);
    this.cameras.main.setBackgroundColor(YAP_PALETTE['surface-page']);
    this.yapBuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuild();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
  };

  /** (Re)draw the whole screen from the current level and tick-0 state. */
  private yapBuild(): void {
    const level = this.yapLevel;
    const state = this.yapState;
    if (level === null || state === null) return;
    this.yapBoard?.destroy();
    this.yapChrome?.destroy();
    this.yapBoard = null;
    this.yapChrome = null;

    const layout = yapComputeLayout(
      this.scale.width,
      this.scale.height,
      level.width,
      level.height,
      YAP_TOP_BAR_HEIGHT,
      YAP_BOTTOM_BAR_HEIGHT,
    );

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
    board.add(
      this.add.image(layout.originX, layout.originY, YAP_GRID_TEXTURE_KEY).setOrigin(0, 0),
    );

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
  }

  /** Top bar (level name, par) and the reserved bottom action bar. */
  private yapBuildChrome(level: YapLevel, layout: YapBoardLayout): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    const textStyle = (size: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'sans-serif',
      fontSize: `${size}px`,
      color: YAP_PALETTE['text-primary'],
    });

    const name = this.add
      .text(16, YAP_TOP_BAR_HEIGHT / 2, level.name, textStyle(20))
      .setOrigin(0, 0.5);
    const par = this.add
      .text(layout.viewWidth - 16, YAP_TOP_BAR_HEIGHT / 2, yapI18n.t('planning.par', { par: level.par }), textStyle(16))
      .setOrigin(1, 0.5);
    chrome.add([name, par]);

    // bottom action bar: reserved 96 px strip (buttons arrive with path drawing)
    const barY = layout.viewHeight - YAP_BOTTOM_BAR_HEIGHT;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, layout.viewWidth, YAP_BOTTOM_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, layout.viewWidth, barY + 0.5);
    chrome.add(bar);
  }
}
