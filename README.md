# Feather Scope Pro - blueprint check (static site)

A one-page check of the Feather Scope Pro FlutterFlow blueprint (45 pages, Feather Lady Cleaning LLC). It runs the rules that are easy to get wrong - the reminder and the 24-hour cancellation window, gift-card sell and redeem, text-message length, paid hours, quotes - using the blueprint's own numbers and test plan.

No build step. Plain HTML, CSS and ES modules; fonts are self-hosted (OFL).

## Run locally

```
npx --yes serve@14 -l 3000 .
```

Open http://localhost:3000. The page fetches `data/results.json`, so it needs a server; opening the file directly will not load the results strip.

## Deploy

Vercel, as a static site: `vercel.json` sets `framework: null`, no build command, output `.`, and an `X-Robots-Tag: noindex, nofollow` header on every path. The page also carries a `noindex, nofollow` meta tag.

## Files

- `index.html`, `style.css`, `app.mjs` - the page
- `engine/` - the shared rules (time zones, reminders, cancellation, SMS segments, gift cards, quotes, hours, referrals, badge, money, recurring jobs). Byte-for-byte the same files the Cloud Functions use.
- `data/findings.mjs` - the 28 findings with blueprint page numbers
- `data/results.json` - test and measurement results, written by `tools/run-all.mjs` in the kit
- `fonts/` - Bricolage Grotesque and Atkinson Hyperlegible (SIL Open Font License, licence files included)

## Measured

Numbers come from `data/results.json` (generated 2026-11-13, Node 22.23.4):

- 31 of 31 engine tests pass (hours, quotes, cancellation, SMS, gift cards, referrals, badge, money, recurring jobs).
- 20 of 20 Cloud Function tests pass against hidane 0.7.0, a third-party Java-free Firestore emulator: reminders (Jean test, two concurrent runs, a second business in another time zone, a failed text retried), arrival nudge at +1 minute, recurring jobs, upsell approval with 25 concurrent syncs, gift-card create / redeem / check, Stripe webhook signature and replay, autopay success and decline, review ask, overdue sweep, quote auto-reply, the scope page.
- 31 of 31 deliberately planted bugs are caught by those tests (18 in the rules, 13 in the functions).
- A 6 PM day-before reminder gives a 9 AM clean 15 hours' notice; every clean before 6 PM is inside the 24-hour window.
- A "tomorrow" taken from the server's UTC clock picks the wrong day on 127 of 365 evenings in 2026 and in 2027 - every evening on Central standard time.
- The reminder text is 245 characters: 2 SMS segments in GSM-7; 4 segments if one apostrophe or dash is a curly / long one (UCS-2).
- 1,000,000 gift codes drawn from the 31-character alphabet: 583 repeats against 563.4 expected (a fair draw lands within about ±47 of that). At 10,000 cards the chance of at least one repeat is 5.5%, which is why a code is saved with an atomic create.
- Browser checks: 43 of 43 pass (Chromium, desktop 1360 px and phone 390 px), including axe with no serious or critical issues and no sideways scrolling on the phone.

## Not measured

- Firestore Security Rules: written (`rules/firestore.rules` in the kit) with a test file for two businesses, **not run**. Google's Firestore emulator could not be downloaded in the build environment, and hidane does not support rules yet.
- No FlutterFlow screens were built; the page checks the logic the screens and functions call.
- No real texts, card charges or app-store review. Twilio and Stripe were replaced by test doubles; webhook signatures were generated and checked with Stripe's own Node library, offline.
- The add-on and upsell prices on the page are placeholders - the blueprint does not give them.
- Page numbers refer to the PDF as supplied; if the blueprint is re-exported they may shift.
