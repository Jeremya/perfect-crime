// Story D3 — the Settings screen: its layout, the nickname and the sections of
// the privacy page. What the scene draws is checked in tests/e2e/settings.spec.ts.
import { describe, expect, it } from 'vitest';
import { YAP_CORP } from '../../src/app/brand';
import { YapPayload } from '../../src/app/payload';
import {
  YAP_NICKNAME_KEY,
  yapCleanNickname,
  yapCutNickname,
  yapLoadNickname,
  yapSaveNickname,
} from '../../src/app/share';
import { YapStorage, type YapStorageBackend } from '../../src/app/storage';
import { yapHomeSettingsBox } from '../../src/game/home-layout';
import {
  YAP_SETTINGS_CONTROL_HEIGHT,
  yapPrivacySections,
  yapSettingsLayout,
} from '../../src/game/settings-layout';
import { yapVibrationSupported } from '../../src/game/sound';

class FakeBackend implements YapStorageBackend {
  readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

/** Private browsing: every access throws. */
class ThrowingBackend implements YapStorageBackend {
  getItem(): string | null {
    throw new Error('denied');
  }
  setItem(): void {
    throw new Error('denied');
  }
  removeItem(): void {
    throw new Error('denied');
  }
}

const bytes = (text: string): number => new TextEncoder().encode(text).length;

describe('yapSettingsLayout — the rows and the actions', () => {
  it('follows the order of the spec: language, sound, vibration, nickname, consent', () => {
    const layout = yapSettingsLayout(360, 640, true);
    expect(layout.rows.map((row) => row.id)).toEqual([
      'language',
      'sound',
      'vibration',
      'nickname',
      'consent',
    ]);
  });

  it('leaves the vibration out where the browser has none', () => {
    const layout = yapSettingsLayout(360, 640, false);
    expect(layout.rows.map((row) => row.id)).toEqual(['language', 'sound', 'nickname', 'consent']);
  });

  it('keeps every control at 44 px at least, and in the view', () => {
    expect(YAP_SETTINGS_CONTROL_HEIGHT).toBeGreaterThanOrEqual(44);
    for (const [width, height] of [
      [360, 640],
      [390, 844],
    ] as const) {
      for (const row of yapSettingsLayout(width, height, true).rows) {
        expect(row.first.x).toBeGreaterThanOrEqual(row.labelX + row.labelWidth);
        expect(row.second.x + row.second.width).toBeLessThanOrEqual(width - 16);
        expect(row.first.width).toBeGreaterThanOrEqual(44);
        expect(row.first.x + row.first.width).toBeLessThanOrEqual(row.second.x);
      }
    }
  });

  it('never lets the rows or the version reach the actions on 360 × 640', () => {
    const layout = yapSettingsLayout(360, 640, true);
    const last = layout.rows.at(-1);
    if (last === undefined) throw new Error('no rows');
    expect(last.y + YAP_SETTINGS_CONTROL_HEIGHT / 2).toBeLessThanOrEqual(
      layout.card.y + layout.card.height,
    );
    expect(layout.card.y + layout.card.height).toBeLessThan(layout.versionY);
    expect(layout.versionY).toBeLessThan(layout.actions.top);
  });

  it('spaces the rows so no two controls touch', () => {
    const { rows } = yapSettingsLayout(360, 640, true);
    rows.slice(1).forEach((row, index) => {
      const previous = rows[index];
      if (previous === undefined) throw new Error('no previous row');
      expect(row.y - previous.y).toBeGreaterThan(YAP_SETTINGS_CONTROL_HEIGHT);
    });
  });

  it('centres the card with the actions on a wide view', () => {
    const layout = yapSettingsLayout(800, 900, true);
    expect(layout.card.x).toBe(layout.actions.primary.x);
    expect(layout.card.width).toBe(layout.actions.primary.width);
  });

  it('has one secondary action, the privacy page, above Back', () => {
    expect(yapSettingsLayout(360, 640, true).actions.secondary).toHaveLength(1);
  });
});

describe('yapHomeSettingsBox — the way in, on Home', () => {
  it('is a 44 px target inside the header band, at its right end', () => {
    const box = yapHomeSettingsBox(390);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBe(390 - 16);
    expect(box.y - box.width / 2).toBeGreaterThanOrEqual(0);
    expect(box.y + box.width / 2).toBeLessThanOrEqual(64);
  });
});

describe('the nickname', () => {
  it('keeps a short name as it is', () => {
    expect(yapCleanNickname('Alex')).toBe('Alex');
  });

  it('trims it, and an empty one stays empty', () => {
    expect(yapCleanNickname('  Alex  ')).toBe('Alex');
    expect(yapCleanNickname('   ')).toBe('');
  });

  it('keeps the spaces of a name being typed', () => {
    expect(yapCutNickname('Jean ')).toBe('Jean ');
  });

  it('removes the control characters', () => {
    expect(yapCleanNickname('Al\nex\t\u0000')).toBe('Alex');
  });

  it('cuts at 12 bytes, between two characters', () => {
    expect(yapCleanNickname('abcdefghijklmnop')).toBe('abcdefghijkl');
    expect(bytes(yapCleanNickname('ééééééééééééé'))).toBe(12);
    expect(yapCleanNickname('abcdefghijké')).toBe('abcdefghijk');
    expect(yapCleanNickname('😀😀😀😀')).toBe('😀😀😀');
  });

  it('always fits the link', () => {
    for (const raw of ['Éléonore-Marie', '😀😀😀😀', 'a'.repeat(100), ' é '.repeat(20)]) {
      const nickname = yapCleanNickname(raw);
      const link = YapPayload.encode({
        day: 3,
        attempts: 2,
        ticks: 38,
        stars: 2,
        hints: 0,
        causes: [],
        shareId: 1,
        plan: ['N'],
        nickname,
      });
      expect(YapPayload.decode(link)?.nickname).toBe(nickname);
    }
  });

  it('is empty by default and remembered once saved', () => {
    const storage = new YapStorage(new FakeBackend());
    expect(yapLoadNickname(storage)).toBe('');
    expect(yapSaveNickname('  Alex ', storage)).toBe('Alex');
    expect(yapLoadNickname(storage)).toBe('Alex');
  });

  it('forgets it when it is emptied', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    yapSaveNickname('Alex', storage);
    yapSaveNickname('', storage);
    expect(yapLoadNickname(storage)).toBe('');
  });

  it('cleans what it reads: a stored value must never break a share', () => {
    const backend = new FakeBackend();
    const storage = new YapStorage(backend);
    backend.setItem(`yapcorp:${YAP_NICKNAME_KEY}`, 'much-too-long-for-a-link');
    expect(bytes(yapLoadNickname(storage))).toBeLessThanOrEqual(12);
  });

  it('never throws in private browsing', () => {
    const storage = new YapStorage(new ThrowingBackend());
    expect(yapSaveNickname('Alex', storage)).toBe('Alex');
    expect(() => yapLoadNickname(storage)).not.toThrow();
  });
});

describe('yapPrivacySections — what the privacy page says', () => {
  const heads = (contact: string): string[] =>
    yapPrivacySections(contact).map((section) => section.head);

  it('says what is measured, what is not, where it goes and what the choice is', () => {
    expect(heads('')).toEqual([
      'privacy.measuredHead',
      'privacy.notMeasuredHead',
      'privacy.whereHead',
      'privacy.choiceHead',
    ]);
  });

  it('adds the contact once there is one', () => {
    expect(heads('hello@example.org').at(-1)).toBe('privacy.contactHead');
  });

  it('ships with a contact: the page says who to write to', () => {
    expect(heads(YAP_CORP.contact).at(-1)).toBe('privacy.contactHead');
  });
});

describe('yapVibrationSupported', () => {
  it('follows navigator.vibrate', () => {
    expect(yapVibrationSupported({ vibrate: () => true })).toBe(true);
    expect(yapVibrationSupported({})).toBe(false);
  });
});
