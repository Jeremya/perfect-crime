// YapChallengeScene — the challenge card of a link arrival (story E4).
//
// Opening a share link (https://<domain>/c/<day>#<payload>, E1) stores the
// decoded payload in the inbox (src/app/inbox.ts, `yapcorp:inbox`) and routes
// here (YapChallengeRoute, src/app/router.ts). The card shows the sender's
// result ("Alex cleared heist #3 in 2 attempts · 38 ticks. Your turn." —
// "A friend cleared…" without a nickname), the score comparison with the
// recipient (attempts first, then ticks, then a verdict), and — for a player
// who has never played — the note that the three-level express tutorial
// (T1, T2, T4) comes first. Actions: Take the challenge (express tutorial for
// a new player, the linked heist otherwise) and Later.
//
// The friend's plan stays hidden until the recipient has won the linked heist
// or has taken the second hint (Gate 1 spec, "Arrival" step 4 — the acceptance
// criterion of this story, yapFriendPlanVisible in src/app/inbox.ts): "See
// their plan" only reveals the plan once unlocked, and shows the locked note
// otherwise. When unlocked, the plan is drawn on a small board of the linked
// heist.
//
// Layout follows docs/UI-DESIGN.md: portrait, 64 px top bar, 96 px bottom
// action bar with the primary action lowest, 44 px touch targets, 14 px
// minimum text, all copy from the FR/EN dictionaries.
import Phaser from 'phaser';
import { track } from '../app/analytics';
import { yapI18n } from '../app/i18n';
import {
  loadYapInbox,
  yapCompareWithSender,
  yapFindInboxChallenge,
  yapFriendPlanVisible,
  yapRecipientProgressFromRecord,
  type YapInboxEntry,
} from '../app/inbox';
import {
  loadYapDays,
  loadYapTutorialProgress,
  yapChallengeHeistRoute,
  yapExpressTutorialRoute,
  yapIsKnownPlayer,
  yapLevelById,
  type YapRoute,
} from '../app/router';
import { yapLoadShareId, yapShareIdHex } from '../app/share';
import { yapStorage } from '../app/storage';
import type { YapCell, YapLevel } from '../core/level';
import type { YapPlan } from '../core/sim';
import {
  YAP_BOTTOM_BAR_HEIGHT,
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapCellCenter,
  yapComputeLayout,
  yapDirVector,
  yapHexToInt,
} from './board';
import { yapFitCamera, yapViewSize } from './hidpi';
import { yapFlow } from './home-scene';
import { yapDrawDiamond, yapDrawExit, yapDrawStart, yapDrawStaticGrid } from './render';
import { yapText, yapTextStyle } from './text';

/** Scene key of the challenge card. */
export const YAP_CHALLENGE_SCENE_KEY = 'yap-challenge';

/** Start data of the challenge scene (from the YapChallengeRoute). */
export interface YapChallengeSceneData {
  readonly day: number;
  readonly shareId?: number;
}

/** The cells the sender's plan visits, from the level start. */
function yapPlanCells(level: YapLevel, plan: YapPlan): YapCell[] {
  const cells: YapCell[] = [{ x: level.start.x, y: level.start.y }];
  let current = { x: level.start.x, y: level.start.y };
  for (const move of plan) {
    if (move !== 'wait') {
      const d = yapDirVector(move);
      current = { x: current.x + d.x, y: current.y + d.y };
    }
    cells.push({ x: current.x, y: current.y });
  }
  return cells;
}

export class YapChallengeScene extends Phaser.Scene {
  private yapRoot: Phaser.GameObjects.Container | null = null;
  private yapEntry: YapInboxEntry | null = null;
  private yapDay = 0;
  /** Card view (comparison) or plan view (the friend's plan, once unlocked). */
  private yapView: 'card' | 'plan' = 'card';
  private yapPlanViewedTracked = false;

  constructor() {
    super(YAP_CHALLENGE_SCENE_KEY);
  }

  create(data: YapChallengeSceneData): void {
    this.cameras.main.setBackgroundColor(YAP_PALETTE['surface-page']);
    this.yapDay = data.day;
    this.yapView = 'card';
    this.yapPlanViewedTracked = false;
    this.yapEntry =
      (data.shareId !== undefined ? loadYapInboxEntryByShareId(data.shareId) : null) ??
      yapFindInboxChallenge(yapStorage, data.day);
    if (this.yapEntry === null) {
      // Nothing in the inbox for this day: nothing to show here.
      yapFlow.yapGo(this, { kind: 'home' });
      return;
    }
    // link_opened (Gate 1 spec, "Events"): arrival from a link carrying a payload.
    track('link_opened', {
      day: this.yapEntry.day,
      sender_share_id: yapShareIdHex(this.yapEntry.shareId),
      is_new_player: !yapIsKnownPlayer(yapStorage),
      is_self: this.yapEntry.shareId === yapLoadShareId(),
    });
    this.yapBuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  private readonly yapOnResize = (): void => {
    this.yapBuild();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.yapRoot = null;
  };

  /** The recipient's progress on the linked heist, from `yapcorp:days`. */
  private yapRecipientProgress(): { won: boolean; hints: number } {
    return yapRecipientProgressFromRecord(loadYapDays(yapStorage).get(this.yapDay) ?? null);
  }

  /** True when the friend's plan may be shown (won, or second hint taken). */
  private yapPlanUnlocked(): boolean {
    const entry = this.yapEntry;
    if (entry === null) return false;
    return yapFriendPlanVisible(entry, this.yapRecipientProgress());
  }

  /** Take the challenge: express tutorial for a new player, linked heist otherwise. */
  private yapTakeChallenge(): void {
    track('challenge_cta', { action: 'play' });
    const route: YapRoute = yapIsKnownPlayer(yapStorage)
      ? (yapChallengeHeistRoute(this.yapDay) ?? { kind: 'home' })
      : yapExpressTutorialRoute(loadYapTutorialProgress(yapStorage), this.yapDay);
    yapFlow.yapGo(this, route);
  }

  /** Later: keep the challenge in the inbox, go Home. */
  private yapLater(): void {
    track('challenge_cta', { action: 'later' });
    yapFlow.yapGo(this, { kind: 'home' });
  }

  /** "See their plan": reveal the plan when unlocked, else show the locked note. */
  private yapTogglePlan(): void {
    if (!this.yapPlanUnlocked()) {
      this.yapView = 'card';
      this.yapBuild();
      return;
    }
    this.yapView = this.yapView === 'plan' ? 'card' : 'plan';
    if (this.yapView === 'plan' && !this.yapPlanViewedTracked) {
      this.yapPlanViewedTracked = true;
      track('friend_plan_viewed', { day: this.yapDay });
    }
    this.yapBuild();
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  private yapBuild(): void {
    yapFitCamera(this); // CSS px on a device-pixel canvas (C1)
    this.yapRoot?.destroy();
    this.yapRoot = null;
    const entry = this.yapEntry;
    if (entry === null) return;
    const { width, height } = yapViewSize(this);
    const root = this.add.container(0, 0);
    this.yapRoot = root;

    const textStyle = (
      size: number,
      color: string,
      bold = false,
      wrap = 0,
    ): Phaser.Types.GameObjects.Text.TextStyle =>
      yapTextStyle(size, color, {
        ...(bold ? { fontStyle: 'bold' } : {}),
        ...(wrap > 0 ? { wordWrap: { width: wrap } } : {}),
      });
    const primary = YAP_PALETTE['text-primary'];

    // top bar: screen title, same accent strip as Home and the level HUD
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
      yapText(
        this,
        16,
        YAP_TOP_BAR_HEIGHT / 2,
        yapI18n.t('comparison.title'),
        textStyle(20, primary, true),
      ).setOrigin(0, 0.5),
    );

    // card panel between the bars
    const cardX = 16;
    const cardY = YAP_TOP_BAR_HEIGHT + 16;
    const cardW = width - 32;
    const cardH = height - YAP_BOTTOM_BAR_HEIGHT - 16 - cardY;
    const innerX = cardX + 16;
    const innerW = cardW - 32;
    const card = this.add.graphics();
    root.add(card);
    card
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRoundedRect(cardX, cardY, cardW, cardH, 12)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .strokeRoundedRect(cardX, cardY, cardW, cardH, 12);

    if (this.yapView === 'plan')
      this.yapBuildPlanView(root, innerX, cardY + 16, innerW, cardH - 32);
    else this.yapBuildCardView(root, entry, innerX, cardY + 16, innerW, cardH - 32, textStyle);

    // bottom action bar: Later above the primary Take the challenge
    const barY = height - YAP_BOTTOM_BAR_HEIGHT;
    const bar = this.add.graphics();
    bar
      .fillStyle(yapHexToInt(YAP_PALETTE['surface-panel']), 1)
      .fillRect(0, barY, width, YAP_BOTTOM_BAR_HEIGHT)
      .lineStyle(1, yapHexToInt(YAP_PALETTE['grid-line']), 1)
      .lineBetween(0, barY + 0.5, width, barY + 0.5);
    root.add(bar);
    const btnW = Math.min(width - 32, 420);
    const cx = width / 2;
    root.add(
      this.yapMakeButton(
        cx,
        barY + YAP_BOTTOM_BAR_HEIGHT - 6 - 28,
        btnW,
        56,
        yapI18n.t('challenge.takeChallenge'),
        true,
        () => this.yapTakeChallenge(),
      ),
    );
    root.add(
      this.yapMakeButton(
        cx,
        barY + YAP_BOTTOM_BAR_HEIGHT - 6 - 56 - 12 - 24,
        btnW,
        48,
        yapI18n.t('challenge.later'),
        false,
        () => this.yapLater(),
      ),
    );
  }

  /** The card view: sender line, express note, comparison table, verdict, plan button. */
  private yapBuildCardView(
    root: Phaser.GameObjects.Container,
    entry: YapInboxEntry,
    x: number,
    y: number,
    w: number,
    h: number,
    textStyle: (
      size: number,
      color: string,
      bold?: boolean,
      wrap?: number,
    ) => Phaser.Types.GameObjects.Text.TextStyle,
  ): void {
    const primary = YAP_PALETTE['text-primary'];
    const secondary = YAP_PALETTE['text-secondary'];
    let cursor = y;
    const line = (
      text: string,
      size: number,
      color: string,
      bold: boolean,
      gapAfter: number,
      wrap = 0,
    ): Phaser.GameObjects.Text => {
      const t = yapText(this, x, cursor, text, textStyle(size, color, bold, wrap)).setOrigin(0, 0);
      root.add(t);
      cursor += t.height + gapAfter;
      return t;
    };

    // the shared result: "Alex cleared heist #3 in 2 attempts · 38 ticks. Your turn."
    const senderLine =
      entry.nickname !== ''
        ? yapI18n.t('challenge.withNickname', {
            nickname: entry.nickname,
            day: entry.day,
            attempts: entry.attempts,
            ticks: entry.ticks,
          })
        : yapI18n.t('challenge.anonymous', {
            day: entry.day,
            attempts: entry.attempts,
            ticks: entry.ticks,
          });
    line(senderLine, 20, primary, true, 8, w);

    // a player who has never played gets the express tutorial first
    if (!yapIsKnownPlayer(yapStorage))
      line(yapI18n.t('challengeFlow.expressNote'), 14, secondary, false, 12, w);

    // score comparison: You vs Friend — attempts first, then ticks
    const record = loadYapDays(yapStorage).get(this.yapDay) ?? null;
    const comparison = yapCompareWithSender(entry, record);
    const youX = x + w - 96;
    const friendX = x + w;
    const header = yapText(
      this,
      youX,
      cursor,
      yapI18n.t('challengeFlow.you'),
      textStyle(14, secondary, true),
    ).setOrigin(1, 0);
    const friendHeader = yapText(
      this,
      friendX,
      cursor,
      yapI18n.t('challengeFlow.friend'),
      textStyle(14, secondary, true),
    ).setOrigin(1, 0);
    root.add([header, friendHeader]);
    cursor += Math.max(header.height, friendHeader.height) + 6;

    const starsText = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const rows: readonly (readonly [string, string, string])[] = [
      [
        yapI18n.t('win.attempts'),
        record === null ? '—' : String(record.winningAttempt),
        String(entry.attempts),
      ],
      [
        yapI18n.t('win.ticks'),
        record === null ? '—' : String(record.bestTicks),
        String(entry.ticks),
      ],
      [
        yapI18n.t('win.stars'),
        record === null ? '—' : starsText(record.stars),
        starsText(entry.stars),
      ],
      [
        yapI18n.t('challengeFlow.hints'),
        record === null ? '—' : String(record.hints),
        String(entry.hints),
      ],
    ];
    for (const [label, you, friend] of rows) {
      root.add(yapText(this, x, cursor, label, textStyle(16, secondary)).setOrigin(0, 0));
      root.add(yapText(this, youX, cursor, you, textStyle(16, primary)).setOrigin(1, 0));
      root.add(yapText(this, friendX, cursor, friend, textStyle(16, primary)).setOrigin(1, 0));
      cursor += 26;
    }
    cursor += 6;
    if (comparison !== null) {
      const verdictKey =
        comparison.verdict === 'better'
          ? 'challengeFlow.verdictBetter'
          : comparison.verdict === 'worse'
            ? 'challengeFlow.verdictWorse'
            : 'challengeFlow.verdictTied';
      line(yapI18n.t(verdictKey), 16, primary, true, 12);
    }

    // "See their plan": reveals the plan only once unlocked (won or 2nd hint)
    const unlocked = this.yapPlanUnlocked();
    root.add(
      this.yapMakeButton(
        x + w / 2,
        cursor + 22,
        w,
        44,
        yapI18n.t('comparison.seeTheirPlan'),
        false,
        () => this.yapTogglePlan(),
      ),
    );
    cursor += 44 + 10;
    if (!unlocked) {
      line(yapI18n.t('challengeFlow.planLocked'), 14, secondary, false, 0, w);
    }
    void h;
  }

  /** The plan view: the friend's plan drawn on a small board of the linked heist. */
  private yapBuildPlanView(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const entry = this.yapEntry;
    const level = yapLevelById(`daily/d${this.yapDay}`);
    if (entry === null || level === null) return;
    const primary = YAP_PALETTE['text-primary'];
    const title = yapText(
      this,
      x,
      y,
      yapI18n.t('challengeFlow.planTitle'),
      yapTextStyle(20, primary, { fontStyle: 'bold' }),
    ).setOrigin(0, 0);
    root.add(title);
    root.add(
      this.yapMakeButton(x + w - 40, y + 22, 80, 44, yapI18n.t('common.back'), false, () => {
        this.yapView = 'card';
        this.yapBuild();
      }),
    );

    const areaY = y + title.height + 12;
    const areaH = Math.max(80, y + h - areaY);
    const layout = yapComputeLayout(w, areaH, level.width, level.height, 0, 0);
    const board = this.add.container(x, areaY);
    root.add(board);
    const g = this.add.graphics();
    yapDrawStaticGrid(g, level, layout);
    yapDrawExit(g, layout, level.exit);
    yapDrawDiamond(g, layout, level.loot);
    yapDrawStart(g, layout, level.start);
    board.add(g);

    // the friend's plan: thick rounded near-white route with a dark outline
    const cells = yapPlanCells(level, entry.plan);
    const pts = cells.map((c) => yapCellCenter(layout, c));
    if (pts.length >= 2) {
      const pass = (lineW: number, col: number): void => {
        g.lineStyle(lineW, col, 1);
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const a = pts[i];
          const b = pts[i + 1];
          if (a !== undefined && b !== undefined) g.lineBetween(a.x, a.y, b.x, b.y);
        }
        g.fillStyle(col, 1);
        for (const p of pts) g.fillCircle(p.x, p.y, lineW / 2);
      };
      pass(Math.max(3, layout.cell * 0.36), yapHexToInt(YAP_PALETTE['path-outline']));
      pass(Math.max(2, layout.cell * 0.22), yapHexToInt(YAP_PALETTE['path-light']));
    }
  }

  /** A rounded button drawn in code (same style as the Home screen's). */
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
    const label = yapText(
      this,
      0,
      0,
      labelText,
      yapTextStyle(
        primary ? 20 : 16,
        primary ? YAP_PALETTE['path-light'] : YAP_PALETTE['text-primary'],
        { ...(primary ? { fontStyle: 'bold' } : {}) },
      ),
    ).setOrigin(0.5);
    zone.on('pointerdown', onPress);
    container.add([bg, zone, label]);
    return container;
  }
}

/** Find an inbox entry by the sender's share ID (the route carries it). */
function loadYapInboxEntryByShareId(shareId: number): YapInboxEntry | null {
  return loadYapInbox(yapStorage).find((e) => e.shareId === shareId) ?? null;
}
