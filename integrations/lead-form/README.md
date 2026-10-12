# A-1 confirmed request form

The website embeds a Google Apps Script form, saves confirmed requests in the private A-1 Website Service Requests sheet, and sends notifications to A1INSULATIONAIRDFW@GMAIL.COM. `generate_lead` is sent to GA4 G-NMW5L7QPZ6 only after a confirmed save; no customer fields or request IDs are sent to GA4. It is marked as a key event. The original Google Form remains available as fallback and is not included in this new submission tracking.

All five pages load assets/lead-form-config.js and assets/lead-form.js. The public endpoint is in the config. No secrets belong in the repo. If loading fails, the old embedded form remains usable. Set endpoint to an empty string to disable the new form.

Google project: https://script.google.com/home/projects/1Z4tkW0r5xQqlbFCj-jsueFgeQFTe-GLwvMw8Av8EWyZlSPgk2B7pfv7o/edit

Private sheet: https://docs.google.com/spreadsheets/d/1Gco4CKI3rCttBXbuEA8uJjxbjtqbN6dcghqJKlL4q6I/edit

Apps Script runs as the business account and allows anonymous form submissions; it does not expose a reader for the sheet. Setup and email-retry functions end in underscores to keep them inaccessible to browser callers. Deploy new versions through Manage deployments when changing service code. Properties hold the sheet ID, token secret, recipient and daily counter. Basic abuse controls include signed expiring tokens, validation, a honeypot, and a cap of 100 saved requests per Chicago calendar day.

Notification failures leave saved requests with Pending email status, retried every ten minutes. MailApp quotas and inbox filtering apply. A rare retry can duplicate email if the send succeeded before the Sent status was stored. The sheet is the durable record.

UTM labels, external referrer hostname, and landing path are saved as visitor-supplied context, not verified GA4 attribution. Context lasts for the current tab session, which is not an exact GA4 session. Consent, blockers and closing the page can prevent an Analytics event without losing a saved request. Old Google Form responses cannot be retroactively matched to the new event.

Tests: node --test integrations/lead-form/lead-form.test.cjs

Live validation on October 12, 2026: signed-in website embed and confirmation passed, the labeled test row was saved, the notification appeared in business Gmail Inbox, and exactly one generate_lead event appeared in GA4 Realtime. The tests are labeled TEST ONLY and should not be counted as customer leads. Mobile layout and production page rollout must also be verified before treating deployment as complete.
