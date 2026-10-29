# Gate 1 dashboard — Perfect Crime (Yap Corp)

PM deliverable for story **G3**. This document is the build sheet for the
PostHog dashboards of Gate 1: the **five indicators** (with their exact
definitions and kill thresholds), the **share funnel**, and the
**failure-cause breakdown**, plus the other diagnostics the spec tracks
without a threshold.

Sources of truth:

- `Gate 1 — Specs and backlog.pdf`, sections *"Five indicators, three
  questions"*, *"What we measure"*, *"Metrics and test protocol"*, *"Events"*,
  *"Analytics and privacy"*.
- The typed event map in `src/app/analytics.ts` (`YapAnalyticsEventMap`) —
  every event name and property below is the one actually sent by `track()`.

## 1. Data source and global filter

- **Vendor / host**: PostHog, EU host `https://eu.i.posthog.com`
  (`YAP_POSTHOG_EU_HOST`), project API key `YAP_POSTHOG_API_KEY`
  (placeholder until the project is created). Autocapture and session
  recording stay disabled; the identifier is the anonymous `anonId`
  (`distinct_id = anonId`).
- **Super properties on every event** (see `YapSuperProperties`):
  `anonId`, `shareId`, `language`, `consent`, `version`, `build`, `device`
  (`mobile` | `desktop`), `src`, `internal`, `flags`, plus `$current_url`
  (always fragment-free — the share payload never leaves the device).
- **Global filter for every indicator and funnel below** — the spec computes
  on *"the testers who accepted measurement, excluding internal devices"*:

  ```
  properties.consent = true AND properties.internal = false
  ```

  In HogQL: `WHERE properties.consent = true AND properties.internal = false`.
  (`consent` gating of the send itself is story G2; the property is already
  attached by G1.)
- **Local day**: the spec's "local day" is the calendar day of the event in
  the tester's own timezone. The Gate 1 warm-test cohort is single-timezone,
  so set the **PostHog project timezone to `Europe/Paris`** and use
  `toDate(timestamp)` as the local day. If the cohort ever spans timezones,
  add the device `$timezone` as a super property and use
  `toDateTime(timestamp, $timezone)`.
- **Test data**: until the H5 test week, all dashboards are verified on
  PostHog's *test data* — the worked example in §4 is the reference dataset;
  replay it (e.g. via the mock transport of `tests/unit/analytics.test.ts`
  pointed at the real capture API, or by importing the batch JSON) and check
  each number below.

## 2. Dashboard 1 — "Gate 1 · Five indicators"

Create one PostHog dashboard named **`Gate 1 · Five indicators`** with five
insights (Trends or HogQL), one per indicator. Definitions are quoted from
the spec; kill thresholds are the spec's.

### 2.1 Clarity — kill below 60%

> Share of testers whose first win on T1 comes less than 60 s after its
> `level_start`, without a hint.

Events/properties: `level_start` (`level_id = 't1'`), `attempt_win`
(`level_id = 't1'`, `first_win = true`, `ms_since_level_start < 60000`),
`hint_used` (`level_id = 't1'` — any hint on T1 disqualifies the tester).

- Denominator: distinct `anonId` with a `level_start` on `level_id = 't1'`.
- Numerator: those with an `attempt_win` on `t1` with `first_win = true` and
  `ms_since_level_start < 60000`, and **no** `hint_used` on `t1`.

```sql
-- numerator
SELECT count(DISTINCT distinct_id) FROM events
WHERE event = 'attempt_win'
  AND properties.level_id = 't1'
  AND properties.first_win = true
  AND properties.ms_since_level_start < 60000
  AND properties.consent = true AND properties.internal = false
  AND distinct_id NOT IN (
    SELECT DISTINCT distinct_id FROM events
    WHERE event = 'hint_used' AND properties.level_id = 't1'
  );
-- denominator: same filter with event = 'level_start' AND properties.level_id = 't1'
-- indicator = numerator / denominator
```

### 2.2 Voluntary play — kill below 40%

> Share of testers who, on the local day of their first launch, accumulate at
> least 8 minutes of active time **or** complete the tutorial and the daily
> heist.

Events/properties: `app_open` (`is_first_open = true` → first launch and its
local day `d0 = toDate(timestamp)`), `heartbeat` (`active_ms`, summed per
`anonId` on `d0`; active time counts while foreground with interaction in the
last 30 s), `attempt_win` (`level_id`, `mode`, `day`).

- Denominator: distinct `anonId` with `app_open.is_first_open = true`.
- Numerator: testers where, on `d0`,
  `sum(heartbeat.active_ms) >= 480000` (8 min), **OR**
  they have a win on every express-tutorial level (`t1`, `t2`, `t4`) **and**
  a win on the daily heist of that day (`mode = 'daily'`, `day = d0`'s day
  number).

```sql
WITH first AS (
  SELECT distinct_id, toDate(timestamp) AS d0 FROM events
  WHERE event = 'app_open' AND properties.is_first_open = true
    AND properties.consent = true AND properties.internal = false
),
active AS (
  SELECT f.distinct_id FROM first f JOIN events e
    ON e.distinct_id = f.distinct_id AND e.event = 'heartbeat'
   AND toDate(e.timestamp) = f.d0
  GROUP BY f.distinct_id HAVING sum(e.properties.active_ms) >= 480000
),
full AS (
  SELECT f.distinct_id FROM first f
  WHERE (SELECT count(DISTINCT w.properties.level_id) FROM events w
         WHERE w.event = 'attempt_win' AND w.distinct_id = f.distinct_id
           AND w.properties.level_id IN ('t1','t2','t4')) = 3
    AND EXISTS (SELECT 1 FROM events w WHERE w.event = 'attempt_win'
         AND w.distinct_id = f.distinct_id
         AND w.properties.mode = 'daily' AND w.properties.day = toDayOfYear(f.d0) + 1)
)
SELECT (SELECT count(DISTINCT distinct_id) FROM (SELECT distinct_id FROM active UNION SELECT distinct_id FROM full))
       / (SELECT count(DISTINCT distinct_id) FROM first);
```

(The daily `day` is the 1-based test-day number; map `d0` to it with the
test calendar. The "or" is deliberate: a fast player who clears everything in
6 minutes must not count as bored.)

### 2.3 Retry after failure — kill below 60%

> Share of `attempt_fail` events followed by an `attempt_start` on the same
> level within 2 minutes.

This one is **per event, not per tester**. Events/properties: `attempt_fail`
(`level_id`, `attempt`, `cause`, `tick`), `attempt_start` (`level_id`,
`attempt`).

- Denominator: all `attempt_fail` events.
- Numerator: `attempt_fail` events with an `attempt_start` on the same
  `anonId` and same `level_id` whose timestamp is within
  `(fail.timestamp, fail.timestamp + 2 min]`.

```sql
SELECT
  countIf(e.event = 'attempt_fail') AS fails,
  countIf(e.event = 'attempt_fail' AND EXISTS (
    SELECT 1 FROM events s
    WHERE s.event = 'attempt_start'
      AND s.distinct_id = e.distinct_id
      AND s.properties.level_id = e.properties.level_id
      AND s.timestamp > e.timestamp
      AND s.timestamp <= e.timestamp + INTERVAL 2 MINUTE
  )) AS retried
FROM events e
WHERE e.event = 'attempt_fail'
  AND e.properties.consent = true AND e.properties.internal = false;
-- indicator = retried / fails
```

### 2.4 Spontaneous sharing — kill below 10%

> Share of testers with at least one completed or copied `share_result` during
> the week.

Events/properties: `share_result` (`method` ∈ `native` | `clipboard`,
`outcome` ∈ `completed` | `cancelled` | `error`). "Completed or copied" maps
to `outcome = 'completed'` — which covers both the native share sheet
completed (`method = 'native'`) and the desktop fallback text copied
(`method = 'clipboard'`).

- Denominator: distinct `anonId` with at least one `app_open` in the week.
- Numerator: those with a `share_result` where `outcome = 'completed'`.

```sql
SELECT
  (SELECT count(DISTINCT distinct_id) FROM events
    WHERE event = 'share_result' AND properties.outcome = 'completed'
      AND properties.consent = true AND properties.internal = false)
  /
  (SELECT count(DISTINCT distinct_id) FROM events
    WHERE event = 'app_open'
      AND properties.consent = true AND properties.internal = false);
```

### 2.5 Next-day return — kill below 30%

> Share of testers with an `app_open` on the local day after their first
> launch, among those who arrived before day 7.

Events/properties: `app_open` (`is_first_open = true` → first launch local
day `d0`; any later `app_open` with `toDate(timestamp) = d0 + 1`).

- Denominator: distinct `anonId` whose first-launch local day is before test
  day 7 (`d0 < day 7` of the test calendar).
- Numerator: those with an `app_open` on `d0 + 1`.

```sql
WITH first AS (
  SELECT distinct_id, toDate(timestamp) AS d0 FROM events
  WHERE event = 'app_open' AND properties.is_first_open = true
    AND properties.consent = true AND properties.internal = false
), eligible AS (
  SELECT * FROM first WHERE d0 < toDate('2025-01-07')  -- test day 7, adjust to the test calendar
)
SELECT
  (SELECT count(DISTINCT e.distinct_id) FROM eligible f
     JOIN events e ON e.distinct_id = f.distinct_id AND e.event = 'app_open'
     AND toDate(e.timestamp) = f.d0 + 1)
  / (SELECT count(DISTINCT distinct_id) FROM eligible);
```

## 3. Dashboard 2 — "Gate 1 · Share funnel" and Dashboard 3 — "Gate 1 · Diagnostics"

### 3.1 Share funnel (no threshold — feeds K at gate 2)

Spec steps, mapped to events/properties from `analytics.ts`:

| Step | Event | Filter |
|---|---|---|
| 1. Tap on Share | `share_tapped` | `context` ∈ `win` \| `home` \| `comparison`, `day` |
| 2. Share completed / copied | `share_result` | `outcome = 'completed'` |
| 3. Link opened by another device | `link_opened` | `is_self = false` (i.e. `sender_share_id` ≠ the device's own `shareId`) |
| 4. Challenge accepted | `challenge_cta` | `action = 'play'` |
| 5. Linked heist cleared | `challenge_result` | any (`beat_sender`, `delta_attempts`, `delta_ticks` as breakdown) |
| 6. New active player | computed | ≥ 3 heists won (`attempt_win` with `mode = 'daily'` on ≥ 3 distinct `day`s), **or** an `app_open` on the local day after first launch |

Build it as a PostHog **Funnel insight** on dashboard `Gate 1 · Share
funnel` with steps 1–5 in order (2-minute… no: unbounded window, one week),
then a Trends insight for step 6. The viral coefficient K at gate 2 is
step 6 ÷ step 1 over the same period.

### 3.2 Failure-cause breakdown (no threshold)

Dashboard `Gate 1 · Diagnostics`, insight 1: **Trends** on `attempt_fail`,
breakdown by `properties.cause` (`guard` | `camera` | `laser`), then a second
breakdown by `properties.level_id` — i.e. failure causes per level:

```sql
SELECT toDate(timestamp) AS day, properties.level_id, properties.cause, count()
FROM events
WHERE event = 'attempt_fail'
  AND properties.consent = true AND properties.internal = false
GROUP BY day, properties.level_id, properties.cause ORDER BY day, properties.level_id;
```

### 3.3 Other tracked diagnostics (no threshold)

Same dashboard, one insight each:

- **Attempts per heist**: `attempt_start` count per `level_id` per `anonId`
  (`count() GROUP BY properties.level_id, distinct_id`), plus `attempt` max.
- **Hint usage**: `hint_used` count by `level_id` and `hint_index`
  (hints unlock after 3 then 6 failures on the same heist).
- **Signature vs normal days**: `attempt_win` / `attempt_fail` on
  `mode = 'daily'` grouped by `day`, flagging the signature days **D3, D5,
  D7** (hand-made heists) vs the normal days D1, D2, D4, D6 — compare
  attempts, ticks vs `par`, and `stars`.
- **Streak**: `streak_day` (`streak`) distribution; **session length**:
  `heartbeat` `active_ms` sums per local day; **errors**: `error` by
  `scene`.

## 4. Worked example on test data

Reference dataset (10 synthetic testers, all events carrying
`consent`/`internal` super properties; times are Europe/Paris local):

| anonId | consent | internal | first launch | T1 first win | hint on T1 | active ms on day 1 of launch | tutorial+daily done that day | fails → retry ≤ 2 min | share_result completed | app_open next local day |
|---|---|---|---|---|---|---|---|---|---|---|
| anon-01 | true | false | day 1 | 45 s | no | 540 000 | no (but ≥ 8 min) | 1 fail → +90 s ✓ | yes | yes |
| anon-02 | true | false | day 1 | 120 s | no | 300 000 | yes | 1 fail → none ✗ | no | yes |
| anon-03 | true | false | day 2 | 30 s | **yes** | 200 000 | no | 1 fail → +60 s ✓ | no (cancelled) | yes |
| anon-04 | true | false | day 3 | 50 s | no | 600 000 | no (but ≥ 8 min) | 1 fail → +5 min ✗ | yes (clipboard) | no |
| anon-05 | true | false | day 6 | 55 s | no | 480 000 | no (but = 8 min) | 1 fail → +30 s ✓ | no (error) | yes |
| anon-06 | true | false | day 8 | 70 s | no | 100 000 | no | 1 fail → +10 s ✓ | yes | yes (excluded from ind. 5) |
| anon-07 | true | **true** | day 1 | — | — | — | — | — | — | — (excluded: internal) |
| anon-08 | **false** | false | day 1 | — | — | — | — | — | — | — (excluded: no consent) |
| anon-09 | true | false | day 1 | 40 s | no | 200 000 | yes | 1 fail → +119 s ✓ | yes | yes |
| anon-10 | true | false | day 4 | 59 s | no | 470 000 | no | no fails | no | yes |

Computed indicators (eligible testers = 8: anon-01…06, 09, 10):

1. **Clarity** = 5 (anon-01, 04, 05, 09, 10) / 8 who started T1 = **62.5%** ≥ 60% → pass.
2. **Voluntary play** = 5 (anon-01, 02, 04, 05, 09) / 8 = **62.5%** ≥ 40% → pass.
3. **Retry after failure** = 5 retried (anon-01, 03, 05, 06, 09) / 7 fails = **71.4%** ≥ 60% → pass.
4. **Spontaneous sharing** = 4 (anon-01, 04, 06, 09) / 8 active in the week = **50%** ≥ 10% → pass.
5. **Next-day return** = 6 (anon-01, 02, 03, 05, 09, 10) / 7 arrived before day 7 (anon-06 arrived day 8, excluded) = **85.7%** ≥ 30% → pass.

Share funnel on the same dataset: `share_tapped` 20 → `share_result`
`outcome = 'completed'` 8 → `link_opened` `is_self = false` 5 →
`challenge_cta` `action = 'play'` 3 → `challenge_result` 2 → new active
players 2.

Failure causes on the same dataset: `attempt_fail` by `level_id` × `cause` —
e.g. `d1`: guard ×3, camera ×1; `t2`: guard ×2; `d3`: laser ×1 — read off the
Diagnostics dashboard, no threshold.

## 5. Rebuild in one click

1. Create the PostHog project on the EU host (`https://eu.i.posthog.com`),
   paste `YAP_POSTHOG_API_KEY` into `src/app/analytics.ts`, set the project
   timezone to `Europe/Paris`, keep autocapture and session recording off.
2. Create three dashboards: **`Gate 1 · Five indicators`** (§2, five HogQL
   insights), **`Gate 1 · Share funnel`** (§3.1, funnel + trends), and
   **`Gate 1 · Diagnostics`** (§3.2–3.3).
3. Add the global filter `properties.consent = true AND
   properties.internal = false` to every insight.
4. Load the §4 test dataset (batch JSON in the `YapPostHogTransport` format:
   `event`, `distinct_id`, `timestamp`, `properties`) and check each insight
   against the §4 numbers.

Privacy reminders from the spec: no personal data, the nickname only travels
inside links the player shares themselves, `$current_url` is always
fragment-free, and the data is deleted at the end of gate 2.
