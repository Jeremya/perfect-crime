// YapHomeScene — the Home screen (story D2), and YapFlowController, which
// executes the routes of the pure app flow (src/app/router.ts).
//
// Home (Gate 1 spec, Screens; docs/UI-DESIGN.md, Home): "Daily heist #3", its
// status (to do, or cleared in N attempts with its stars), the streak 🔥, the
// countdown to the next heist; actions Play, Share (once cleared), Archive
// (optional story O1) and Tutorial, all in the bottom third for one-thumb use.
// Before the test week: tutorial and countdown to the first heist; after day
// 7: an end message and the best streak. The Archive (O1) lists the past days
// of the test week; replaying one opens the level in mode 'archive', which the
// flow controller never records — the streak is untouched. There is no
// Settings screen at this stage, so its button is omitted rather than shown
// dead. Share on Home is a stub until E2: it emits YAP_HOME_SHARE_EVENT with
// the day.
//
// YapFlowController listens to the level scene's events from the outside —
// 'yap-play' (one attempt), 'yap-execution-end' (the outcome) and
// 'yap-win-home' (leaving the Win screen) — keeps its own YapAttemptLog to
// record wins (tutorial progress, daily results + streak; archive replays of
// past days, story O1, are not recorded, so they never touch the streak), and
// moves on: the next tutorial level while the tutorial chain runs, Home
// otherwise. It also emits level_start (and streak_day on the first same-day
// win) through track().
//
// The layout is built from the real viewport, in CSS px (yapViewSize,
// ./hidpi.ts), and rebuilt on resize; the countdown ticks every second and the
// whole screen is rebuilt when the local day changes at midnight.
import Phaser from 'phaser';
import { track } from '../app/analytics';
import {
  YAP_MAX_WEEK_STARS,
  YAP_WEEK_DAYS,
  yapArchiveDays,
  yapStarThresholdText,
  yapTotalStars,
} from '../app/daily';
import { yapI18n, type YapKey } from '../app/i18n';
import {
  loadYapDays,
  recordYapDailyWin,
  recordYapTutorialCleared,
  yapCountdownParts,
  yapDaysWonOnTime,
  yapFormatClock,
  yapHomeModel,
  yapLevelById,
  yapRouteAfterWin,
  type YapHomeModel,
  type YapLevelRoute,
  type YapRoute,
} from '../app/router';
import { yapStorage, type YapStorage } from '../app/storage';
import type { YapCause, YapPlan, YapSimOutcome } from '../core/sim';
import { YAP_PALETTE, YAP_TOP_BAR_HEIGHT, yapFitRows, yapLevelLayout } from './board';
import { yapHeistFacts, yapWeekday } from './compose';
import {
  YAP_FOLDER_INSET,
  YAP_FOLDER_TAB_BAND,
  yapDayBoxRow,
  yapFolder,
  yapStamp,
} from './kit-screens';
import { yapFitCamera, yapOnViewResize, yapViewSize } from './hidpi';
import { yapHomeActions } from './home-layout';
import { yapButton, yapCard, yapHeader, yapPaperPage, yapRule, yapShowToast } from './kit';
import { yapFadeIn } from './motion';
import type { YapLevelSceneData } from './level-scene';
import { yapDrawMiniMap } from './render';
import { yapRoleCase, yapRoleText, type YapTextRole } from './text';
import { YapAttemptLog, YapWinScreen, yapEmojiLineFor } from './win';
import {
  yapBuildShareContent,
  yapLoadShareId,
  yapPrepareShareImage,
  yapPreparedShareImage,
  yapResolveShareVariant,
  yapShare,
  type YapShareReport,
} from '../app/share';
import { YAP_MAX_CAUSES, type YapPayloadData } from '../app/payload';

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

/** An action of Home's secondary row. */
interface YapHomeAction {
  readonly label: string;
  readonly onPress: () => void;
  /** As in YapButtonOptions: Share fires on the release. */
  readonly fireOn?: 'down' | 'up';
}

const YAP_HOME_ROUTE: YapRoute = { kind: 'home' };

/**
 * Route to replay a past day from the archive (story O1): the same daily
 * level, in mode 'archive'. The flow controller only records wins of mode
 * 'daily', so an archive replay never touches the streak or the day record.
 */
function yapArchiveRoute(day: number): YapLevelRoute {
  return { kind: 'level', levelId: `daily/d${day}`, mode: 'archive', day };
}

/** Executes app-flow routes and records wins from the level scene's events. */
export class YapFlowController {
  /** The level being played (null on Home). */
  private yapRoute: YapLevelRoute | null = null;
  /** Mirrors the level scene's attempt bookkeeping for the current level. */
  private yapLog = new YapAttemptLog();
  /** Plan of the last PLAY press of the current level (E2 Home share). */
  private yapLastPlan: YapPlan | null = null;
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
    this.yapLastPlan = null;
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

  /**
   * Every press of PLAY is an attempt (frozen after the win, like the scene's
   * log). The plan is kept: the day record stores it so Home can share a
   * challenge link (E2).
   */
  private readonly yapOnPlay = (plan?: YapPlan): void => {
    this.yapLog.yapPressPlay();
    if (plan !== undefined) this.yapLastPlan = plan;
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
        par: level.par,
        plan: this.yapLastPlan ?? [],
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
  /** Top edge of the actions (yapHomeActions): the share note sits above it. */
  private yapActionsTop = 0;
  private yapTimer: Phaser.Time.TimerEvent | null = null;
  /** The archive panel is open instead of the daily heist card (story O1). */
  private yapArchiveOpen = false;

  constructor() {
    super(YAP_HOME_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(YAP_PALETTE['paper-page']);
    this.yapBuild();
    this.yapOnResize = yapOnViewResize(this, () => this.yapBuild());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.yapTimer = this.time.addEvent({ delay: 1000, loop: true, callback: this.yapOnSecond });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown);
  }

  /** RESIZE handler made by create(): rebuilds on a new view size only (C1). */
  private yapOnResize: () => void = () => undefined;

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.yapTimer?.remove(false);
    this.yapTimer = null;
    this.yapRoot = null;
    this.yapCountdownText = null;
    this.yapArchiveOpen = false;
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
    if (label !== null) this.yapCountdownText?.setText(yapRoleCase('stat', label));
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
      : yapI18n.t('home.nextFile', { time });
  }

  /** (Re)draw the whole screen from the stored progress and the local day. */
  private yapBuild(): void {
    yapFitCamera(this); // CSS px on a device-pixel canvas (C1)
    this.yapRoot?.destroy();
    this.yapCountdownText = null;
    const now = new Date();
    const model = yapHomeModel(yapStorage, now);
    this.yapModel = model;
    // story O1: the past days of the test week, playable from the archive
    const archiveDays = yapArchiveDays(now);
    const archiveOpen = this.yapArchiveOpen && archiveDays.length > 0;
    const { width, height } = yapViewSize(this);
    const root = this.add.container(0, 0);
    this.yapRoot = root;

    // C1 plan style: the paper page with its grid, at the back
    root.add(yapPaperPage(this, width, height));

    // The header (spec §8): the tagline over the game name, and the week's
    // star total on the right (story X2: "★ x/21", the best stars of the 7
    // daily records; tutorials never count)
    const totalStars = yapTotalStars(loadYapDays(yapStorage));
    const header = yapHeader(this, width, {
      kicker: yapI18n.t('home.tagline'),
      title: yapI18n.t('app.title'),
      right: [`★ ${totalStars}/${YAP_MAX_WEEK_STARS}`],
    });
    root.add(header.container);

    // The actions live in the bottom third (one-thumb use), from
    // yapHomeActions; their top edge bounds the archive list (O1).
    const play = model.play;
    const archiveToggle = (): void => {
      this.yapArchiveOpen = !archiveOpen;
      this.yapBuild();
    };
    const archiveLabel = archiveOpen ? yapI18n.t('common.close') : yapI18n.t('home.archive');
    const secondaryActions: YapHomeAction[] = [];
    if (play !== null) {
      if (model.canShare) {
        // Share fires on the release: a browser grants the share sheet the
        // user activation of the release of a touch (as on the Win screen)
        secondaryActions.push({
          label: yapI18n.t('home.share'),
          onPress: () => this.yapShareDay(model.day),
          fireOn: 'up',
        });
      }
      if (archiveDays.length > 0) {
        secondaryActions.push({ label: archiveLabel, onPress: archiveToggle });
      }
      secondaryActions.push({
        label: yapI18n.t('home.tutorial'),
        onPress: () => yapFlow.yapGo(this, model.tutorial),
      });
    } else if (archiveDays.length > 0) {
      // after day 7 the archive is the main entry: a secondary action
      secondaryActions.push({ label: archiveLabel, onPress: archiveToggle });
    }
    const actions = yapHomeActions(width, height, secondaryActions.length);
    this.yapActionsTop = actions.top;

    // the daily heist card: number, status, stars, streak, countdown
    const cardX = 16;
    const cardY = YAP_TOP_BAR_HEIGHT + 16;
    const cardW = width - 32;
    const innerX = cardX + 16;
    const innerW = cardW - 32;
    // the card goes under its content, once its height is known
    const content: Phaser.GameObjects.GameObject[] = [];
    let y = cardY + 18;
    const line = (
      text: string,
      role: YapTextRole,
      color: string,
      gapAfter: number,
    ): Phaser.GameObjects.Text => {
      const t = yapRoleText(this, innerX, y, text, role, color, { wordWrap: { width: innerW } });
      content.push(t);
      y += t.height + gapAfter;
      return t;
    };
    const divider = (): void => {
      content.push(yapRule(this, innerX, innerX + innerW, Math.round(y) + 0.5));
      y += 14;
    };
    const ink = YAP_PALETTE.ink;
    const muted = YAP_PALETTE['ink-muted'];

    if (archiveOpen) {
      // archive panel (story O1): the past days, most recent first, each
      // playable in mode 'archive' — no effect on the streak. The rows shrink
      // to fit between the card top and the actions, so the week never runs
      // under the Close/Tutorial buttons (found on a 400 × 797 phone).
      const compact = height < 700;
      line(yapI18n.t('archive.title'), 'cardTitle', ink, compact ? 4 : 6);
      if (!compact) line(yapI18n.t('archive.playPastDay'), 'body', muted, 14);
      else y += 8;
      divider();
      const metrics = yapFitRows(actions.top - 16 - 16 - y, archiveDays.length);
      const days = loadYapDays(yapStorage);
      for (const day of [...archiveDays].reverse()) {
        const record = days.get(day) ?? null;
        // the status as a small stamp (spec §8, archive cards)
        const status =
          record === null
            ? yapI18n.t('home.stampToDo')
            : yapI18n.t('home.stampCleared', { attempts: record.winningAttempt });
        const weekday = yapI18n.t(`weekdays.d${yapWeekday(day)}` as YapKey);
        content.push(
          this.yapMakeRow(
            innerX,
            y,
            innerW,
            metrics.height,
            yapI18n.t('archive.rowTitle', { day, weekday }),
            status,
            record === null,
            // story X2: the stars of the day record, one row per past day
            record === null ? null : record.stars,
            () => yapFlow.yapGo(this, yapArchiveRoute(day)),
          ),
        );
        y += metrics.height + metrics.gap;
      }
      y -= metrics.gap; // no gap after the last row
      y += 8; // the last row's shadow stays inside the card
      y += 10; // bottom padding (18) minus the last line gap (8)
      root.add(yapCard(this, cardX, cardY, cardW, Math.round(y - cardY)));
      root.add(content);
    } else {
      this.yapBuildFolder(root, model, width, actions.top);
    }

    // the actions: the primary one lowest, the secondary row above it
    root.add(
      yapButton(this, {
        x: actions.primary.x,
        y: actions.primaryY,
        width: actions.primary.width,
        // before / after the week there is no heist to play: the tutorial leads
        label: play !== null ? yapI18n.t('home.play') : yapI18n.t('home.tutorial'),
        kind: 'primary',
        onPress: () => yapFlow.yapGo(this, play ?? model.tutorial),
      }).container,
    );
    secondaryActions.forEach((action, i) => {
      const box = actions.secondary[i];
      if (box === undefined) return;
      root.add(
        yapButton(this, {
          x: box.x,
          y: actions.secondaryY,
          width: box.width,
          label: action.label,
          kind: 'secondary',
          onPress: action.onPress,
          ...(action.fireOn === undefined ? {} : { fireOn: action.fireOn }),
        }).container,
      );
    });

    // The 'image' share variant needs its map File before the tap (E2).
    if (model.canShare && yapResolveShareVariant() === 'image') {
      void yapPrepareShareImage(model.day);
    }

    // 180 ms fade-in: the screen settles instead of snapping (skipped under
    // prefers-reduced-motion, see ./motion.ts).
    yapFadeIn(this, root, 180);
  }

  /**
   * The heist the folder is about: today's during the week; before the week
   * the first one; after it, the last cleared day (day 7 by default).
   */
  private yapFolderDay(model: YapHomeModel): number {
    if (model.phase === 'before') return 1;
    if (model.phase === 'week') return model.day;
    let last = 0;
    for (const [d, record] of loadYapDays(yapStorage)) if (record !== null && d > last) last = d;
    return last > 0 ? last : YAP_WEEK_DAYS;
  }

  /**
   * Home's folder of the day (spec §8): a kraft folder with its tab ("DOSSIER
   * Nº 5 · JEUDI"), the spoiler-free mini plan and the heist's facts on its
   * sheet, the status stamp on the kraft under it; then the streak (its kicker
   * and the seven day boxes) and the countdown, above the actions. Before and
   * after the week the folder holds the first or the last heist, with its stamp.
   */
  private yapBuildFolder(
    root: Phaser.GameObjects.Container,
    model: YapHomeModel,
    width: number,
    actionsTop: number,
  ): void {
    const ink = YAP_PALETTE.ink;
    const muted = YAP_PALETTE['ink-muted'];
    const x = 16;
    const w = width - 32;
    const top = YAP_TOP_BAR_HEIGHT + 16;
    // the streak block under the folder: kicker, day boxes, countdown
    const streakH = model.phase === 'week' ? 16 + 6 + 24 + 12 + 18 : 24;
    const maxH = Math.max(180, actionsTop - 16 - streakH - 14 - top);
    const day = this.yapFolderDay(model);
    const weekday = yapI18n.t(`weekdays.d${yapWeekday(day)}` as YapKey);
    const footer = 44;
    // the folder's geometry (yapFolder): a 20 px tab band, then the body with
    // the sheet 12 px in and the footer under it
    const tabBand = YAP_FOLDER_TAB_BAND;
    const sheetX = x + YAP_FOLDER_INSET;
    const sheetY = top + tabBand + YAP_FOLDER_INSET;
    const sheetW = w - 2 * YAP_FOLDER_INSET;
    const maxSheetH = maxH - tabBand - 2 * YAP_FOLDER_INSET - footer;

    // the sheet's text first (it sets the sheet's height), on the right of
    // the mini plan, which takes 44% of the sheet
    const level = yapLevelById(`daily/d${day}`);
    const pad = 10;
    const mapW = Math.floor(sheetW * 0.44);
    const natural =
      level === null ? null : yapLevelLayout(mapW, 10_000, level, 0, 0, 4, 0).boardHeight;
    const withMap = natural !== null && natural + 2 * pad <= maxSheetH;
    const tx = withMap ? sheetX + pad + mapW + 12 : sheetX + 14;
    const tw = sheetX + sheetW - 12 - tx;
    const texts: Phaser.GameObjects.Text[] = [];
    let ty = sheetY + 16;
    const line = (text: string, role: YapTextRole, color: string, gap: number): void => {
      const t = yapRoleText(this, tx, ty, text, role, color, { wordWrap: { width: tw } });
      texts.push(t);
      ty += t.height + gap;
    };
    if (model.phase === 'week') {
      line(yapI18n.t('home.dailyKicker'), 'kicker', muted, 6);
      if (level !== null) {
        line(level.name, 'cardTitle', ink, 8);
        line(yapI18n.t('planning.statsPar', { par: level.par }), 'stat', ink, 2);
        // story X2: the star thresholds, visible before the attempt
        line(yapStarThresholdText(level.par), 'stat', muted, 6);
        const facts = yapHeistFacts(level)
          .map((kind) => yapI18n.t(`facts.${kind}` as YapKey))
          .join(' · ');
        if (facts !== '') line(facts, 'stat', muted, 0);
      }
    } else if (model.phase === 'before') {
      line(yapI18n.t('homeFlow.beforeTitle'), 'cardTitle', ink, 6);
      line(yapI18n.t('homeFlow.beforeHint'), 'body', muted, 0);
    } else {
      line(yapI18n.t('homeFlow.afterTitle'), 'cardTitle', ink, 6);
      line(yapI18n.t('homeFlow.afterMessage'), 'body', muted, 0);
    }
    const sheetH = Math.min(
      maxSheetH,
      Math.max(withMap ? (natural ?? 0) + 2 * pad : 0, ty - sheetY + 16),
    );
    const h = tabBand + sheetH + 2 * YAP_FOLDER_INSET + footer;
    const folder = yapFolder(
      this,
      x,
      top,
      w,
      h,
      yapI18n.t('home.folderTab', { day, weekday }),
      footer,
    );
    root.add(folder.container);
    const sheet = folder.sheet;
    if (withMap && level !== null) {
      const map = this.add.graphics();
      yapDrawMiniMap(map, level, sheet.x + pad, sheet.y + pad, mapW, natural ?? 0);
      root.add(map);
    }
    root.add(texts);

    // the status on the kraft under the sheet: its kicker, the stars of a
    // cleared day, and the stamp
    const footerY = Math.round(sheet.y + sheet.h + 12 + footer / 2 - 4);
    const status = yapRoleText(
      this,
      x + 14,
      footerY,
      yapI18n.t('home.status'),
      'kicker',
      YAP_PALETTE['kraft-ink'],
    );
    status.setOrigin(0, 0.5);
    root.add(status);
    const record = model.phase === 'week' ? model.record : null;
    let stampText: string;
    let stampColour: 'stamp' | 'ink' = 'ink';
    if (model.phase === 'week') {
      if (record === null) {
        stampText = yapI18n.t('home.stampToDo');
        stampColour = 'stamp';
      } else {
        stampText = yapI18n.t('home.stampCleared', { attempts: record.winningAttempt });
        // stars as filled/empty glyphs: a shape cue, not colour alone
        const stars = yapRoleText(
          this,
          x + 14 + status.width + 10,
          footerY,
          '★'.repeat(record.stars) + '☆'.repeat(3 - record.stars),
          'body',
          YAP_PALETTE.star,
        ).setOrigin(0, 0.5);
        root.add(stars);
      }
    } else {
      stampText = yapI18n.t(model.phase === 'before' ? 'home.stampSoon' : 'home.stampWeekOver');
    }
    const stamp = yapStamp(this, 0, footerY, stampText, stampColour, {
      angle: -6,
      maxWidth: Math.min(200, w * 0.55),
      size: 13,
    });
    stamp.setX(Math.round(x + w - 14 - stamp.width / 2));
    root.add(stamp);

    // the streak and the countdown
    let sy = top + h + 14;
    if (model.phase === 'week') {
      root.add(
        yapRoleText(
          this,
          x,
          sy,
          yapI18n.t('home.streakKicker', { count: model.streak }),
          'kicker',
          muted,
        ),
      );
      sy += 22;
      const won = yapDaysWonOnTime(loadYapDays(yapStorage));
      root.add(yapDayBoxRow(this, x, sy, w, won, model.day));
      sy += 24 + 12;
    } else if (model.phase === 'after') {
      root.add(
        yapRoleText(
          this,
          x,
          sy,
          yapI18n.t('homeFlow.bestStreak', { count: model.bestStreak }),
          'kicker',
          muted,
        ),
      );
    }
    const countdown = this.yapCountdownLabel(model);
    if (countdown !== null) {
      const t = yapRoleText(this, x, sy, countdown, 'stat', muted, { wordWrap: { width: w } });
      root.add(t);
      this.yapCountdownText = t;
    }
  }

  /**
   * Share today's cleared heist from Home (E2): same payload and three
   * variants as the Win screen, built from the stored day record (the winning
   * plan is persisted with it, so the link replays the real run).
   */
  private yapShareDay(day: number): void {
    const record = loadYapDays(yapStorage).get(day) ?? null;
    if (record === null) return;
    const payload: YapPayloadData = {
      day,
      attempts: Math.min(255, record.winningAttempt),
      ticks: record.bestTicks,
      stars: record.stars,
      hints: Math.min(3, record.hints),
      causes: record.causes.slice(0, YAP_MAX_CAUSES),
      shareId: yapLoadShareId(),
      plan: [...record.plan],
      nickname: '',
    };
    const content = yapBuildShareContent(
      {
        attempts: record.winningAttempt,
        ticks: record.bestTicks,
        stars: record.stars,
        emojiLine: yapEmojiLineFor(record.causes, record.winningAttempt, record.hints),
      },
      payload,
    );
    void yapShare({
      context: 'home',
      day,
      content,
      variant: yapResolveShareVariant(),
      image: yapPreparedShareImage(day),
    }).then((report) => this.yapShowShareToast(report));
  }

  /** Transient "Copied" (or failure) note above the actions. */
  private yapShowShareToast(report: YapShareReport): void {
    let message: string | null = null;
    if (report.outcome === 'error') message = yapI18n.t('share.failed');
    else if (report.method === 'clipboard') message = yapI18n.t('common.copied');
    const root = this.yapRoot;
    if (message === null || root === null) return;
    yapShowToast(this, root, yapViewSize(this).width / 2, this.yapActionsTop - 8, message);
  }

  /**
   * A tappable archive row (story O1), an index card at (x, y), its top-left
   * corner: heist number and status on the left, Play on the right. Story X2
   * adds the stars of the day record as filled/empty glyphs, right-aligned
   * just left of Play (null = no record). Between 44 and 64 px tall
   * (yapFitRows), a comfortable touch target.
   */
  private yapMakeRow(
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    status: string,
    toDo: boolean,
    stars: number | null,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const zone = this.add.zone(0, 0, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    // two lines, the title and the status stamp, that also survive the
    // compact height of a small phone
    const tight = h < 56;
    const titleText = yapRoleText(this, 14, tight ? 3 : 7, title, 'body', YAP_PALETTE.ink);
    const statusStamp = yapStamp(this, 0, 0, status, toDo ? 'stamp' : 'ink', {
      angle: -4,
      maxWidth: w * 0.5,
      size: 12,
      // "RÉUSSI · 12 ESSAIS" too wide at 12 px: "RÉUSSI" (the stars say the rest)
      fallback: yapI18n.t('home.stampClearedShort'),
    });
    statusStamp.setPosition(
      Math.round(16 + statusStamp.width / 2),
      Math.round(titleText.y + titleText.height + statusStamp.height / 2 + 1),
    );
    const playText = yapRoleText(
      this,
      w - 14,
      h / 2,
      yapI18n.t('home.play'),
      'button',
      YAP_PALETTE.ink,
    ).setOrigin(1, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [
      yapCard(this, 0, 0, w, h),
      zone,
      titleText,
      statusStamp,
      playText,
    ];
    if (stars !== null) {
      // the record's stars as a shape cue, not color alone (as on Win)
      const clamped = Math.max(0, Math.min(3, stars));
      parts.push(
        yapRoleText(
          this,
          w - 14 - playText.width - 12,
          h / 2,
          '★'.repeat(clamped) + '☆'.repeat(3 - clamped),
          'body',
          YAP_PALETTE.ink,
        ).setOrigin(1, 0.5),
      );
    }
    zone.on('pointerdown', onPress);
    container.add(parts);
    return container;
  }
}
