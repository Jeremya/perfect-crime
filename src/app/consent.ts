// Story G2 — consent gate for Perfect Crime (Yap Corp).
//
// Gate 1 spec ("Analytics and privacy"): "Nothing leaves before consent; a
// refusal means no data, not degraded data." This module owns the consent
// choice (persisted under the `yapcorp:` prefix) and installs a gate transport
// in front of the shared analytics instance, so the single track() entry point
// of src/app/analytics.ts becomes a no-op until the player answers OK:
//
//   - before any answer: every event is dropped at the transport;
//   - refusal ("No thanks"): zero events, ever — not even consent_set;
//   - OK: events flow, and consent_set { granted: true } is the first one
//     (the spec sends consent_set only if yes).
//
// The gate is a YapAnalyticsTransport wrapping the real PostHog transport:
// analytics.ts itself stays untouched, and track() keeps its single entry
// point. The gate re-reads the stored choice at every send, so the answer of
// the banner takes effect immediately, without a reload.
import { configureYapAnalytics, track, YapPostHogTransport, type YapAnalyticsTransport, type YapCapturedEvent } from './analytics';
import { YapStorage, yapStorage } from './storage';

/** The two possible answers to the consent banner. */
export type YapConsentChoice = 'granted' | 'refused';

/**
 * Consent storage key, relative — YapStorage adds the `yapcorp:` prefix
 * (docs/NAMING.md), so the full key is `yapcorp:consent`.
 */
export const YAP_CONSENT_STORAGE_KEY = 'consent';

const YAP_CONSENT_CHOICES: readonly YapConsentChoice[] = ['granted', 'refused'];

/** Reads the stored consent answer; null when the banner was never answered. */
export function yapReadConsent(storage: YapStorage = yapStorage): YapConsentChoice | null {
  const raw = storage.get(YAP_CONSENT_STORAGE_KEY);
  return raw !== null && (YAP_CONSENT_CHOICES as readonly string[]).includes(raw)
    ? (raw as YapConsentChoice)
    : null;
}

/** True only when the player answered OK to the banner. */
export function yapConsentGranted(storage: YapStorage = yapStorage): boolean {
  return yapReadConsent(storage) === 'granted';
}

/** Persists the consent answer (survives reloads; never throws). */
export function yapSetConsent(choice: YapConsentChoice, storage: YapStorage = yapStorage): void {
  storage.set(YAP_CONSENT_STORAGE_KEY, choice);
}

/**
 * Records the answer of the banner. OK persists 'granted' and emits
 * consent_set { granted: true } through track() (the spec sends consent_set
 * only if yes); a refusal persists 'refused' and emits nothing at all — the
 * gate drops every event, so a refusal means zero events, ever.
 */
export function yapAnswerConsent(choice: YapConsentChoice, storage: YapStorage = yapStorage): void {
  yapSetConsent(choice, storage);
  if (choice === 'granted') {
    track('consent_set', { granted: true });
  }
}

/** Provides the current consent state (injectable for tests). */
export type YapConsentProvider = () => boolean;

/**
 * Transport gate: forwards captured events to the delegate only when consent
 * has been granted. While unanswered or refused, send() is a no-op — nothing
 * leaves the device. Forwarded events get the truthful `consent: true` super
 * property (the raw profile flag is owned by the A2/G1 modules).
 */
export class YapConsentGateTransport implements YapAnalyticsTransport {
  constructor(
    private readonly yapDelegate: YapAnalyticsTransport,
    private readonly yapIsGranted: YapConsentProvider,
  ) {}

  send(events: readonly YapCapturedEvent[]): void | Promise<void> {
    if (!this.yapIsGranted() || events.length === 0) return;
    const forwarded = events.map((event) => ({
      ...event,
      properties: { ...event.properties, consent: true },
    }));
    return this.yapDelegate.send(forwarded);
  }
}

export interface YapInstallConsentGateOptions {
  storage?: YapStorage | undefined;
  /** Delegate transport; defaults to the PostHog EU transport of story G1. */
  transport?: YapAnalyticsTransport | undefined;
}

/**
 * Installs the consent gate on the shared analytics instance: from now on,
 * every track() call goes through YapConsentGateTransport. Called once at
 * startup (src/main.ts), before any scene can emit an event.
 */
export function yapInstallConsentGate(options: YapInstallConsentGateOptions = {}): YapConsentGateTransport {
  const storage = options.storage ?? yapStorage;
  const delegate = options.transport ?? new YapPostHogTransport();
  const gate = new YapConsentGateTransport(delegate, () => yapConsentGranted(storage));
  configureYapAnalytics({ storage, transport: gate });
  return gate;
}
