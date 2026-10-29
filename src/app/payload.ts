// Story E1 — link payload v1 (Gate 1 spec, "Link payload (v1)").
//
// A share link is https://<domain>/c/<day>#<payload>: the path carries the
// day and serves the preview, the fragment carries the sender's result and
// is never sent to the server (the app strips it from the address bar at
// launch). The payload is a compact byte string, base64url-encoded:
//
//   byte 0              version (1)
//   byte 1              day, 1..255
//   byte 2              winning attempt (0 = not cleared yet)
//   byte 3              best ticks
//   byte 4              stars (2 bits) | hints (2 bits) | cause count (4 bits)
//   bytes 5-6           first 8 failure causes, 2 bits each
//   bytes 7-10          share ID, 32 random bits (big-endian)
//   byte 11             plan length n (at most YAP_MAX_TICKS)
//   bytes 12..          plan, 3 bits per step (N E S W wait), MSB first
//   next                nickname length in bytes, then the UTF-8 nickname
//                       (12 bytes at most, empty by default)
//   last                checksum: XOR of all previous bytes
//
// decode() returns null for anything unreadable: the app then simply opens
// the daily heist, without a challenge card (Gate 1 spec, "The link").
import { YAP_MAX_TICKS } from '../core/level';
import type { YapCause, YapMove, YapPlan } from '../core/sim';

/** Version byte of the payload format (byte 0). */
export const YAP_PAYLOAD_VERSION = 1;
/** At most 8 failure causes are stored (2 bytes, 2 bits each). */
export const YAP_MAX_CAUSES = 8;
/** The nickname is at most 12 UTF-8 bytes. */
export const YAP_MAX_NICKNAME_BYTES = 12;
/** Day is one byte, 1..255. */
export const YAP_MAX_DAY = 255;
/** The share ID is 32 random bits. */
export const YAP_MAX_SHARE_ID = 0xffffffff;

/** Everything a share link carries about the sender's result and plan. */
export interface YapPayloadData {
  /** Day of the shared heist, 1..255. */
  readonly day: number;
  /** Number of the winning attempt (0 = not cleared yet). */
  readonly attempts: number;
  /** Best ticks of the winning plan, pauses included. */
  readonly ticks: number;
  /** Stars, 0..3. */
  readonly stars: number;
  /** Hints used, 0..3. */
  readonly hints: number;
  /** Causes of the first failures, at most 8. */
  readonly causes: readonly YapCause[];
  /** Anonymous share ID, 32 bits. */
  readonly shareId: number;
  /** The plan, at most YAP_MAX_TICKS steps. */
  readonly plan: YapPlan;
  /** Optional nickname, empty by default; at most 12 UTF-8 bytes. */
  readonly nickname?: string;
}

/** Thrown by encode() on invalid input (a caller bug, not a bad link). */
export class YapPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YapPayloadError';
  }
}

// 3 bits per plan step: N, E, S, W, wait.
const MOVE_CODES: Readonly<Record<YapMove, number>> = { N: 0, E: 1, S: 2, W: 3, wait: 4 };
const CODE_MOVES: readonly YapMove[] = ['N', 'E', 'S', 'W', 'wait'];
// 2 bits per failure cause.
const CAUSE_CODES: Readonly<Record<YapCause, number>> = { guard: 0, camera: 1, laser: 2 };
const CODE_CAUSES: readonly YapCause[] = ['guard', 'camera', 'laser'];

const B64U_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64U_INDEX = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64U_ALPHABET.length; i += 1) {
    table[B64U_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** base64url (RFC 4648 §5, no padding) of a byte string. */
function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    out += B64U_ALPHABET.charAt(b0 >> 2);
    out += B64U_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    if (i + 1 < bytes.length) out += B64U_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6));
    if (i + 2 < bytes.length) out += B64U_ALPHABET.charAt(b2 & 0x3f);
  }
  return out;
}

/** Strict base64url decode; null on any character or padding anomaly. */
function base64UrlToBytes(text: string): Uint8Array | null {
  if (text.length === 0 || text.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let accBits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? B64U_INDEX[code] : -1;
    if (value === undefined || value < 0) return null;
    acc = (acc << 6) | value;
    accBits += 6;
    if (accBits >= 8) {
      accBits -= 8;
      out.push((acc >> accBits) & 0xff);
      acc &= (1 << accBits) - 1;
    }
  }
  // Canonical encoding: the leftover bits of the final group must be zero.
  if (acc !== 0) return null;
  return Uint8Array.from(out);
}

function requireInt(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new YapPayloadError(`bad-${name}`);
  }
}

/**
 * Encode/decode of the v1 share payload. Static only: the format is a pure
 * function of its bytes, there is no instance state.
 */
export class YapPayload {
  private constructor() {
    // Static-only class.
  }

  /**
   * Encode a plan + result into the base64url fragment of a share link.
   * Throws YapPayloadError when a field is out of range.
   */
  static encode(data: YapPayloadData): string {
    requireInt('day', data.day, 1, YAP_MAX_DAY);
    requireInt('attempts', data.attempts, 0, 255);
    requireInt('ticks', data.ticks, 0, 255);
    requireInt('stars', data.stars, 0, 3);
    requireInt('hints', data.hints, 0, 3);
    requireInt('shareId', data.shareId, 0, YAP_MAX_SHARE_ID);
    if (data.causes.length > YAP_MAX_CAUSES) throw new YapPayloadError('too-many-causes');
    if (data.plan.length > YAP_MAX_TICKS) throw new YapPayloadError('plan-too-long');
    const nickname = data.nickname ?? '';
    const nicknameBytes = utf8Encoder.encode(nickname);
    if (nicknameBytes.length > YAP_MAX_NICKNAME_BYTES) {
      throw new YapPayloadError('nickname-too-long');
    }

    const n = data.plan.length;
    const planByteCount = Math.ceil((3 * n) / 8);
    const total = 12 + planByteCount + 1 + nicknameBytes.length + 1;
    const bytes = new Uint8Array(total);

    bytes[0] = YAP_PAYLOAD_VERSION;
    bytes[1] = data.day;
    bytes[2] = data.attempts;
    bytes[3] = data.ticks;
    bytes[4] = (data.stars << 6) | (data.hints << 4) | data.causes.length;
    for (let i = 0; i < data.causes.length; i += 1) {
      const cause = data.causes[i];
      const code: number | undefined = cause === undefined ? undefined : CAUSE_CODES[cause];
      if (code === undefined) throw new YapPayloadError('bad-cause');
      bytes[5 + (i >> 2)] = (bytes[5 + (i >> 2)] ?? 0) | (code << (6 - 2 * (i & 3)));
    }
    bytes[7] = (data.shareId >>> 24) & 0xff;
    bytes[8] = (data.shareId >>> 16) & 0xff;
    bytes[9] = (data.shareId >>> 8) & 0xff;
    bytes[10] = data.shareId & 0xff;
    bytes[11] = n;
    let bitPos = 0;
    for (const step of data.plan) {
      const code: number | undefined = MOVE_CODES[step];
      if (code === undefined) throw new YapPayloadError('bad-move');
      for (let b = 2; b >= 0; b -= 1) {
        if (((code >> b) & 1) === 1) {
          const idx = 12 + (bitPos >> 3);
          bytes[idx] = (bytes[idx] ?? 0) | (0x80 >> (bitPos & 7));
        }
        bitPos += 1;
      }
    }
    bytes[12 + planByteCount] = nicknameBytes.length;
    bytes.set(nicknameBytes, 13 + planByteCount);

    let checksum = 0;
    for (let i = 0; i < total - 1; i += 1) checksum ^= bytes[i] ?? 0;
    bytes[total - 1] = checksum;
    return bytesToBase64Url(bytes);
  }

  /**
   * Decode a link fragment (with or without the leading '#'). Returns null
   * when the payload is unreadable: bad base64url, bad checksum, unknown
   * version, out-of-range field or truncated body.
   */
  static decode(fragment: string): YapPayloadData | null {
    const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
    const bytes = base64UrlToBytes(text);
    // Minimum: 12 header bytes + nickname length + checksum.
    if (bytes === null || bytes.length < 14) return null;

    let checksum = 0;
    for (let i = 0; i < bytes.length - 1; i += 1) checksum ^= bytes[i] ?? 0;
    if (checksum !== (bytes[bytes.length - 1] ?? -1)) return null;
    if (bytes[0] !== YAP_PAYLOAD_VERSION) return null;

    const day = bytes[1] ?? 0;
    if (day < 1) return null;
    const attempts = bytes[2] ?? 0;
    const ticks = bytes[3] ?? 0;
    const flags = bytes[4] ?? 0;
    const stars = (flags >> 6) & 3;
    const hints = (flags >> 4) & 3;
    const causeCount = flags & 0x0f;
    if (causeCount > YAP_MAX_CAUSES) return null;

    const causes: YapCause[] = [];
    for (let i = 0; i < causeCount; i += 1) {
      const code = ((bytes[5 + (i >> 2)] ?? 0) >> (6 - 2 * (i & 3))) & 3;
      const cause = CODE_CAUSES[code];
      if (cause === undefined) return null;
      causes.push(cause);
    }

    const shareId =
      (((bytes[7] ?? 0) << 24) |
        ((bytes[8] ?? 0) << 16) |
        ((bytes[9] ?? 0) << 8) |
        (bytes[10] ?? 0)) >>>
      0;

    const n = bytes[11] ?? 0;
    if (n > YAP_MAX_TICKS) return null;
    const planByteCount = Math.ceil((3 * n) / 8);
    const nicknameLengthIndex = 12 + planByteCount;
    const nicknameLength = bytes[nicknameLengthIndex] ?? 0;
    if (nicknameLength > YAP_MAX_NICKNAME_BYTES) return null;
    // The body must end exactly after the nickname and the checksum.
    if (bytes.length !== nicknameLengthIndex + 1 + nicknameLength + 1) return null;

    const plan: YapMove[] = [];
    let bitPos = 0;
    for (let i = 0; i < n; i += 1) {
      let code = 0;
      for (let b = 0; b < 3; b += 1) {
        const bit = ((bytes[12 + (bitPos >> 3)] ?? 0) >> (7 - (bitPos & 7))) & 1;
        code = (code << 1) | bit;
        bitPos += 1;
      }
      const move = CODE_MOVES[code];
      if (move === undefined) return null;
      plan.push(move);
    }

    let nickname = '';
    if (nicknameLength > 0) {
      try {
        nickname = utf8Decoder.decode(
          bytes.subarray(nicknameLengthIndex + 1, nicknameLengthIndex + 1 + nicknameLength),
        );
      } catch {
        return null; // invalid UTF-8
      }
    }

    return { day, attempts, ticks, stars, hints, causes, shareId, plan, nickname };
  }

  /** Full share link: https://<domain>/c/<day>#<payload>. */
  static link(domain: string, data: YapPayloadData): string {
    return `https://${domain}/c/${data.day}#${YapPayload.encode(data)}`;
  }

  /** New anonymous share ID: 32 random bits. */
  static randomShareId(): number {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      cryptoApi.getRandomValues(buffer);
      return buffer[0] ?? 0;
    }
    // Fallback for old webviews without crypto.getRandomValues.
    return Math.floor(Math.random() * (YAP_MAX_SHARE_ID + 1));
  }
}
