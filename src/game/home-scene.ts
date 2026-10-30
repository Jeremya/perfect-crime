// YapHomeScene — the Home screen (story D2), and YapFlowController, which
// executes the routes of the pure app flow (src/app/router.ts).
//
// Home (Gate 1 spec, Screens; docs/UI-DESIGN.md, Home): "Daily heist #3", its
// status (to do, or cleared in N attempts with its stars), the streak 🔥, the
// countdown to the next heist; actions Play, Share (once cleared) and
// Tutorial, all in the bottom third for one-thumb use. Before the test week:
// tutorial and countdown to the first heist; after day 7: an end message and
// the best streak (the Archive is optional story O1). There is no Settings
// screen at this stage, so its button is omitted rather than shown dead.
// Share on Home is a stub until E2: it emits YAP_HOME_SHARE_EVENT with the day.
//
// YapFlowController listens to the level scene's events from the outside —
// 'yap-play' (one attempt), 'yap-execution-end' (the outcome) and
// 'yap-win-home' (leaving the Win screen) — keeps its own YapAttemptLog to
// record wins (tutorial progress, daily results + streak), and moves on: the
// next tutorial level while the tutorial chain runs, Home otherwise. It also
// emits level_start (and streak_day on the first same-day win) through track().
//
// The layout is built from the real viewport (Phaser.Scale.RESIZE) and
// rebuilt on resize; the countdown ticks every second and the whole screen
// is rebuilt when the local day changes at midnight.
import Phaser from 'phaser';
import { track } from '../app/analytics';
import { yapI18n } from '../app/i18n';
import {
  recordYapDailyWin,
  recordYapTutorialCleared,
  yapCountdownParts,
  yapFormatClock,
  yapHomeModel,
  yapLevelById,
  yapRouteAfterWin,
  type YapHomeModel,
  type YapLevelRoute,
  type YapRoute,
} from '../app/router';
import { yapStorage, type YapStorage } from '../app/storage';
import type { YapCause, YapSimOutcome } from '../core/sim';
import { YAP_PALETTE, YAP_TOP_BAR_HEIGHT, yapHexToInt } from './board';
import type { YapLevelSceneData } from './level-scene';
import { YapAttemptLog, YapWinScreen } from './win';

/** Scene key of the Home screen. */
export const YAP_HOME_SCENE_KEY = 'yap-home';
/** Scene key of the level scene (src/game/level-scene.ts). */
const YAP_LEVEL_SCENE_KEY = 'yap-level';
/** Home scene event emitted with { day } when Share is pressed (E2 wires it). */
export const YAP_HOME_SHARE_EVENT = 'yap-home-share';
/** Level scene events the flow listens to (see src/game/level-scene.ts). */
const YAP_PLAY_EVENT = 'yap-play';
const YAP_EXECUTION_END_EVENT = 'yap-execution-end';
const YAP_WIN_HOME_EVENT = 'yap-win-home';
/** Streak icon of the spec's Home line (an icon, like the Win emoji line). */
const YAP_STREAK_ICON = '🔥';

const YAP_HOME_ROUTE: YapRoute = { kind: 'home' };

/** Executes app-flow routes and records wins from the level scene's events. */
export class YapFlowController {
  /** The level being played (null on Home). */
  private yapRoute: YapLevelRoute | null = null;
  /** Mirrors the level scene's attempt bookkeeping for the current level. */
  private yapLog = new YapAttemptLog();
  private yapAttached = false;

  constructor(
    private readonly storage: YapStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Go to `route` from the running scene `from`: Phaser queues the stop of
   * `from` and the start of the target, so this is safe inside input and
   * timer callbacks (and restarts the level scene for the next level).
   */
  yapGo(from: Phaser.Scene, route: YapRoute): void {
    this.yapAttach(from.game);
    const level = route.kind === 'level' ? yapLevelById(route.levelId) : null;
    if (route.kind === 'home' || level === null) {
      this.yapRoute = null;
      from.scene.start(YAP_HOME_SCENE_KEY);
      return;
    }
    this.yapRoute = route;
    this.yapLog = new YapAttemptLog();
    const after = yapRouteAfterWin(route);
    const data: YapLevelSceneData = {
      level,
      levelId: route.levelId,
      mode: route.mode,
      day: route.day,
      // in the tutorial chain the Win screen's Home button leads to the next level
      winHomeLabel:
        after.kind === 'level' ? yapI18n.t('homeFlow.nextLevel') : yapI18n.t('win.home'),
    };
    track('level_start', { level_id: route.levelId, mode: route.mode, day: route.day });
    from.scene.start(YAP_LEVEL_SCENE_KEY, data);
  }

  /** Subscribe once to the level scene (its event emitter outlives restarts). */
  private yapAttach(game: Phaser.Game): void {
    if (this.yapAttached) return;
    const levelScene = game.scene.getScene(YAP_LEVEL_SCENE_KEY);
    if (levelScene === null) return;
    this.yapAttached = true;
    levelScene.events.on(YAP_PLAY_EVENT, this.yapOnPlay);
    levelScene.events.on(YAP_EXECUTION_END_EVENT, this.yapOnExecutionEnd);
    levelScene.events.on(YAP_WIN_HOME_EVENT, () => {
      const route = this.yapRoute;
      this.yapGo(levelScene, route === null ? YAP_HOME_ROUTE : yapRouteAfterWin(route));
    });
  }

  /** Every press of PLAY is an attempt (frozen after the win, like the scene's log). */
  private readonly yapOnPlay = (): void => {
    this.yapLog.yapPressPlay();
  };

  /** Failure: remember the cause. Win: record the tutorial or daily result. */
  private readonly yapOnExecutionEnd = (outcome: YapSimOutcome): void => {
    const route = this.yapRoute;
    if (route === null) return;
    if (outcome.kind === 'detected') {
      this.yapLog.yapRegisterFailure(outcome.cause);
      return;
    }
    if (outcome.kind !== 'won') return;
    const level = yapLevelById(route.levelId);
    if (level === null) return;
    this.yapLog.yapRegisterWin();
    if (route.mode === 'tutorial') {
      recordYapTutorialCleared(this.storage, route.levelId);
      return;
    }
    if (route.mode !== 'daily') return;
    const win = new YapWinScreen(level, outcome, this.yapLog);
    const causes = this.yapLog
      .yapAttemptEntries()
      .filter((entry): entry is YapCause => entry !== 'won');
    const result = recordYapDailyWin(
      this.storage,
      route.day,
      {
        attempts: win.yapAttempts(),
        ticks: win.yapTicks(),
        stars: win.yapStars(),
        hints: 0,
        causes,
      },
      this.now(),
    );
    if (result.firstWin && result.streak !== null) {
      track('streak_day', { streak: result.streak });
    }
  };
}

/** The app's single flow controller. */
export const yapFlow = new YapFlowController(yapStorage);

export class YapHomeScene extends Phaser.Scene {
  private yapRoot: Phaser.GameObjects.Container | null = null;
  private yapModel: YapHomeModel | null = null;
  private yapCountdownText: Phaser.GameObjects.Text | null = null;
  private yapTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(YAP_HOME_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(YAP_PALETTE['surface-page']);
    this.yapBuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.yapTimer = this.time.addEvent({ delay: 1000, loop: true, callback: this.yapOnSecond });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuild();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.yapTimer?.remove(false);
    this.yapTimer = null;
    this.yapRoot = null;
    this.yapCountdownText = null;
  };

  /** Countdown tick; a new local day (midnight) rebuilds the whole screen. */
  private readonly yapOnSecond = (): void => {
    const previous = this.yapModel;
    const next = yapHomeModel(yapStorage, new Date());
    if (previous === null || next.phase !== previous.phase || next.day !== previous.day) {
      this.yapBuild();
      return;
    }
    this.yapModel = next;
    const label = this.yapCountdownLabel(next);
    if (label !== null) this.yapCountdownText?.setText(label);
  };

  /** "Next heist in 05:12:33" (or the first heist, or the last of the week). */
  private yapCountdownLabel(model: YapHomeModel): string | null {
    if (model.phase === 'after') return null;
    if (model.msUntilNextHeist <= 0) return yapI18n.t('homeFlow.lastHeist');
    const parts = yapCountdownParts(model.msUntilNextHeist);
    const clock = yapFormatClock(parts);
    const time =
      parts.days > 0 ? yapI18n.t('homeFlow.countdownWithDays', { days: parts.days, clock }) : clock;
    return model.phase === 'before'
      ? yapI18n.t('homeFlow.firstHeistIn', { time })
      : yapI18n.t('home.nextHeistIn', { time });
  }

  /** (Re)draw the whole screen from the stored progress and the local day. */
  private yapBuild(): void {
    this.yapRoot?.destroy();
    this.yapCountdownText = null;
    const model = yapHomeModel(yapStorage, new Date());
    this.yapModel = model;
    const width = this.scale.width;
    const height = this.scale.height;
    const root = this.add.container(0, 0);
    this.yapRoot = root;

    const textStyle = (
      size: number,
      color: string,
      bold = false,
      wrap = 0,
    ): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'sans-serif',
      fontSize: `${size}px`,
      color,
      ...(bold ? { fontStyle: 'bold' } : {}),
      ...(wrap > 0 ? { wordWrap: { width: wrap } } : {}),
    });

    // top bar: the game name, with the same accent strip as the level HUD
    const header = this.add.graphics();
    header
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, 0, width, YAP_TOP_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, YAP_TOP_BAR_HEIGHT - 0.5, width, YAP_TOP_BAR_HEIGHT - 0.5);
    header
      .fillStyle(yapHexToInt(YAP_PALETTE['action-primary']), 1)
      .fillRect(0, 0, 4, YAP_TOP_BAR_HEIGHT);
    root.add(header);
    root.add(
      this.add
        .text(
          16,
          YAP_TOP_BAR_HEIGHT / 2,
          yapI18n.t('app.title'),
          textStyle(20, YAP_PALETTE['text-primary'], true),
        )
        .setOrigin(0, 0.5),
    );

    // the daily heist card: number, status, stars, streak, countdown
    const cardX = 16;
    const cardY = YAP_TOP_BAR_HEIGHT + 16;
    const cardW = width - 32;
    const innerX = cardX + 16;
    const innerW = cardW - 32;
    const card = this.add.graphics();
    root.add(card);
    let y = cardY + 20;
    const line = (
      text: string,
      size: number,
      color: string,
      bold: boolean,
      gapAfter: number,
    ): Phaser.GameObjects.Text => {
      const t = this.add
        .text(innerX, y, text, textStyle(size, color, bold, innerW))
        .setOrigin(0, 0);
      root.add(t);
      y += t.height + gapAfter;
      return t;
    };
    // dividers are stroked after the card fill, which needs the final height
    const dividerYs: number[] = [];
    const divider = (): void => {
      dividerYs.push(y);
      y += 16;
    };
    const primary = YAP_PALETTE['text-primary'];
    const secondary = YAP_PALETTE['text-secondary'];
    const countdown = this.yapCountdownLabel(model);

    if (model.phase === 'week') {
      line(yapI18n.t('home.dailyHeist', { day: model.day }), 24, primary, true, 8);
      const record = model.record;
      if (record === null) {
        line(yapI18n.t('home.statusToDo'), 16, secondary, false, 0);
      } else {
        line(
          yapI18n.t('home.statusCleared', { attempts: record.winningAttempt }),
          16,
          primary,
          true,
          4,
        );
        // stars as filled/empty glyphs: a shape cue, not color alone (as on Win)
        line('★'.repeat(record.stars) + '☆'.repeat(3 - record.stars), 24, primary, false, 0);
      }
      y += 16;
      divider();
      line(
        `${YAP_STREAK_ICON} ${yapI18n.t('home.streak', { count: model.streak })}`,
        16,
        primary,
        false,
        8,
      );
    } else if (model.phase === 'before') {
      line(yapI18n.t('homeFlow.beforeTitle'), 24, primary, true, 8);
      line(yapI18n.t('homeFlow.beforeHint'), 16, secondary, false, 16);
      divider();
    } else {
      line(yapI18n.t('homeFlow.afterTitle'), 24, primary, true, 8);
      line(yapI18n.t('homeFlow.afterMessage'), 16, secondary, false, 16);
      divider();
      line(
        `${YAP_STREAK_ICON} ${yapI18n.t('homeFlow.bestStreak', { count: model.bestStreak })}`,
        16,
        primary,
        false,
        8,
      );
    }
    if (countdown !== null) this.yapCountdownText = line(countdown, 16, secondary, false, 8);
    y += 12; // bottom padding (20) minus the last line gap (8)
    card
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRoundedRect(cardX, cardY, cardW, y - cardY, 12)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .strokeRoundedRect(cardX, cardY, cardW, y - cardY, 12);
    for (const dy of dividerYs) {
      card.lineBetween(innerX, dy + 0.5, innerX + innerW, dy + 0.5);
    }

    // actions in the bottom third, the primary one lowest (one-thumb reach)
    const btnW = Math.min(width - 32, 420);
    const cx = width / 2;
    const primaryH = 56;
    const secondaryH = 48;
    const primaryY = height - 16 - primaryH / 2;
    const secondaryY = primaryY - primaryH / 2 - 12 - secondaryH / 2;
    const play = model.play;
    if (play !== null) {
      root.add(
        this.yapMakeButton(cx, primaryY, btnW, primaryH, yapI18n.t('home.play'), true, () =>
          yapFlow.yapGo(this, play),
        ),
      );
      const secondaryActions: { label: string; onPress: () => void }[] = [];
      if (model.canShare) {
        secondaryActions.push({
          label: yapI18n.t('home.share'),
          onPress: () => this.events.emit(YAP_HOME_SHARE_EVENT, { day: model.day }),
        });
      }
      secondaryActions.push({
        label: yapI18n.t('home.tutorial'),
        onPress: () => yapFlow.yapGo(this, model.tutorial),
      });
      const gap = 8;
      const eachW = (btnW - gap * (secondaryActions.length - 1)) / secondaryActions.length;
      secondaryActions.forEach((action, i) => {
        const x = cx - btnW / 2 + eachW / 2 + i * (eachW + gap);
        root.add(
          this.yapMakeButton(x, secondaryY, eachW, secondaryH, action.label, false, action.onPress),
        );
      });
    } else {
      // before / after the week there is no heist to play: the tutorial leads
      root.add(
        this.yapMakeButton(cx, primaryY, btnW, primaryH, yapI18n.t('home.tutorial'), true, () =>
          yapFlow.yapGo(this, model.tutorial),
        ),
      );
    }
  }

  /** A rounded button drawn in code (same style as the level scene's buttons). */
  private yapMakeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    labelText: string,
    primary: boolean,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(yapHexToInt(YAP_PALETTE[primary ? 'action-primary' : 'action-secondary']), 1)
      .fillRoundedRect(-w / 2, -h / 2, w, h, 8)
      .lineStyle(2, yapHexToInt(YAP_PALETTE['path-outline']), 1)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: primary ? '20px' : '16px',
        color: primary ? YAP_PALETTE['path-light'] : YAP_PALETTE['text-primary'],
        ...(primary ? { fontStyle: 'bold' } : {}),
      })
      .setOrigin(0.5);
    zone.on('pointerdown', onPress);
    container.add([bg, zone, label]);
    return container;
  }
}
