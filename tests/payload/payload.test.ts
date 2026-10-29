// Tests for story E1 — link payload v1 (src/app/payload.ts, YapPayload).
//
// The Gate 1 spec ("Link payload (v1)") fixes the byte layout: version,
// day, winning attempt, best ticks, stars/hints/cause-count, the first 8
// failure causes (2 bits each), a 32-bit share ID, the plan (3 bits per
// step), an optional nickname (12 UTF-8 bytes at most) and a final XOR
// checksum, all base64url-encoded. Acceptance: round trip on 10,000 random
// payloads, full link under 200 characters.
import { describe, expect, it } from 'vitest';
import { YAP_MAX_TICKS } from '../../src/core/level';
import type { YapCause, YapMove } from '../../src/core/sim';
import {
  YapPayload,
  YapPayloadError,
  YAP_MAX_CAUSES,
  YAP_MAX_NICKNAME_BYTES,
  YAP_PAYLOAD_VERSION,
  type YapPayloadData,
} from '../../src/app/payload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOVES: readonly YapMove[] = ['N', 'E', 'S', 'W', 'wait'];
const CAUSES: readonly YapCause[] = ['guard', 'camera', 'laser'];
const DOMAIN = 'yap-corp-perfect-crime.pages.dev';

/** Deterministic PRNG (mulberry32) so a failure can be replayed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const utf8 = new TextEncoder();

// Code points of mixed width: ASCII, 2-byte, 3-byte and 4-byte UTF-8.
const NICK_CODE_POINTS = Array.from('abZ09 éàüñΩλ😀🕵');

/** Random nickname whose UTF-8 encoding is at most 12 bytes. */
function randomNickname(rand: () => number): string {
  const count = Math.floor(rand() * 7); // 0..6 code points
  let out = '';
  let bytes = 0;
  for (let i = 0; i < count; i += 1) {
    const cp = NICK_CODE_POINTS[Math.floor(rand() * NICK_CODE_POINTS.length)];
    if (cp === undefined) break;
    const size = utf8.encode(cp).length;
    if (bytes + size > YAP_MAX_NICKNAME_BYTES) break;
    out += cp;
    bytes += size;
  }
  return out;
}

function randomPayload(rand: () => number): YapPayloadData {
  const causeCount = Math.floor(rand() * (YAP_MAX_CAUSES + 1));
  const planLength = Math.floor(rand() * (YAP_MAX_TICKS + 1));
  return {
    day: 1 + Math.floor(rand() * 255),
    attempts: Math.floor(rand() * 256),
    ticks: Math.floor(rand() * 256),
    stars: Math.floor(rand() * 4),
    hints: Math.floor(rand() * 4),
    causes: Array.from({ length: causeCount }, () => {
      const c = CAUSES[Math.floor(rand() * CAUSES.length)];
      if (c === undefined) throw new Error('bad rand');
      return c;
    }),
    shareId: Math.floor(rand() * 4294967296),
    plan: Array.from({ length: planLength }, () => {
      const m = MOVES[Math.floor(rand() * MOVES.length)];
      if (m === undefined) throw new Error('bad rand');
      return m;
    }),
    nickname: randomNickname(rand),
  };
}

/** Independent base64url decoder used to inspect encoded bytes in tests. */
function b64uToBytes(text: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error(`bad char ${ch}`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/** Re-encode raw bytes to base64url (independent of the implementation). */
function bytesToB64u(bytes: readonly number[]): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    out += alphabet.charAt(b0 >> 2);
    out += alphabet.charAt(((b0 & 3) << 4) | (b1 >> 4));
    if (i + 1 < bytes.length) out += alphabet.charAt(((b1 & 15) << 2) | (b2 >> 6));
    if (i + 2 < bytes.length) out += alphabet.charAt(b2 & 63);
  }
  return out;
}

/** Build a raw payload byte string (with a valid checksum) from mutations. */
function craftPayload(mutate: (bytes: number[]) => void): string {
  // A minimal valid v1 payload: version, day 3, attempt 4, ticks 41,
  // stars 2, hints 1, 2 causes, share id 0x01020304, plan of 5 steps,
  // nickname "Alex".
  const bytes = [
    0x01, 0x03, 0x04, 0x29, 0x92, 0x10, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x26, 0x04,
    0x41, 0x6c, 0x65, 0x78,
  ];
  mutate(bytes);
  let checksum = 0;
  for (const b of bytes) checksum ^= b;
  bytes.push(checksum);
  return bytesToB64u(bytes);
}

const BASE_PAYLOAD: YapPayloadData = {
  day: 3,
  attempts: 4,
  ticks: 41,
  stars: 2,
  hints: 1,
  causes: ['guard', 'camera'],
  shareId: 0x01020304,
  plan: ['N', 'E', 'wait', 'S', 'W'],
  nickname: 'Alex',
};

// ---------------------------------------------------------------------------
// Round trip (acceptance criterion)
// ---------------------------------------------------------------------------

describe('YapPayload round trip', () => {
  it('round-trips 10,000 random payloads and keeps every link under 200 characters', () => {
    const rand = mulberry32(0x9e3779b9);
    for (let i = 0; i < 10000; i += 1) {
      const data = randomPayload(rand);
      const fragment = YapPayload.encode(data);
      expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(YapPayload.decode(fragment)).toEqual(data);
      const link = YapPayload.link(DOMAIN, data);
      expect(link.startsWith(`https://${DOMAIN}/c/${data.day}#`)).toBe(true);
      expect(link.length).toBeLessThan(200);
    }
  });

  it('round-trips the boundary payloads: empty and maximal', () => {
    const empty: YapPayloadData = {
      day: 1,
      attempts: 0,
      ticks: 0,
      stars: 0,
      hints: 0,
      causes: [],
      shareId: 0,
      plan: [],
      nickname: '',
    };
    expect(YapPayload.decode(YapPayload.encode(empty))).toEqual(empty);

    const max: YapPayloadData = {
      day: 255,
      attempts: 255,
      ticks: 255,
      stars: 3,
      hints: 3,
      causes: ['guard', 'camera', 'laser', 'guard', 'camera', 'laser', 'guard', 'camera'],
      shareId: 0xffffffff,
      plan: Array.from({ length: YAP_MAX_TICKS }, (_, i) => MOVES[i % MOVES.length] ?? 'wait'),
      nickname: '😀éàüñ', // exactly 12 UTF-8 bytes
    };
    expect(utf8.encode(max.nickname).length).toBe(YAP_MAX_NICKNAME_BYTES);
    expect(YapPayload.decode(YapPayload.encode(max))).toEqual(max);
    expect(YapPayload.link(DOMAIN, max).length).toBeLessThan(200);
  });

  it('keeps the nickname optional: omitted on encode, empty string on decode', () => {
    const { nickname, ...withoutNickname } = BASE_PAYLOAD;
    void nickname;
    const decoded = YapPayload.decode(YapPayload.encode(withoutNickname));
    expect(decoded).not.toBeNull();
    expect(decoded?.nickname).toBe('');
    expect(decoded).toEqual({ ...BASE_PAYLOAD, nickname: '' });
  });
});

// ---------------------------------------------------------------------------
// Golden vector (byte layout of the spec)
// ---------------------------------------------------------------------------

describe('YapPayload golden vector', () => {
  it('encodes the reference payload to the exact spec bytes', () => {
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    // The spec's own share example shows a fragment starting with "#AQME…"
    // for version 1, day 3, attempt 4, ticks 41 — the first four bytes
    // 01 03 04 29.
    expect(fragment).toBe('AQMEKZIQAAECAwQFBiYEQWxleLg');
    expect(b64uToBytes(fragment)).toEqual([
      0x01, 0x03, 0x04, 0x29, 0x92, 0x10, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x26, 0x04,
      0x41, 0x6c, 0x65, 0x78, 0xb8,
    ]);
  });

  it('decodes the reference payload back to the original data', () => {
    expect(YapPayload.decode(YapPayload.encode(BASE_PAYLOAD))).toEqual(BASE_PAYLOAD);
  });

  it('accepts a leading "#" (location.hash) and rejects nothing else silently', () => {
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    expect(YapPayload.decode(`#${fragment}`)).toEqual(BASE_PAYLOAD);
  });

  it('builds the full link as https://<domain>/c/<day>#<payload>', () => {
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    expect(YapPayload.link('example.com', BASE_PAYLOAD)).toBe(`https://example.com/c/3#${fragment}`);
  });
});

// ---------------------------------------------------------------------------
// decode() robustness: an unreadable payload returns null
// ---------------------------------------------------------------------------

describe('YapPayload.decode rejects unreadable payloads', () => {
  it('returns null on empty, non-base64url or truncated input', () => {
    expect(YapPayload.decode('')).toBeNull();
    expect(YapPayload.decode('#')).toBeNull();
    expect(YapPayload.decode('!!!')).toBeNull();
    expect(YapPayload.decode('A')).toBeNull(); // length % 4 === 1 is impossible
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    expect(YapPayload.decode(fragment.slice(0, -2))).toBeNull();
    expect(YapPayload.decode(fragment.slice(0, 10))).toBeNull();
  });

  it('returns null when any byte is corrupted (checksum)', () => {
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    // Flip one base64url char in the middle: the decoded bytes change, so the
    // XOR checksum no longer matches. (The final char only carries padding
    // bits and is covered by the canonical check below.)
    for (const idx of [0, 4, 10, fragment.length - 2]) {
      const ch = fragment.charAt(idx);
      const flipped = ch === 'A' ? 'B' : 'A';
      expect(YapPayload.decode(fragment.slice(0, idx) + flipped + fragment.slice(idx + 1))).toBeNull();
    }
  });

  it('returns null on non-canonical base64url (non-zero padding bits)', () => {
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    const last = fragment.charAt(fragment.length - 1);
    const flipped = last === 'A' ? 'B' : 'A';
    expect(YapPayload.decode(fragment.slice(0, -1) + flipped)).toBeNull();
  });

  it('returns null on a wrong version byte', () => {
    expect(YapPayload.decode(craftPayload((b) => (b[0] = 2)))).toBeNull();
  });

  it('returns null on day 0', () => {
    expect(YapPayload.decode(craftPayload((b) => (b[1] = 0)))).toBeNull();
  });

  it('returns null on more than 8 causes', () => {
    expect(YapPayload.decode(craftPayload((b) => (b[4] = ((b[4] ?? 0) & 0xf0) | 9)))).toBeNull();
  });

  it('returns null on an unknown cause code (3)', () => {
    expect(YapPayload.decode(craftPayload((b) => (b[5] = 0xff)))).toBeNull();
  });

  it('returns null on a plan longer than 64 steps', () => {
    expect(YapPayload.decode(craftPayload((b) => (b[11] = 65)))).toBeNull();
  });

  it('returns null on an unknown plan step code (5..7)', () => {
    // First step occupies the top 3 bits of byte 12: 101 = 5.
    expect(YapPayload.decode(craftPayload((b) => (b[12] = 0b101_00000)))).toBeNull();
  });

  it('returns null on a nickname longer than 12 bytes', () => {
    expect(YapPayload.decode(craftPayload((b) => (b[14] = 13)))).toBeNull();
  });

  it('returns null on trailing garbage after the checksum', () => {
    const fragment = YapPayload.encode(BASE_PAYLOAD);
    expect(YapPayload.decode(fragment + 'AAAA')).toBeNull();
  });

  it('returns null on invalid UTF-8 in the nickname', () => {
    expect(
      YapPayload.decode(
        craftPayload((b) => {
          b[14] = 1;
          b[15] = 0xff; // invalid UTF-8 start byte
          b.length = 16; // drop "lex", keep the length consistent
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// encode() validation: invalid data throws YapPayloadError
// ---------------------------------------------------------------------------

describe('YapPayload.encode validates its input', () => {
  const valid: YapPayloadData = { ...BASE_PAYLOAD };
  type MutablePayload = { -readonly [K in keyof YapPayloadData]: YapPayloadData[K] };

  function expectThrow(mutate: (d: MutablePayload) => void): void {
    const copy: MutablePayload = { ...valid, causes: [...valid.causes], plan: [...valid.plan] };
    mutate(copy);
    expect(() => YapPayload.encode(copy)).toThrow(YapPayloadError);
  }

  it('rejects out-of-range integers', () => {
    expectThrow((d) => (d.day = 0));
    expectThrow((d) => (d.day = 256));
    expectThrow((d) => (d.day = 1.5));
    expectThrow((d) => (d.attempts = -1));
    expectThrow((d) => (d.attempts = 256));
    expectThrow((d) => (d.ticks = 300));
    expectThrow((d) => (d.stars = 4));
    expectThrow((d) => (d.hints = -1));
    expectThrow((d) => (d.shareId = -1));
    expectThrow((d) => (d.shareId = 4294967296));
    expectThrow((d) => (d.shareId = 1.5));
  });

  it('rejects too many causes and unknown causes', () => {
    expectThrow((d) => (d.causes = Array.from({ length: 9 }, () => 'guard')));
    expectThrow((d) => (d.causes = ['guard', 'nope' as YapCause]));
  });

  it('rejects a plan longer than 64 steps and unknown moves', () => {
    expectThrow((d) => (d.plan = Array.from({ length: YAP_MAX_TICKS + 1 }, () => 'N')));
    expectThrow((d) => (d.plan = ['N', 'X' as YapMove]));
  });

  it('rejects a nickname longer than 12 UTF-8 bytes', () => {
    expectThrow((d) => (d.nickname = '😀😀😀😀')); // 16 bytes
    expectThrow((d) => (d.nickname = 'aaaaaaaaaaaaa')); // 13 bytes
  });

  it('accepts the maximal nickname of exactly 12 bytes', () => {
    const d: YapPayloadData = { ...valid, nickname: '😀éàüñ' };
    expect(YapPayload.decode(YapPayload.encode(d))?.nickname).toBe('😀éàüñ');
  });
});

// ---------------------------------------------------------------------------
// Share ID
// ---------------------------------------------------------------------------

describe('YapPayload.randomShareId', () => {
  it('returns 32 random bits', () => {
    for (let i = 0; i < 100; i += 1) {
      const id = YapPayload.randomShareId();
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('is carried through the round trip', () => {
    const d: YapPayloadData = { ...BASE_PAYLOAD, shareId: YapPayload.randomShareId() };
    expect(YapPayload.decode(YapPayload.encode(d))?.shareId).toBe(d.shareId);
  });
});

describe('payload constants', () => {
  it('exposes the v1 version byte', () => {
    expect(YAP_PAYLOAD_VERSION).toBe(1);
  });
});
