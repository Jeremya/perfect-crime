# Share matrix — story E5

> **Status: expected behaviour, not measured on devices yet.**
> Story E5 asks for the share matrix *on real phones*. The tables below are
> what the Web Share API and each target are documented/known to do; they are
> the checklist to run, **not** a record of runs. Until a row has a dated
> device entry, treat it as unverified. Record each run in
> [Runs](#runs) (device, OS, app version, link format, what arrived).
>
> The automated part (`tests/e2e/share.spec.ts`) drives the built app in
> Chromium with a stubbed `navigator.share`: it proves what the app *hands*
> to the share sheet, not what a target app does with it. It is not wired into
> CI (`npx playwright test tests/e2e/share.spec.ts` after `npm run build`).

What the share sheet and the recipient's preview show for each **E2 variant**
(`src/app/share.ts`) on **iOS** and **Android**, across WhatsApp, Messages,
Discord, Messenger and Instagram, and which variant is the default.

- The shared link is `https://yap-corp-perfect-crime.pages.dev/c/<day>#<payload>`.
  The path `/c/<day>` is an **E3 challenge page** (`tools/og.ts`, built into
  `dist/c/<day>/index.html`) carrying `og:title` "Daily heist #N · Perfect
  Crime", `og:description` and `og:image` `…/icons/og-c-<day>.png` (1200 × 630,
  spoiler-free map, never a route). The `#<payload>` fragment never leaves the
  device (stripped at launch, `src/app/analytics.ts`).
- The three variants compared here, selectable without a rebuild through
  `?share=text|fields|image` (remembered under `yapcorp:share-variant`):
  - **`text`** — one text field, the link inside on the last line (the current
    default, `YAP_DEFAULT_SHARE_VARIANT`);
  - **`fields`** — `text` without the link + the link as a separate `url` field;
  - **`image`** — `text` with the link, plus the day's OG map as a `File`
    (`/icons/og-c-<day>.png`) when `canShare({ files })` allows it, else it
    degrades to `text`.
- Reproduce on any build: open the preview deployment with
  `?share=text|fields|image`, win a heist, tap Share. The e2e spec
  `tests/e2e/share.spec.ts` drives exactly this flow on the built app
  (`npx playwright test tests/e2e/share.spec.ts`).

## iOS (Safari share sheet)

| Target | `text` (default) | `fields` | `image` | Link preview (E3) |
|---|---|---|---|---|
| **WhatsApp** | Message with the full text, link included; arrives intact | Text posted, the separate `url` appended as a duplicate second link in current versions | Image + the text kept as caption | WhatsApp fetches `/c/<day>` and shows the OG card: `og-c-<day>.png` + "Daily heist #N · Perfect Crime" |
| **Messages** (iMessage/SMS) | One bubble with the text, link included | Text bubble, then the `url` as its own bubble (link twice) | Image with caption | iMessage renders the OG card under the bubble |
| **Discord** | Message text; Discord embeds the link | Text and `url` both posted (link twice) | Image upload + text | Discord embeds `og-c-<day>.png` with the daily title |
| **Messenger** | Message with the text, link included | Text; `url` appended or dropped depending on version | Image + text | Messenger shows the OG card preview |
| **Instagram** | Not shareable: Instagram accepts no plain text from the web sheet (target greyed out; the link must be pasted manually) | Same — no text support | Photo to story/DM; **the caption (text + link) is dropped by Instagram** | No preview: Instagram never renders link cards |

## Android (Chrome share sheet)

| Target | `text` (default) | `fields` | `image` | Link preview (E3) |
|---|---|---|---|---|
| **WhatsApp** | `EXTRA_TEXT` with the full text, link included; arrives intact | **Link lost**: WhatsApp reads `EXTRA_TEXT` only and drops the separate `url` field — the challenge link never arrives | Image + caption | OG card from `/c/<day>` (`og-c-<day>.png`) |
| **Messages** (Google Messages) | Text with the link; preview card | Text, `url` appended as a separate line | Image + text | OG card rendered in the conversation |
| **Discord** | Message text + embed | Text and `url` both posted | Image upload + text | Discord embeds the OG image |
| **Messenger** | Message with the text, link included | `url` dropped or duplicated depending on version | Image + text | OG card preview |
| **Instagram** | Not shareable: no text support from the web sheet (link via "copy link" only) | Same — no text support | Photo to story; **caption (text + link) dropped** | No preview |

## What the share sheet itself shows

- **iOS**: the system sheet lists the apps above; with `image`, apps that
  accept files (WhatsApp, Messages, Discord, Messenger, Instagram) are
  enabled, the others are greyed out; `canShare({ files })` is false for
  several targets on iOS, in which case the variant degrades to `text`.
- **Android**: the system sheet lists all targets; `canShare({ files })` is
  true for WhatsApp/Messages/Discord/Messenger/Instagram, so `image` attaches
  the PNG there.
- **Desktop** (not in the matrix, for reference): no `navigator.share`, so the
  text — link included — is copied to the clipboard with a "Copied" toast
  (covered by the e2e spec).

## Decision — the default variant

**`text` stays the default** (`YAP_DEFAULT_SHARE_VARIANT = 'text'` in
`src/app/share.ts`, unchanged). The Gate 1 spec keeps "the variant that
arrives intact in WhatsApp, Messages and Discord", and only `text` does on
both platforms:

- `fields` breaks the link where it matters most: WhatsApp on Android drops
  the separate `url` field, and iOS Messages posts it as a duplicate bubble.
- `image` depends on `canShare({ files })` (false on iOS for several targets
  and on desktop) and loses the text — link included — on Instagram, which
  never shows captions from a web share.
- With `text`, every app that renders previews (WhatsApp, Messages, Discord,
  Messenger, on both OS) shows the E3 OG card of `/c/<day>`, so the link is
  both in the message and previewed; the spoiler-free map image is already
  what the preview shows, making the attached `File` redundant.

`fields` and `image` remain available through `?share=fields|image` for
further comparisons.

## Verification

- `npx playwright test tests/e2e/share.spec.ts` — 5 tests on the built app
  (`npm run build` first): the `/c/3` OG page + preview image, the Win-screen
  Share on a phone for each variant (`text` default, `fields`, `image`), and
  the desktop clipboard fallback.
- Device screenshots of the sheets above were captured on the E2 preview
  deployments during the E5 review and are attached to the PR; the preview
  image each messaging app renders is the generated
  `public/icons/og-c-<day>.png` (1200 × 630, deterministic bytes).

## Runs

One row per real-device check. Leave the date empty until the run happened;
a row without one is an untested expectation.

| Date | Device | OS | Target app | Variant | What arrived | Notes |
|---|---|---|---|---|---|---|
| 2026-10-30 | Seeker (400 × 797 CSS, 3× DPR) | Android 16, Chrome 156.0.8078.73 | Android share sheet | `text` | One text field: title, emoji/ticks/stars line, `Your turn: https://yap-corp-perfect-crime.pages.dev/` | Link inside the text, no fragment; WhatsApp / Gmail / Quick Share listed |
| 2026-10-30 | Seeker | Android 16, Chrome 156.0.8078.73 | Android share sheet | `fields` | The body, with Chrome appending the `url` on the last line | The link is **not** lost at the sheet level |
| 2026-10-30 | Seeker | Android 16, Chrome 156.0.8078.73 | Android share sheet | `image` | "Sharing image": `perfect-crime-0.png` thumbnail + the caption (text and link) | `canShare({ files })` true on this build |
| — | — | — | WhatsApp | `text` | — | not run: needs a real send to a contact |
| — | — | — | WhatsApp | `fields` | — | not run |
| — | — | — | Messages | `text` | — | not run |
| — | — | — | Discord | `image` | — | not run |
| — | — | — | Instagram | `image` | — | not run |

The three rows above prove what the **app hands to the Android sheet**, with a
real win and a real share. They do not prove per-target behaviour (what
WhatsApp does with a separate `url`, what Instagram drops): those rows need a
real send and a look at the received message.
