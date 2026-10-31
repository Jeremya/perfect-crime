// Tests for the text factory (story C1, visual pass 3 — crisp HiDPI rendering).
//
// Every Text in the game is made through one factory, so that none is left at
// Phaser's default resolution of 1 (blurry on a high-density screen) and none
// names a font of its own: the three system font stacks live in one place. The
// style builder is pure and the scene is a fake that records what it was asked
// to create, so the suite runs in node, where there is no devicePixelRatio and
// the resolution is 1.
//
// The type roles of the plan style sit on the same factory: a role names a
// face, a size, a font style, a case and a tracking. A tracked role sets its
// letter spacing on the Text once it is created, so the fake Text of the role
// tests records the setLetterSpacing calls it receives.
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  YAP_FONT_STACKS,
  YAP_TEXT_ROLES,
  yapRoleStyle,
  yapRoleText,
  yapRoleTracking,
  yapText,
  yapTextStyle,
  type YapTextRole,
  type YapTextRoleSpec,
} from '../../src/game/text';

describe('YAP_FONT_STACKS — system fonts only', () => {
  it('pins the three system font stacks', () => {
    expect(YAP_FONT_STACKS).toEqual({
      ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif',
      serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
      mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace',
    });
  });
});

describe('yapTextStyle — a style at the device resolution', () => {
  // toStrictEqual: Phaser reads a key that is present even when its value is
  // undefined, so a stray `undefined` in the style is not harmless.
  it('builds a style at the device resolution', () => {
    expect(yapTextStyle(16, '#202A33')).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.ui,
      fontSize: '16px',
      color: '#202A33',
      resolution: 1,
    });
  });

  it('passes extra style through and picks the family', () => {
    const style = yapTextStyle(14, '#000', {
      family: 'mono',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 200 },
    });
    expect(style).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.mono,
      fontSize: '14px',
      color: '#000',
      resolution: 1,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 200 },
    });
    // `family` is the factory's own option, not a Phaser style key: it is
    // consumed, never forwarded
    expect(style).not.toHaveProperty('family');
  });

  // The @ts-expect-error below is enforced by `npm run typecheck`, which covers
  // tests/; vitest itself does not typecheck.
  it('refuses the font shorthand, which would override the stacks', () => {
    // @ts-expect-error — `font` sets family, size and style at once: use `family`
    yapTextStyle(16, '#000', { font: '16px serif' });
    // the supported way to a 16 px serif, with no `font` riding along to override it
    const style = yapTextStyle(16, '#000', { family: 'serif' });
    expect(style).toMatchObject({ fontFamily: YAP_FONT_STACKS.serif, fontSize: '16px' });
    expect(style).not.toHaveProperty('font');
  });
});

describe('yapText — a Text created through the scene', () => {
  it('creates text through the scene with the device resolution', () => {
    // echoes its arguments, so the returned "Text" shows what it was made from
    const text = vi.fn(
      (
        x: number,
        y: number,
        content: string | string[],
        style: Phaser.Types.GameObjects.Text.TextStyle,
      ) => ({ x, y, content, style }),
    );
    const scene = { add: { text } } as unknown as Phaser.Scene;
    const style = { color: '#111', resolution: 7 };

    const created = yapText(scene, 4, 5, 'Hi', style);

    // the caller's own resolution (7) gives way to the device's (1 in node)
    expect(text).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledWith(4, 5, 'Hi', { color: '#111', resolution: 1 });
    // without touching the style object, which a scene may share between texts
    expect(style).toEqual({ color: '#111', resolution: 7 });
    // and the caller gets back exactly what the scene created
    expect(created).toBe(text.mock.results[0]?.value);
  });
});

describe('YAP_TEXT_ROLES — the type roles of the plan style', () => {
  // toStrictEqual: a role carries only the keys it sets, with no `bold: false`
  // or `tracking: undefined` riding along
  it('pins the role table', () => {
    expect(YAP_TEXT_ROLES).toStrictEqual({
      screenTitle: { family: 'serif', size: 27 },
      cardTitle: { family: 'serif', size: 22 },
      body: { family: 'serif', size: 16 },
      caption: { family: 'serif', size: 15, italic: true },
      kicker: { family: 'mono', size: 12, upper: true, tracking: 0.12 },
      stat: { family: 'mono', size: 14, upper: true, tracking: 0.12 },
      statLarge: { family: 'mono', size: 22, bold: true },
      button: { family: 'mono', size: 14, upper: true, tracking: 0.14 },
      buttonPrimary: { family: 'mono', size: 15, bold: true, upper: true, tracking: 0.18 },
    });
  });
});

describe('yapRoleStyle — the style of a role', () => {
  it('role styles pick family, size and style', () => {
    expect(yapRoleStyle('caption', '#111')).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.serif,
      fontSize: '15px',
      color: '#111',
      resolution: 1,
      fontStyle: 'italic',
    });
    expect(yapRoleStyle('buttonPrimary', '#111')).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.mono,
      fontSize: '15px',
      color: '#111',
      resolution: 1,
      fontStyle: 'bold',
    });
  });

  it('gives a plain role no font style at all', () => {
    // toStrictEqual: Phaser reads a `fontStyle` key that is present even when
    // its value is undefined
    expect(yapRoleStyle('screenTitle', '#111')).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.serif,
      fontSize: '27px',
      color: '#111',
      resolution: 1,
    });
  });

  it('joins bold and italic when a role has both', () => {
    // no role of the table is both: widen one for the length of the test
    const roles: Record<YapTextRole, YapTextRoleSpec> = YAP_TEXT_ROLES;
    const body = roles.body;
    roles.body = { ...body, bold: true, italic: true };
    try {
      expect(yapRoleStyle('body', '#111').fontStyle).toBe('bold italic');
    } finally {
      roles.body = body;
    }
  });

  it('passes extra style through, but the role keeps its family and font style', () => {
    const style = yapRoleStyle('caption', '#111', {
      align: 'center',
      wordWrap: { width: 200 },
      family: 'mono',
      fontStyle: 'bold',
    });
    expect(style).toStrictEqual({
      fontFamily: YAP_FONT_STACKS.serif,
      fontSize: '15px',
      color: '#111',
      resolution: 1,
      fontStyle: 'italic',
      align: 'center',
      wordWrap: { width: 200 },
    });
  });

  it('lets a role without a font style take the one in extra', () => {
    expect(yapRoleStyle('body', '#111', { fontStyle: 'bold' })).toMatchObject({
      fontStyle: 'bold',
    });
  });
});

describe('yapRoleTracking — the letter spacing of a role, in px', () => {
  it('is the tracking in em times the size, to 0.1 px', () => {
    expect(yapRoleTracking('kicker')).toBe(1.4); // 12 × 0.12 = 1.44
    expect(yapRoleTracking('stat')).toBe(1.7); // 14 × 0.12 = 1.68
    expect(yapRoleTracking('button')).toBe(2); // 14 × 0.14 = 1.96
    expect(yapRoleTracking('buttonPrimary')).toBe(2.7); // 15 × 0.18 = 2.7
  });

  it('is 0 for a role without tracking', () => {
    for (const role of ['screenTitle', 'cardTitle', 'body', 'caption', 'statLarge'] as const) {
      expect(yapRoleTracking(role)).toBe(0);
    }
  });
});

/**
 * A scene whose add.text returns a fake Text. The fake records the calls to
 * setLetterSpacing and chains like Phaser's, which returns the Text itself.
 */
function yapFakeScene() {
  const setLetterSpacing = vi.fn<(value: number) => unknown>().mockReturnThis();
  const text = vi.fn(
    (
      _x: number,
      _y: number,
      _content: string | string[],
      _style: Phaser.Types.GameObjects.Text.TextStyle,
    ) => ({ setLetterSpacing }),
  );
  return { scene: { add: { text } } as unknown as Phaser.Scene, text, setLetterSpacing };
}

describe('yapRoleText — a Text made from a role', () => {
  it('role text uppercases and tracks', () => {
    const { scene, text, setLetterSpacing } = yapFakeScene();

    const created = yapRoleText(scene, 3, 4, 'Casse nº 5', 'kicker', '#111');

    // the content in capitals ('º' has none and stays), with the style of the role
    expect(text).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledWith(3, 4, 'CASSE Nº 5', yapRoleStyle('kicker', '#111'));
    // 12 px × 0.12 em = 1.44 px, to 0.1 px
    expect(setLetterSpacing).toHaveBeenCalledTimes(1);
    expect(setLetterSpacing).toHaveBeenCalledWith(1.4);
    // and the caller gets back the Text the scene created
    expect(created).toBe(text.mock.results[0]?.value);
  });

  it('capitalises the same way on every device locale', () => {
    const { scene, text } = yapFakeScene();
    // On a Turkish device toLocaleUpperCase turns i into İ, which an EN or FR
    // text must not get: simulate that device (node does not take it from the
    // environment), so that a role using toLocaleUpperCase fails here.
    const toLocaleUpperCase = vi.spyOn(String.prototype, 'toLocaleUpperCase');
    toLocaleUpperCase.mockImplementation(function (this: string) {
      return this.toUpperCase().replaceAll('I', 'İ');
    });
    try {
      yapRoleText(scene, 0, 0, 'Timide', 'kicker', '#111');

      expect(text).toHaveBeenCalledWith(0, 0, 'TIMIDE', yapRoleStyle('kicker', '#111'));
    } finally {
      toLocaleUpperCase.mockRestore();
    }
  });

  it('serif roles keep case and spacing', () => {
    const { scene, text, setLetterSpacing } = yapFakeScene();

    yapRoleText(scene, 0, 0, 'Le plan', 'screenTitle', '#111');

    expect(text).toHaveBeenCalledWith(0, 0, 'Le plan', yapRoleStyle('screenTitle', '#111'));
    expect(setLetterSpacing).not.toHaveBeenCalled();
  });

  it('passes extra style to the Text', () => {
    const { scene, text } = yapFakeScene();

    yapRoleText(scene, 0, 0, 'Le plan', 'body', '#111', {
      align: 'center',
      wordWrap: { width: 200 },
    });

    expect(text).toHaveBeenCalledWith(0, 0, 'Le plan', {
      fontFamily: YAP_FONT_STACKS.serif,
      fontSize: '16px',
      color: '#111',
      resolution: 1,
      align: 'center',
      wordWrap: { width: 200 },
    });
  });
});
