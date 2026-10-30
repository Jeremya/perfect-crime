// YapViewerScene — the dev viewer of story F1, served at /dev/viewer.
//
// It opens any .lvl file (the levels bundled in the build, a ?lvl=<path>
// query parameter, or a file picked from disk), solves it with the B3 solver
// (src/core/solver.ts), replays the canonical optimal plan tick by tick and
// shows the metrics: par, ticks, tension, minimum pauses, optimal plans.
//
// The board always shows the exact state of one chosen tick: the cones are
// the seen cells of that frame, the lasers their state at that tick, the
// thief its cell at that tick. There is a single full-opacity state on
// screen, so a scrubbed tick and the replayed tick can never be confused.
//
// Rendering never computes a rule: every position, facing, seen cell and
// laser state comes from the pure sim frames (src/core/sim.ts); drawing
// reuses ./board.ts and ./render.ts of the C1 level scene.
import Phaser from 'phaser';
import { parseLevel, YAP_GRID_HEIGHT, YAP_GRID_WIDTH, YAP_MAX_TICKS, type YapLevel } from '../core/level';
import { createInitialState, run, type YapSimState } from '../core/sim';
import { solveLevel, YapSolverError, type YapSolveResult } from '../core/solver';
import { yapI18n } from '../app/i18n';
import {
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapCellCenter,
  yapComputeLayout,
  yapConeCells,
  yapHexToInt,
  yapLaserCells,
  type YapBoardLayout,
} from './board';
import { yapBakeTexture, yapBakedImage, yapFitCamera, yapViewSize } from './hidpi';
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

/** Scene key (docs/NAMING.md: yap-<name>). */
export const YAP_VIEWER_SCENE_KEY = 'yap-viewer';
/** Texture key of the baked static grid. */
const YAP_VIEWER_GRID_TEXTURE = 'yap-viewer-grid';
/** Height of the bottom control panel, in CSS px (a DOM overlay sits on it). */
const YAP_VIEWER_BOTTOM_BAR = 132;
/** Replay period, in ms. */
const YAP_VIEWER_TICK_MS = 400;

/** Every .lvl shipped in the bundle, keyed by path relative to the repo root. */
const yapGlob = import.meta.glob('../../levels/**/*.lvl', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const yapBundledLevels: Record<string, string> = {};
for (const [key, value] of Object.entries(yapGlob)) {
  yapBundledLevels[key.replace(/^(\.\.\/)+/, '')] = typeof value === 'string' ? value : String(value);
}

/** A loaded level plus its solver result and the frames of the optimal plan. */
interface YapViewerModel {
  /** File path (bundled) or file name (picked from disk). */
  readonly name: string;
  readonly level: YapLevel;
  /** Null when the solver could not clear the level within YAP_MAX_TICKS. */
  readonly result: YapSolveResult | null;
  /** One frame per tick of the optimal plan, tick 0 included. */
  readonly frames: readonly YapSimState[];
  /** Localized message when the level is valid but unsolvable. */
  readonly error: string | null;
}

export class YapViewerScene extends Phaser.Scene {
  private yapModel: YapViewerModel | null = null;
  private yapErrorText: string | null = null;
  private yapTick = 0;
  private yapPlaying = false;
  private yapTimer: Phaser.Time.TimerEvent | null = null;
  private yapLayout: YapBoardLayout | null = null;
  private yapBoard: Phaser.GameObjects.Container | null = null;
  private yapDynamic: Phaser.GameObjects.Container | null = null;
  private yapChrome: Phaser.GameObjects.Container | null = null;
  private yapNameText: Phaser.GameObjects.Text | null = null;
  private yapTickText: Phaser.GameObjects.Text | null = null;
  private yapPanel: HTMLDivElement | null = null;
  private yapLevelSelect: HTMLSelectElement | null = null;
  private yapFileText: HTMLSpanElement | null = null;
  private yapPlayButton: HTMLButtonElement | null = null;
  private yapPrevButton: HTMLButtonElement | null = null;
  private yapNextButton: HTMLButtonElement | null = null;
  private yapSlider: HTMLInputElement | null = null;
  private yapMetrics: HTMLDivElement | null = null;
  private readonly yapOffLocale = yapI18n.onChange(() => this.yapRefreshTexts());

  constructor() {
    super(YAP_VIEWER_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(YAP_PALETTE['surface-page']);
    this.yapBuildPanel();
    this.yapLoadInitial();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuildAll();
    this.yapPositionPanel();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.yapStopReplay();
    this.yapOffLocale();
    this.yapPanel?.remove();
    this.yapPanel = null;
  };

  // -------------------------------------------------------------------------
  // Level loading — bundled files, ?lvl=<path>, or a file from disk
  // -------------------------------------------------------------------------

  /** Picks the initial level: ?lvl=<path> when it matches a bundled file, else the first one. */
  private yapLoadInitial(): void {
    const entries = Object.entries(yapBundledLevels).sort(([a], [b]) => a.localeCompare(b));
    const wanted = new URLSearchParams(window.location.search).get('lvl');
    let chosen: readonly [string, string] | undefined;
    if (wanted !== null) {
      const w = wanted.replace(/^\/+/, '');
      chosen = entries.find(
        ([key]) => key === w || key.endsWith(`/${w}`) || key.split('/').pop() === w,
      );
    }
    const first = entries[0];
    const picked = chosen ?? (first !== undefined ? [first[0], first[1]] : undefined);
    if (picked === undefined) {
      this.yapModel = null;
      this.yapErrorText = yapI18n.t('viewer.error', { message: yapI18n.t('viewer.noBundled') });
      this.yapBuildAll();
      return;
    }
    this.yapLoadLevel(picked[1], picked[0]);
  }

  /** Parses, solves and runs a .lvl source; any failure is shown, never thrown. */
  private yapLoadLevel(source: string, name: string): void {
    this.yapStopReplay();
    let level: YapLevel;
    try {
      level = parseLevel(source, name);
    } catch (e) {
      this.yapModel = null;
      this.yapErrorText = yapI18n.t('viewer.error', {
        message: e instanceof Error ? e.message : String(e),
      });
      this.yapTick = 0;
      this.yapBuildAll();
      return;
    }
    let result: YapSolveResult | null = null;
    let frames: readonly YapSimState[] = [createInitialState(level)];
    let error: string | null = null;
    try {
      result = solveLevel(level);
      frames = run(level, result.plan).frames;
    } catch (e) {
      if (e instanceof YapSolverError) {
        error = yapI18n.t('viewer.unsolved', { max: YAP_MAX_TICKS });
      } else {
        throw e;
      }
    }
    this.yapModel = { name, level, result, frames, error };
    this.yapErrorText = null;
    this.yapTick = 0;
    if (this.yapLevelSelect !== null && yapBundledLevels[name] !== undefined) {
      this.yapLevelSelect.value = name;
    }
    this.yapBuildAll();
  }

  // -------------------------------------------------------------------------
  // Phaser rendering — static grid baked once, dynamic layer per tick
  // -------------------------------------------------------------------------

  /** (Re)builds the whole screen: board, chrome, current tick, DOM panel data. */
  private yapBuildAll(): void {
    yapFitCamera(this); // CSS px on a device-pixel canvas (C1)
    this.yapBoard?.destroy();
    this.yapChrome?.destroy();
    this.yapBoard = null;
    this.yapChrome = null;
    this.yapDynamic = null;
    this.yapNameText = null;
    this.yapTickText = null;

    const model = this.yapModel;
    const level = model?.level;
    const view = yapViewSize(this);
    const layout = yapComputeLayout(
      view.width,
      view.height,
      level?.width ?? YAP_GRID_WIDTH,
      level?.height ?? YAP_GRID_HEIGHT,
      YAP_TOP_BAR_HEIGHT,
      YAP_VIEWER_BOTTOM_BAR,
    );
    this.yapLayout = layout;

    if (level !== undefined) {
      const board = this.add.container(0, 0);
      this.yapBoard = board;
      // Static grid, baked once into a texture at device resolution (same
      // technique as C1).
      const bakeLayout: YapBoardLayout = { ...layout, originX: 0, originY: 0 };
      yapBakeTexture(this, YAP_VIEWER_GRID_TEXTURE, layout.boardWidth, layout.boardHeight, (g) =>
        yapDrawStaticGrid(g, level, bakeLayout),
      );
      board.add(yapBakedImage(this, layout.originX, layout.originY, YAP_VIEWER_GRID_TEXTURE));
      this.yapDynamic = this.add.container(0, 0);
      board.add(this.yapDynamic);
    }

    this.yapBuildChrome();
    this.yapDrawState();
    this.yapRefreshDom();
    this.yapPositionPanel();
  }

  /** Top bar (level name, chosen tick) and the bottom strip under the DOM panel. */
  private yapBuildChrome(): void {
    const chrome = this.add.container(0, 0);
    this.yapChrome = chrome;
    const textStyle = (size: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'sans-serif',
      fontSize: `${size}px`,
      color: YAP_PALETTE['text-primary'],
    });
    this.yapNameText = this.add
      .text(16, YAP_TOP_BAR_HEIGHT / 2, this.yapModel?.level.name ?? yapI18n.t('viewer.title'), textStyle(20))
      .setOrigin(0, 0.5);
    const view = yapViewSize(this);
    this.yapTickText = this.add
      .text(view.width - 16, YAP_TOP_BAR_HEIGHT / 2, '', textStyle(16))
      .setOrigin(1, 0.5);
    chrome.add([this.yapNameText, this.yapTickText]);

    const barY = view.height - YAP_VIEWER_BOTTOM_BAR;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, view.width, YAP_VIEWER_BOTTOM_BAR)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, view.width, barY + 0.5);
    chrome.add(bar);
  }

  /** Redraws the dynamic layer: plan path, cones, lasers, patrols, entities at the chosen tick. */
  private yapDrawState(): void {
    const model = this.yapModel;
    const dyn = this.yapDynamic;
    const layout = this.yapLayout;
    if (model === null || dyn === null || layout === null) return;
    dyn.removeAll(true);

    const frames = model.frames;
    const frame = frames[this.yapTick] ?? frames[frames.length - 1];
    if (frame === undefined) return;

    const g = this.add.graphics();
    // The optimal plan: thick near-white route with a dark outline.
    if (model.result !== null) {
      const pts = frames.map((f) => yapCellCenter(layout, f.thief));
      const widths: readonly [number, number][] = [
        [layout.cell * 0.3, yapHexToInt(YAP_PALETTE['path-outline'])],
        [layout.cell * 0.16, yapHexToInt(YAP_PALETTE['path-light'])],
      ];
      for (const [width, color] of widths) {
        g.lineStyle(width, color, 1);
        g.beginPath();
        pts.forEach((p, i) => {
          if (i === 0) g.moveTo(p.x, p.y);
          else g.lineTo(p.x, p.y);
        });
        g.strokePath();
      }
    }
    // Cones at the chosen tick: exactly the seen cells of that frame.
    const cones = yapConeCells(model.level, frame);
    for (const cells of cones.guards) yapDrawCone(g, layout, cells, 'danger-guard');
    for (const cells of cones.cameras) yapDrawCone(g, layout, cells, 'danger-camera');
    // Lasers at the chosen tick.
    for (const laser of yapLaserCells(frame)) {
      yapDrawLaser(g, layout, laser.cells, laser.active);
    }
    // Patrols: thin dotted lines, kept secondary.
    for (const guard of model.level.guards) yapDrawPatrol(g, layout, guard);
    dyn.add(g);

    // Entities at the chosen tick, thief on top.
    const ent = this.add.graphics();
    yapDrawExit(ent, layout, model.level.exit);
    yapDrawDiamond(ent, layout, model.level.loot);
    yapDrawStart(ent, layout, model.level.start);
    for (const cam of frame.cameras) yapDrawCamera(ent, layout, cam.at, cam.facing);
    for (const guard of frame.guards) yapDrawGuard(ent, layout, guard.pos, guard.facing);
    yapDrawThief(ent, layout, frame.thief);
    dyn.add(ent);

    // Pause badges of the plan (compact numbered discs, offset from the thief).
    if (model.result !== null) {
      let pauses = 0;
      model.result.plan.forEach((step, i) => {
        if (step !== 'wait') return;
        pauses += 1;
        const cell = frames[i]?.thief ?? frame.thief;
        const p = yapCellCenter(layout, cell);
        const bx = p.x + layout.cell * 0.3;
        const by = p.y - layout.cell * 0.3;
        const r = Math.max(6, layout.cell * 0.2);
        const badge = this.add.graphics();
        badge
          .fillStyle(yapHexToInt(YAP_PALETTE['path-outline']), 1)
          .fillCircle(bx, by, r)
          .lineStyle(2, yapHexToInt(YAP_PALETTE['path-light']), 1)
          .strokeCircle(bx, by, r);
        dyn.add(badge);
        dyn.add(
          this.add
            .text(bx, by, String(pauses), {
              fontFamily: 'sans-serif',
              fontSize: `${Math.max(10, Math.floor(layout.cell * 0.28))}px`,
              color: YAP_PALETTE['path-light'],
            })
            .setOrigin(0.5),
        );
      });
    }

    this.yapRefreshTickText();
  }

  /** Top-bar tick label, e.g. "Tick 3/18". */
  private yapRefreshTickText(): void {
    if (this.yapTickText === null) return;
    const max = this.yapModel === null ? 0 : this.yapModel.frames.length - 1;
    this.yapTickText.setText(yapI18n.t('viewer.tick', { tick: this.yapTick, max }));
  }

  // -------------------------------------------------------------------------
  // Tick selection and replay
  // -------------------------------------------------------------------------

  /** Clamps and shows a tick; the single state on screen is always this tick. */
  private yapSetTick(n: number): void {
    const max = this.yapModel === null ? 0 : this.yapModel.frames.length - 1;
    this.yapTick = Math.max(0, Math.min(max, n));
    if (this.yapSlider !== null) this.yapSlider.value = String(this.yapTick);
    this.yapDrawState();
  }

  private yapToggleReplay(): void {
    if (this.yapPlaying) this.yapStopReplay();
    else this.yapStartReplay();
  }

  /** Replays the optimal plan from the current tick, one frame per period. */
  private yapStartReplay(): void {
    const max = this.yapModel === null ? 0 : this.yapModel.frames.length - 1;
    if (this.yapTick >= max) this.yapSetTick(0);
    this.yapPlaying = true;
    this.yapTimer = this.time.addEvent({
      delay: YAP_VIEWER_TICK_MS,
      loop: true,
      callback: () => {
        const m = this.yapModel === null ? 0 : this.yapModel.frames.length - 1;
        if (this.yapTick >= m) {
          this.yapStopReplay();
          return;
        }
        this.yapSetTick(this.yapTick + 1);
      },
    });
    this.yapRefreshTexts();
  }

  private yapStopReplay(): void {
    this.yapPlaying = false;
    if (this.yapTimer !== null) {
      this.yapTimer.remove();
      this.yapTimer = null;
    }
    this.yapRefreshTexts();
  }

  // -------------------------------------------------------------------------
  // DOM control panel (level picker, file picker, transport, tick slider, metrics)
  // -------------------------------------------------------------------------

  private yapBuildPanel(): void {
    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'row';
    panel.style.alignItems = 'center';
    panel.style.flexWrap = 'wrap';
    panel.style.gap = '8px';
    panel.style.padding = '8px';
    panel.style.boxSizing = 'border-box';
    document.body.appendChild(panel);
    this.yapPanel = panel;

    // Bundled level picker.
    const select = document.createElement('select');
    select.style.minHeight = '44px';
    select.style.maxWidth = '40%';
    select.style.fontSize = '14px';
    select.style.fontFamily = 'sans-serif';
    select.style.color = YAP_PALETTE['text-primary'];
    for (const path of Object.keys(yapBundledLevels).sort()) {
      const opt = document.createElement('option');
      opt.value = path;
      opt.textContent = path;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const src = yapBundledLevels[select.value];
      if (src !== undefined) this.yapLoadLevel(src, select.value);
    });
    panel.appendChild(select);
    this.yapLevelSelect = select;

    // Any .lvl file from disk.
    const fileLabel = document.createElement('label');
    fileLabel.style.display = 'inline-flex';
    fileLabel.style.alignItems = 'center';
    fileLabel.style.minHeight = '44px';
    fileLabel.style.padding = '0 12px';
    fileLabel.style.fontSize = '14px';
    fileLabel.style.fontFamily = 'sans-serif';
    fileLabel.style.borderRadius = '8px';
    fileLabel.style.borderWidth = '1px';
    fileLabel.style.borderStyle = 'solid';
    fileLabel.style.borderColor = YAP_PALETTE['grid-line'];
    fileLabel.style.background = YAP_PALETTE['action-secondary'];
    fileLabel.style.color = YAP_PALETTE['text-primary'];
    fileLabel.style.cursor = 'pointer';
    const fileText = document.createElement('span');
    fileLabel.appendChild(fileText);
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.lvl';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f === undefined) return;
      void f.text().then((text) => this.yapLoadLevel(text, f.name));
      file.value = '';
    });
    fileLabel.appendChild(file);
    panel.appendChild(fileLabel);
    this.yapFileText = fileText;

    // Transport: previous tick, play/pause, next tick.
    const mkButton = (): HTMLButtonElement => {
      const b = document.createElement('button');
      b.style.minWidth = '44px';
      b.style.minHeight = '44px';
      b.style.fontSize = '14px';
      b.style.fontFamily = 'sans-serif';
      b.style.borderRadius = '8px';
      b.style.borderWidth = '1px';
      b.style.borderStyle = 'solid';
      b.style.borderColor = YAP_PALETTE['grid-line'];
      b.style.background = YAP_PALETTE['action-secondary'];
      b.style.color = YAP_PALETTE['text-primary'];
      b.style.cursor = 'pointer';
      return b;
    };
    const prev = mkButton();
    prev.addEventListener('click', () => {
      this.yapStopReplay();
      this.yapSetTick(this.yapTick - 1);
    });
    const play = mkButton();
    play.style.minWidth = '64px';
    play.style.background = YAP_PALETTE['action-primary'];
    play.style.color = YAP_PALETTE['path-light'];
    play.addEventListener('click', () => this.yapToggleReplay());
    const next = mkButton();
    next.addEventListener('click', () => {
      this.yapStopReplay();
      this.yapSetTick(this.yapTick + 1);
    });
    panel.append(prev, play, next);
    this.yapPrevButton = prev;
    this.yapPlayButton = play;
    this.yapNextButton = next;

    // Chosen-tick slider.
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '0';
    slider.step = '1';
    slider.value = '0';
    slider.style.flexGrow = '1';
    slider.style.flexBasis = '120px';
    slider.style.minWidth = '120px';
    slider.style.height = '44px';
    slider.style.accentColor = YAP_PALETTE['action-primary'];
    slider.addEventListener('input', () => {
      this.yapStopReplay();
      this.yapSetTick(Number(slider.value));
    });
    panel.appendChild(slider);
    this.yapSlider = slider;

    // Metrics line.
    const metrics = document.createElement('div');
    metrics.style.width = '100%';
    metrics.style.fontSize = '14px';
    metrics.style.fontFamily = 'sans-serif';
    metrics.style.color = YAP_PALETTE['text-secondary'];
    panel.appendChild(metrics);
    this.yapMetrics = metrics;

    this.yapRefreshTexts();
  }

  /** Places the DOM panel exactly over the bottom bar of the Phaser canvas. */
  private yapPositionPanel(): void {
    const panel = this.yapPanel;
    if (panel === null) return;
    const canvas = this.game.canvas;
    const ratioY = canvas.clientHeight / yapViewSize(this).height;
    const height = Math.round(YAP_VIEWER_BOTTOM_BAR * ratioY);
    panel.style.left = `${canvas.offsetLeft}px`;
    panel.style.top = `${canvas.offsetTop + canvas.clientHeight - height}px`;
    panel.style.width = `${canvas.clientWidth}px`;
    panel.style.height = `${height}px`;
  }

  /** Slider range/value, metrics and select value for the current model. */
  private yapRefreshDom(): void {
    const max = this.yapModel === null ? 0 : this.yapModel.frames.length - 1;
    if (this.yapSlider !== null) {
      this.yapSlider.max = String(max);
      this.yapSlider.value = String(this.yapTick);
    }
    this.yapRefreshMetrics();
    this.yapRefreshTexts();
  }

  /** All displayed labels, rebuilt on locale change too. */
  private yapRefreshTexts(): void {
    if (this.yapFileText !== null) this.yapFileText.textContent = yapI18n.t('viewer.openFile');
    if (this.yapPrevButton !== null) this.yapPrevButton.textContent = yapI18n.t('viewer.prevTick');
    if (this.yapNextButton !== null) this.yapNextButton.textContent = yapI18n.t('viewer.nextTick');
    if (this.yapPlayButton !== null) {
      this.yapPlayButton.textContent = this.yapPlaying
        ? yapI18n.t('viewer.pause')
        : yapI18n.t('common.play');
    }
    if (this.yapNameText !== null) {
      this.yapNameText.setText(this.yapModel?.level.name ?? yapI18n.t('viewer.title'));
    }
    this.yapRefreshTickText();
    this.yapRefreshMetrics();
  }

  /** Metrics line: par, ticks, tension, min pauses, optimal plans — or the error. */
  private yapRefreshMetrics(): void {
    if (this.yapMetrics === null) return;
    const model = this.yapModel;
    if (model === null) {
      this.yapMetrics.textContent = this.yapErrorText ?? '';
      return;
    }
    if (model.error !== null || model.result === null) {
      this.yapMetrics.textContent = model.error ?? '';
      return;
    }
    const r = model.result;
    this.yapMetrics.textContent = [
      yapI18n.t('planning.par', { par: r.par }),
      yapI18n.t('viewer.ticks', { count: r.plan.length }),
      yapI18n.t('viewer.tension', { count: r.tension }),
      yapI18n.t('viewer.minPauses', { count: r.minPauses }),
      yapI18n.t('viewer.plans', { count: r.optimalPlans }),
    ].join(' · ');
  }
}
