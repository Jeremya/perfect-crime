// Unit tests for story G2 — the consent gate (src/app/consent.ts).
// Gate 1 spec: "Nothing leaves before consent; a refusal means no data, not
// degraded data." Every event goes through the single track() entry point;
// the gate transport must drop all of them until the player answers OK, drop
// all of them forever after a refusal, and let them through (consent_set
// first) once the player says OK.
import { afterEach, describe, expect, it } from 'vitest';
import {
  configureYapAnalytics,
  track,
  type YapAnalyticsTransport,
  type YapCapturedEvent,
} from '../../src/app/analytics';
import {
  YAP_CONSENT_STORAGE_KEY,
  YapConsentGateTransport,
  yapAnswerConsent,
  yapConsentGranted,
  yapInstallConsentGate,
  yapReadConsent,
} from '../../src/app/consent';
import { YapStorage, type YapStorageBackend } from '../../src/app/storage';

/** In-memory backend that behaves like a healthy localStorage. */
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

/** Mock transport: records every event that would leave the device. */
class MockTransport implements YapAnalyticsTransport {
  readonly sent: YapCapturedEvent[] = [];
  send(events: readonly YapCapturedEvent[]): void {
    this.sent.push(...events);
  }
}

function setup(): { backend: FakeBackend; storage: YapStorage; transport: MockTransport } {
  const backend = new FakeBackend();
  const storage = new YapStorage(backend);
  const transport = new MockTransport();
  yapInstallConsentGate({ storage, transport });
  return { backend, storage, transport };
}

/** A handful of ordinary gameplay events. */
function playALittle(): void {
  track('level_start', { level_id: 't1', mode: 'tutorial', day: 0 });
  track('attempt_start', { level_id: 't1', attempt: 1, plan_ticks: 12, pauses_used: 0 });
  track('attempt_fail', {
    level_id: 't1',
    attempt: 1,
    cause: 'guard',
    tick: 7,
    ms_since_level_start: 4200,
  });
}

afterEach(() => {
  // Leave the shared instance on a silent transport for the other suites.
  configureYapAnalytics({ transport: new MockTransport() });
});

describe('consent storage', () => {
  it('is unanswered on first launch', () => {
    const { storage } = setup();
    expect(yapReadConsent(storage)).toBeNull();
    expect(yapConsentGranted(storage)).toBe(false);
  });

  it('persists the answer under the yapcorp: prefix', () => {
    const { backend, storage } = setup();
    yapAnswerConsent('refused', storage);
    expect(backend.entries.get(`yapcorp:${YAP_CONSENT_STORAGE_KEY}`)).toBe('refused');
    expect(yapReadConsent(new YapStorage(backend))).toBe('refused');
  });

  it('ignores a corrupted stored value', () => {
    const { backend, storage } = setup();
    backend.setItem(`yapcorp:${YAP_CONSENT_STORAGE_KEY}`, 'maybe');
    expect(yapReadConsent(storage)).toBeNull();
    expect(yapConsentGranted(storage)).toBe(false);
  });
});

describe('consent gate', () => {
  it('sends nothing before the player answers', () => {
    const { transport } = setup();
    playALittle();
    expect(transport.sent).toEqual([]);
  });

  it('sends zero events, ever, after a refusal', () => {
    const { transport, storage } = setup();
    playALittle();
    yapAnswerConsent('refused', storage);
    playALittle();
    track('heartbeat', { active_ms: 30000 });
    expect(transport.sent).toEqual([]);
  });

  it('a refusal survives a reload: still zero events', () => {
    const { backend, storage } = setup();
    yapAnswerConsent('refused', storage);
    const transport = new MockTransport();
    yapInstallConsentGate({ storage: new YapStorage(backend), transport });
    playALittle();
    expect(transport.sent).toEqual([]);
  });

  it('after OK, consent_set is the first event and later events flow', () => {
    const { transport, storage } = setup();
    playALittle();
    yapAnswerConsent('granted', storage);
    playALittle();
    expect(transport.sent.map((e) => e.event)).toEqual([
      'consent_set',
      'level_start',
      'attempt_start',
      'attempt_fail',
    ]);
    expect(transport.sent[0]?.properties.granted).toBe(true);
    for (const event of transport.sent) expect(event.properties.consent).toBe(true);
  });

  it('events dropped before OK are never replayed afterwards', () => {
    const { transport, storage } = setup();
    playALittle();
    yapAnswerConsent('granted', storage);
    expect(transport.sent.map((e) => e.event)).toEqual(['consent_set']);
  });

  it('the gate re-reads consent at every send', () => {
    const transport = new MockTransport();
    let granted = false;
    const gate = new YapConsentGateTransport(transport, () => granted);
    const event: YapCapturedEvent = {
      event: 'heartbeat',
      distinctId: 'a',
      timestamp: 't',
      properties: {},
    };
    void gate.send([event]);
    granted = true;
    void gate.send([event]);
    granted = false;
    void gate.send([event]);
    expect(transport.sent).toHaveLength(1);
  });
});
