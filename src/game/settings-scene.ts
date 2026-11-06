// YapSettingsScene — the Settings screen of the spec (story D3): language,
// sound, vibration, nickname, consent, the privacy page and the version.
//
// Every row applies at once and is remembered by the module that owns it
// (i18n, YapSoundSettings, the share nickname, the consent gate): the screen
// holds no state of its own, and redraws from those after each change. A
// choice is a pair of buttons, the current one filled: refusing the measure
// takes one tap, as accepting it does.
import Phaser from 'phaser';
import { YAP_CORP } from '../app/brand';
import { yapAnswerConsent, yapReadConsent } from '../app/consent';
import { yapI18n, yapLanguageLabel, type YapKey, type YapLocale } from '../app/i18n';
import { yapCutNickname, yapLoadNickname, yapSaveNickname } from '../app/share';
import { yapStorage } from '../app/storage';
import { YAP_PALETTE } from './board';
import { yapFitCamera, yapOnViewResize, yapViewSize } from './hidpi';
import { YAP_HOME_SCENE_KEY } from './home-scene';
import { yapButton, yapCard, yapHeader, yapPaperPage, type YapBox } from './kit';
import {
  YAP_PRIVACY_SCENE_KEY,
  YAP_SETTINGS_CONTROL_HEIGHT,
  YAP_SETTINGS_SCENE_KEY,
  yapSettingsLayout,
  type YapSettingsRow,
  type YapSettingsRowId,
} from './settings-layout';
import { yapSoundSettings, yapVibrationSupported } from './sound';
import { yapRoleText } from './text';
import { yapOpenTextField, type YapFieldBox, type YapTextField } from './text-field';

/** The label of a row, by id. */
const YAP_SETTINGS_LABELS: Readonly<Record<YapSettingsRowId, YapKey>> = {
  language: 'settings.language',
  sound: 'settings.sound',
  vibration: 'settings.vibration',
  nickname: 'settings.nickname',
  consent: 'settings.consent',
};

/** A row's two choices: their labels, which one is on, and what each does. */
interface YapSettingsChoices {
  readonly labels: readonly [string, string];
  /** 0 or 1; null while neither is (a consent never answered). */
  readonly on: 0 | 1 | null;
  readonly pick: (index: 0 | 1) => void;
}

export class YapSettingsScene extends Phaser.Scene {
  private yapRoot: Phaser.GameObjects.Container | null = null;
  /** The nickname field, while the player types. */
  private yapField: YapTextField | null = null;

  constructor() {
    super(YAP_SETTINGS_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(YAP_PALETTE['paper-page']);
    this.yapBuild();
    this.yapOnResize = yapOnViewResize(this, () => this.yapBuild());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    // Phaser cancels the press on the canvas, so it takes no focus from the
    // field: the press itself has to end the typing
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.yapCloseField);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.yapOnShutdown);
  }

  /** RESIZE handler made by create(): rebuilds on a new view size only (C1). */
  private yapOnResize: () => void = () => undefined;

  private readonly yapCloseField = (): void => {
    this.yapField?.close();
  };

  private readonly yapOnShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.yapOnResize);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.yapCloseField);
    this.yapCloseField();
    this.yapRoot = null;
  };

  /** (Re)draws the screen from what the modules remember. */
  private yapBuild(): void {
    yapFitCamera(this); // CSS px on a device-pixel canvas (C1)
    this.yapRoot?.destroy();
    const { width, height } = yapViewSize(this);
    const layout = yapSettingsLayout(width, height, yapVibrationSupported());
    const root = this.add.container(0, 0);
    this.yapRoot = root;

    root.add(yapPaperPage(this, width, height));
    root.add(
      yapHeader(this, width, {
        kicker: yapI18n.t('app.title'),
        title: yapI18n.t('settings.title'),
      }).container,
    );
    const { card } = layout;
    root.add(yapCard(this, card.x, card.y, card.width, card.height));
    for (const row of layout.rows) this.yapBuildRow(root, row);

    root.add(
      yapRoleText(
        this,
        width / 2,
        layout.versionY,
        yapI18n.t('settings.version', { version: YAP_CORP.version }),
        'stat',
        YAP_PALETTE['ink-muted'],
      ).setOrigin(0.5),
    );

    const { actions } = layout;
    const privacy = actions.secondary[0];
    if (privacy !== undefined) {
      root.add(
        yapButton(this, {
          x: privacy.x,
          y: actions.secondaryY,
          width: privacy.width,
          label: yapI18n.t('settings.privacy'),
          kind: 'secondary',
          onPress: () => this.scene.launch(YAP_PRIVACY_SCENE_KEY),
        }).container,
      );
    }
    root.add(
      yapButton(this, {
        x: actions.primary.x,
        y: actions.primaryY,
        width: actions.primary.width,
        label: yapI18n.t('common.back'),
        kind: 'primary',
        onPress: () => this.scene.start(YAP_HOME_SCENE_KEY),
      }).container,
    );

    const nickname = layout.rows.find((row) => row.id === 'nickname');
    if (nickname !== undefined) this.yapField?.place(this.yapNicknameBox(nickname));
    // End-to-end hook beside `__yapPhase`
    (window as unknown as Record<string, unknown>)['__yapScreen'] = 'settings';
  }

  private yapBuildRow(root: Phaser.GameObjects.Container, row: YapSettingsRow): void {
    root.add(
      yapRoleText(
        this,
        row.labelX,
        row.y,
        yapI18n.t(YAP_SETTINGS_LABELS[row.id]),
        'body',
        YAP_PALETTE.ink,
        { wordWrap: { width: row.labelWidth } },
      ).setOrigin(0, 0.5),
    );
    if (row.id === 'nickname') {
      this.yapBuildNickname(root, row);
      return;
    }
    const choices = this.yapChoices(row.id);
    const boxes: readonly [YapBox, YapBox] = [row.first, row.second];
    boxes.forEach((box, index) => {
      root.add(
        yapButton(this, {
          x: box.x,
          y: row.y,
          width: box.width,
          height: YAP_SETTINGS_CONTROL_HEIGHT,
          label: choices.labels[index as 0 | 1],
          kind: choices.on === index ? 'primary' : 'secondary',
          onPress: () => {
            choices.pick(index as 0 | 1);
            this.yapBuild();
          },
        }).container,
      );
    });
  }

  /** The nickname as a friend will read it; a tap opens the field over it. */
  private yapBuildNickname(root: Phaser.GameObjects.Container, row: YapSettingsRow): void {
    const box = this.yapNicknameBox(row);
    const nickname = yapLoadNickname(yapStorage);
    root.add(
      yapButton(this, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        label: nickname !== '' ? nickname : yapI18n.t('settings.nicknameEmpty'),
        kind: 'secondary',
        // a phone only opens its keyboard on the release of a touch
        fireOn: 'up',
        onPress: () => this.yapOpenField(box),
      }).container,
    );
  }

  private yapNicknameBox(row: YapSettingsRow): YapFieldBox {
    return {
      x: row.first.x,
      y: row.y,
      width: row.second.x + row.second.width - row.first.x,
      height: YAP_SETTINGS_CONTROL_HEIGHT,
    };
  }

  private yapOpenField(box: YapFieldBox): void {
    if (this.yapField !== null) return;
    this.yapField = yapOpenTextField(this, {
      value: yapLoadNickname(yapStorage),
      label: yapI18n.t('settings.nickname'),
      box,
      fit: yapCutNickname,
      onDone: (value) => {
        yapSaveNickname(value, yapStorage);
        this.yapField = null;
        if (this.sys.isActive()) this.yapBuild();
      },
    });
  }

  private yapChoices(id: Exclude<YapSettingsRowId, 'nickname'>): YapSettingsChoices {
    const toggle = (on: boolean, set: (next: boolean) => void): YapSettingsChoices => ({
      labels: [yapI18n.t('settings.on'), yapI18n.t('settings.off')],
      on: on ? 0 : 1,
      pick: (index) => set(index === 0),
    });
    switch (id) {
      case 'language': {
        const locales: readonly [YapLocale, YapLocale] = ['fr', 'en'];
        return {
          labels: [yapLanguageLabel(locales[0]), yapLanguageLabel(locales[1])],
          on: yapI18n.getLocale() === locales[0] ? 0 : 1,
          pick: (index) => yapI18n.setLocale(locales[index]),
        };
      }
      case 'sound':
        return toggle(yapSoundSettings.yapSoundEnabled(), (on) =>
          yapSoundSettings.yapSetSoundEnabled(on),
        );
      case 'vibration':
        return toggle(yapSoundSettings.yapVibrationEnabled(), (on) =>
          yapSoundSettings.yapSetVibrationEnabled(on),
        );
      case 'consent': {
        const answer = yapReadConsent(yapStorage);
        return {
          labels: [yapI18n.t('consent.accept'), yapI18n.t('consent.decline')],
          on: answer === null ? null : answer === 'granted' ? 0 : 1,
          pick: (index) => {
            const next = index === 0 ? 'granted' : 'refused';
            if (next !== answer) yapAnswerConsent(next, yapStorage);
          },
        };
      }
    }
  }
}
