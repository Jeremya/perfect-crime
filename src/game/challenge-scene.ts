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
// a new player, the linked heist otherwise) and Later. Once the recipient has
// a result on that heist the card is the comparison (story E6): the player
// lands here when leaving the Win screen of the linked heist, and the actions
// become Share my result (their own link back: the rematch) and Home.
//
// The friend's plan stays hidden until the recipient has won the linked heist
// or has taken the second hint (Gate 1 spec, "Arrival" step 4 — the acceptance
// criterion of this story, yapFriendPlanVisible in src/app/inbox.ts): "See
// their plan" only reveals the plan once unlocked, and shows the locked note
// otherwise. When unlocked, the plan is drawn on a small board of the linked
// heist.
//
// Layout follows docs/UI-DESIGN.md: portrait, the 64 px header, the actions
// in the bottom third with the primary one lowest (as on Home), 44 px touch
// targets, 14 px minimum text, all copy from the FR/EN dictionaries. C1 plan
// style: the paper page, the kit header ("Message received · heist No. 3"
// over "A challenge from Alex"), an index card and the kit's buttons.
import Phaser from 'phaser';
import { track } from '../app/analytics';
import { yapI18n, type YapKey } from '../app/i18n';
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
import {
  yapLoadShareId,
  yapPrepareShareImage,
  yapResolveShareVariant,
  yapShareIdHex,
} from '../app/share';
import { yapStorage } from '../app/storage';
import type { YapCell, YapLevel } from '../core/level';
import type { YapPlan } from '../core/sim';
import {
  YAP_PALETTE,
  YAP_TOP_BAR_HEIGHT,
  yapDirVector,
  yapHexToInt,
  yapLevelLayout,
} from './board';
import { yapFitCamera, yapOnViewResize, yapViewSize } from './hidpi';
import { yapHomeActions } from './home-layout';
import { yapFlow, yapShareDayResult, yapShareToastMessage } from './home-scene';
import { yapButton, yapCard, yapHeader, yapPaperPage, yapShowToast } from './kit';
import { yapSeal, yapStamp } from './kit-screens';
import { yapHeistFacts, yapHeistName } from './compose';
import {
  yapDrawBoardFrame,
  yapDrawDiamond,
  yapDrawExit,
  yapDrawMiniMap,
  yapDrawRoute,
  yapDrawStart,
  yapDrawStaticGrid,
} from './render';
import { YAP_FRIEND_ROUTE_WIDTH, yapDashes } from './plan-geometry';
import { yapRoleText, type YapTextRole } from './text';

/** Scene key of the challenge card. */
export const YAP_CHALLENGE_SCENE_KEY = 'yap-challenge';

/** Start data of the challenge scene (from the YapChallengeRoute). */
export interface YapChallengeSceneData {
  readonly day: number;
  readonly shareId?: number;
  /**
   * E6: the card is reached from inside the game, when the player leaves the
   * Win screen of the linked heist — not from a link, so no link_opened.
   */
  readonly comparison?: boolean;
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
  /** The verdict stamp has landed: a rebuild (resize, plan view) shows it without the thump. */
  private yapVerdictLanded = false;
  /** Top of the actions, where the share note sits. */
  private yapActionsTop = 0;

  constructor() {
    super(YAP_CHALLENGE_SCENE_KEY);
  }

  create(data: YapChallengeSceneData): void {
    this.cameras.main.setBackgroundColor(YAP_PALETTE['paper-page']);
    this.yapDay = data.day;
    this.yapView = 'card';
    this.yapPlanViewedTracked = false;
    this.yapVerdictLanded = false;
    this.yapEntry =
      (data.shareId !== undefined ? loadYapInboxEntryByShareId(data.shareId) : null) ??
      yapFindInboxChallenge(yapStorage, data.day);
    if (this.yapEntry === null) {
      // Nothing in the inbox for this day: nothing to show here.
      yapFlow.yapGo(this, { kind: 'home' });
      return;
    }
    // link_opened (Gate 1 spec, "Events"): arrival from a link carrying a
    // payload. The comparison after the heist (E6) is not an arrival.
    if (data.comparison !== true) {
      track('link_opened', {
        day: this.yapEntry.day,
        sender_share_id: yapShareIdHex(this.yapEntry.shareId),
        is_new_player: !yapIsKnownPlayer(yapStorage),
        is_self: this.yapEntry.shareId === yapLoadShareId(),
      });
    }
    // the 'image' variant needs its file ready at the tap on Share my result
    if (this.yapHasResult() && yapResolveShareVariant() === 'image') {
      void yapPrepareShareImage(this.yapDay);
    }
    this.yapBuild();
    this.yapOnResize = yapOnViewResize(this, () => this.yapBuild());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown, this);
  }

  /** RESIZE handler made by create(): rebuilds on a new view size only (C1). */
  private yapOnResize: () => void = () => undefined;

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

  /** The recipient has a result on the linked heist: the card is the comparison (E6). */
  private yapHasResult(): boolean {
    return loadYapDays(yapStorage).has(this.yapDay);
  }

  /**
   * Take the challenge: express tutorial for a new player, linked heist
   * otherwise. The route keeps the sender, so the win leads back here (E6).
   */
  private yapTakeChallenge(): void {
    track('challenge_cta', { action: 'play' });
    const from = this.yapEntry?.shareId;
    const route: YapRoute = yapIsKnownPlayer(yapStorage)
      ? (yapChallengeHeistRoute(this.yapDay, from) ?? { kind: 'home' })
      : yapExpressTutorialRoute(loadYapTutorialProgress(yapStorage), this.yapDay, from);
    yapFlow.yapGo(this, route);
  }

  /** Share my result (E6): the player's own link back — the rematch. */
  private yapShareMyResult(): void {
    void yapShareDayResult(this.yapDay, 'comparison')?.then((report) => {
      const message = yapShareToastMessage(report);
      const root = this.yapRoot;
      if (message === null || root === null) return;
      yapShowToast(this, root, yapViewSize(this).width / 2, this.yapActionsTop - 8, message);
    });
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

    // C1 plan style: the paper page, at the back
    root.add(yapPaperPage(this, width, height));

    // the header: the message kicker over who sent the challenge, or the
    // comparison title over the friend's plan
    // (once the recipient has a result, the card is the comparison too: E6)
    const title =
      this.yapView === 'plan' || this.yapHasResult()
        ? yapI18n.t('comparison.title')
        : entry.nickname !== ''
          ? yapI18n.t('challengeFlow.title', { nickname: entry.nickname })
          : yapI18n.t('challengeFlow.titleAnonymous');
    root.add(
      yapHeader(this, width, {
        kicker: yapI18n.t('challengeFlow.kicker', { day: entry.day }),
        title,
      }).container,
    );

    // the actions in the bottom third: Later above the primary Take the
    // challenge, the layout of Home's (yapHomeActions)
    const actions = yapHomeActions(width, height, 1);
    this.yapActionsTop = actions.top;

    // the index card between the header and the actions
    const cardX = 16;
    const cardY = YAP_TOP_BAR_HEIGHT + 16;
    const cardW = width - 32;
    const cardH = Math.round(actions.top - 16 - cardY);
    const innerX = cardX + 16;
    const innerW = cardW - 32;
    if (this.yapView === 'plan') {
      root.add(yapCard(this, cardX, cardY, cardW, cardH));
      this.yapBuildPlanView(root, innerX, cardY + 16, innerW, cardH - 32);
    } else {
      // the memo's card is sized to its content, under it
      const under = root.length;
      const end = this.yapBuildCardView(root, entry, innerX, cardY + 16, innerW, cardH - 32);
      root.addAt(
        yapCard(this, cardX, cardY, cardW, Math.min(cardH, Math.round(end + 16 - cardY))),
        under,
      );
    }

    // E6: with a result on that day the card is the comparison — Share my
    // result (the rematch) and Home; See their plan sits in the card. Without
    // one: Take the challenge and Later.
    const compared = this.yapHasResult();
    // End-to-end hook beside `__yapPhase`
    (window as unknown as Record<string, unknown>)['__yapScreen'] = compared
      ? 'comparison'
      : 'challenge';
    root.add(
      yapButton(this, {
        x: actions.primary.x,
        y: actions.primaryY,
        width: actions.primary.width,
        label: yapI18n.t(compared ? 'comparison.shareMyResult' : 'challenge.takeChallenge'),
        kind: 'primary',
        // the share sheet needs the activation of the release (E2)
        ...(compared ? { fireOn: 'up' as const } : {}),
        onPress: () => (compared ? this.yapShareMyResult() : this.yapTakeChallenge()),
      }).container,
    );
    const second = actions.secondary[0];
    if (second !== undefined) {
      root.add(
        yapButton(this, {
          x: second.x,
          y: actions.secondaryY,
          width: second.width,
          label: yapI18n.t(compared ? 'comparison.home' : 'challenge.later'),
          kind: 'secondary',
          onPress: () => (compared ? yapFlow.yapGo(this, { kind: 'home' }) : this.yapLater()),
        }).container,
      );
    }
  }

  /**
   * The card view (spec §8, challenge): a memo — the sender's result in
   * typewriter capitals, the express note for a new player, the You / Friend
   * grid and, once the recipient has a result, a verdict stamp — then a small
   * spoiler-free plan card of the heist (when there is room) and the sealed
   * block: the wax seal, broken once the plan is unlocked, with See their plan.
   */
  private yapBuildCardView(
    root: Phaser.GameObjects.Container,
    entry: YapInboxEntry,
    x: number,
    y: number,
    w: number,
    h: number,
  ): number {
    const ink = YAP_PALETTE.ink;
    const muted = YAP_PALETTE['ink-muted'];
    let cursor = y;
    const line = (
      text: string,
      role: YapTextRole,
      color: string,
      gapAfter: number,
    ): Phaser.GameObjects.Text => {
      const t = yapRoleText(this, x, cursor, text, role, color, { wordWrap: { width: w } });
      root.add(t);
      cursor += t.height + gapAfter;
      return t;
    };

    // the memo: "ALEX CLEARED HEIST #3 IN 2 ATTEMPTS · 38 TICKS. YOUR TURN."
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
    line(senderLine, 'stat', ink, 10);

    // a player who has never played gets the express tutorial first
    if (!yapIsKnownPlayer(yapStorage)) {
      line(yapI18n.t('challengeFlow.expressNote'), 'caption', muted, 10);
    }

    // score comparison: You vs Friend — attempts first, then ticks
    const record = loadYapDays(yapStorage).get(this.yapDay) ?? null;
    const comparison = yapCompareWithSender(entry, record);
    const youX = x + w - 96;
    const friendX = x + w;
    const header = yapRoleText(this, youX, cursor, yapI18n.t('challengeFlow.you'), 'stat', muted);
    const friendHeader = yapRoleText(
      this,
      friendX,
      cursor,
      yapI18n.t('challengeFlow.friend'),
      'stat',
      muted,
    );
    header.setOrigin(1, 0);
    friendHeader.setOrigin(1, 0);
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
    // labels in the body role, values in the stat role (as on the win report)
    for (const [label, you, friend] of rows) {
      root.add(yapRoleText(this, x, cursor, label, 'body', muted));
      root.add(yapRoleText(this, youX, cursor + 2, you, 'stat', ink).setOrigin(1, 0));
      root.add(yapRoleText(this, friendX, cursor + 2, friend, 'stat', ink).setOrigin(1, 0));
      cursor += 26;
    }
    // the verdict as a stamp under the grid, on its right (spec §8, comparison)
    if (comparison !== null) {
      const key =
        comparison.verdict === 'better'
          ? 'challengeFlow.stampBetter'
          : comparison.verdict === 'worse'
            ? 'challengeFlow.stampWorse'
            : 'challengeFlow.stampTied';
      const stamp = yapStamp(this, 0, cursor + 22, yapI18n.t(key), 'stamp', {
        thump: !this.yapVerdictLanded,
        maxWidth: w * 0.7,
        size: 14,
      });
      stamp.setX(Math.round(x + w - stamp.width / 2 - 8));
      root.add(stamp);
      this.yapVerdictLanded = true;
      cursor += 44;
    }
    cursor += 12;

    // the sealed block, at the foot of the card; See their plan under it once open
    const unlocked = this.yapPlanUnlocked();
    const sealBlockH = 64 + (unlocked ? 54 : 0);
    const bottom = y + h;
    // the small plan card, when it fits between the grid and the sealed block
    const planCardH = 104;
    const level = yapLevelById(`daily/d${this.yapDay}`);
    if (level !== null && bottom - sealBlockH - 12 - cursor >= planCardH) {
      root.add(yapCard(this, x, cursor, w, planCardH));
      const map = this.add.graphics();
      if (yapDrawMiniMap(map, level, x + 10, cursor + 10, 56, planCardH - 20)) root.add(map);
      else map.destroy();
      const tx = x + 80;
      let ty = cursor + 14;
      for (const [text, role, color] of [
        [yapI18n.t('header.daily', { day: this.yapDay }), 'kicker', muted],
        [yapHeistName(level, this.yapDay), 'body', ink],
        [
          [
            yapI18n.t('planning.statsPar', { par: level.par }),
            ...yapHeistFacts(level).map((k) => yapI18n.t(`facts.${k}` as YapKey)),
          ].join(' · '),
          'kicker',
          muted,
        ],
      ] as const) {
        const t = yapRoleText(this, tx, ty, text, role, color, {
          wordWrap: { width: x + w - 10 - tx },
        });
        root.add(t);
        ty += t.height + 4;
      }
      cursor += planCardH + 12;
    }

    // the sealed block follows the content (never past the card's foot)
    const blockY = Math.min(cursor, bottom - sealBlockH);
    // the texts first: the block takes their height (a long FR note wraps)
    const sealTx = x + 66;
    const sealTw = x + w - 10 - sealTx;
    const title = yapRoleText(
      this,
      sealTx,
      blockY + 8,
      yapI18n.t(unlocked ? 'challengeFlow.openTitle' : 'challengeFlow.sealedTitle'),
      'body',
      ink,
      { wordWrap: { width: sealTw } },
    );
    const note = unlocked
      ? null
      : yapRoleText(
          this,
          sealTx,
          blockY + 10 + title.height,
          yapI18n.t('challengeFlow.sealedNote'),
          'kicker',
          muted,
          { wordWrap: { width: sealTw } },
        );
    const blockH = Math.max(56, Math.ceil(10 + title.height + 2 + (note?.height ?? 0) + 10));
    const dashed = this.add.graphics().lineStyle(1, yapHexToInt(ink), 0.35);
    const corners = [
      { x, y: blockY },
      { x: x + w, y: blockY },
      { x: x + w, y: blockY + blockH },
      { x, y: blockY + blockH },
    ];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      if (a === undefined || b === undefined) continue;
      for (const seg of yapDashes(a, b, 4, 3)) dashed.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
    }
    root.add(dashed);
    root.add(
      yapSeal(this, x + 34, blockY + blockH / 2, 20, yapI18n.t('challengeFlow.seal'), unlocked),
    );
    root.add(title);
    if (note !== null) root.add(note);
    if (unlocked) {
      root.add(
        yapButton(this, {
          x,
          y: blockY + blockH + 10 + 22,
          width: w,
          height: 44,
          label: yapI18n.t('comparison.seeTheirPlan'),
          kind: 'secondary',
          onPress: () => this.yapTogglePlan(),
        }).container,
      );
    }
    return blockY + blockH + (unlocked ? 10 + 44 : 0);
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
    const backWidth = 88;
    const title = yapRoleText(
      this,
      x,
      y,
      yapI18n.t('challengeFlow.planTitle'),
      'cardTitle',
      YAP_PALETTE.ink,
      { wordWrap: { width: w - backWidth - 8 } },
    );
    root.add(title);
    root.add(
      yapButton(this, {
        x: x + w - backWidth,
        y: y + 22,
        width: backWidth,
        height: 44,
        label: yapI18n.t('common.back'),
        kind: 'secondary',
        onPress: () => {
          this.yapView = 'card';
          this.yapBuild();
        },
      }).container,
    );

    const areaY = y + Math.max(title.height, 44) + 12;
    const areaH = Math.max(80, y + h - areaY);
    const layout = yapLevelLayout(w, areaH, level, 0, 0);
    const board = this.add.container(x, areaY);
    root.add(board);
    const g = this.add.graphics();
    yapDrawStaticGrid(g, level, layout);
    yapDrawExit(g, layout, level, level.exit);
    yapDrawDiamond(g, layout, level.loot);
    yapDrawStart(g, layout, level.start);
    yapDrawBoardFrame(g, layout);
    board.add(g);

    // the friend's plan in solid ink (spec §7), so it never looks like the
    // player's own marker-red route
    yapDrawRoute(g, layout, yapPlanCells(level, entry.plan), YAP_FRIEND_ROUTE_WIDTH, 'ink');
  }
}

/** Find an inbox entry by the sender's share ID (the route carries it). */
function loadYapInboxEntryByShareId(shareId: number): YapInboxEntry | null {
  return loadYapInbox(yapStorage).find((e) => e.shareId === shareId) ?? null;
}
